#!/usr/bin/env python3
"""List Codex + Claude Code conversations for configured projects (incl. worktrees).

Usage:
    list_conversations.py [--config PATH] [--state PATH] [--since ISO8601]
                          [--project NAME] [--source codex|claude]
                          [--update-state] [--limit N] [--full-prompt]

Output: one JSON object per line, sorted oldest -> newest.

Each record:
    {
      "source": "codex" | "claude",
      "project": "<config name>",
      "conversation_id": "<id>",
      "started_at": "<ISO timestamp>",
      "cwd": "<absolute path>",
      "file_path": "<absolute jsonl path>",
      "git_branch": "<branch or null>",
      "first_user_prompt": "<truncated unless --full-prompt>"
    }

State file is per-project, per-source, storing the last `started_at` seen.
Pass --update-state to advance the cursor after a successful run.
"""

from __future__ import annotations

import argparse
import fnmatch
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

DEFAULT_FIRST_RUN_DAYS = 7

HOME = Path.home()
CODEX_SESSIONS = HOME / ".codex" / "sessions"
CODEX_ARCHIVED = HOME / ".codex" / "archived_sessions"
CLAUDE_PROJECTS = HOME / ".claude" / "projects"

SKIP_PROMPT_PREFIXES = (
    "# AGENTS.md",
    "<user_instructions>",
    "<environment_context>",
    "<system-reminder>",
    "<ide_opened_files>",
    "<command-message>",
    "<command-name>",
    "<local-command-stdout>",
    "<turn_aborted>",
    "Caveat: The messages below were generated",
)


def parse_args():
    p = argparse.ArgumentParser()
    here = Path(__file__).resolve().parent.parent
    p.add_argument("--config", default=str(here / "config.json"))
    p.add_argument("--state", default=str(here / "state" / "state.json"))
    p.add_argument("--since", help="ISO8601 cutoff; overrides state file and first-run-days")
    p.add_argument(
        "--first-run-days",
        type=int,
        default=DEFAULT_FIRST_RUN_DAYS,
        help=f"When the state file has no cursor for a project/source, default to looking back "
             f"this many days instead of scanning all history. Default: {DEFAULT_FIRST_RUN_DAYS}. "
             f"Pass 0 to scan everything.",
    )
    p.add_argument("--project", help="Filter to a single project name")
    p.add_argument("--source", choices=["codex", "claude"], help="Filter source")
    p.add_argument("--limit", type=int, default=0, help="Truncate output to N records")
    p.add_argument("--update-state", action="store_true",
                   help="Advance state cursors based on this run's results")
    p.add_argument("--full-prompt", action="store_true",
                   help="Emit untruncated first_user_prompt")
    return p.parse_args()


def load_json(path: str, default):
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def save_json(path: str, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def match_project(cwd: str, projects: list[dict]) -> str | None:
    """Return project name whose root patterns match this cwd."""
    for proj in projects:
        for root in proj["roots"]:
            if cwd == root or cwd.startswith(root.rstrip("/") + "/"):
                return proj["name"]
            if "*" in root and fnmatch.fnmatch(cwd, root) or \
               "*" in root and fnmatch.fnmatch(cwd, root.rstrip("/") + "/*"):
                return proj["name"]
    return None


def extract_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for c in content:
            if isinstance(c, dict) and c.get("type") in ("input_text", "text", "output_text"):
                parts.append(c.get("text", ""))
        return "\n".join(parts)
    return ""


def looks_synthetic(text: str) -> bool:
    s = text.lstrip()
    if any(s.startswith(p) for p in SKIP_PROMPT_PREFIXES):
        return True
    if s.startswith("<") and s.endswith(">") and "\n" not in s[:200]:
        return True
    return False


# --- Codex ---

def iter_codex_files():
    for root in (CODEX_SESSIONS, CODEX_ARCHIVED):
        if not root.exists():
            continue
        for fp in root.rglob("rollout-*.jsonl"):
            yield fp


def parse_codex_session(fp: Path):
    """Return dict or None. Reads only as far as needed (meta line + first real user msg)."""
    meta_cwd = meta_ts = meta_id = git_branch = None
    first_prompt = None
    try:
        with open(fp, errors="replace") as f:
            for line in f:
                try:
                    d = json.loads(line, strict=False)
                except Exception:
                    continue
                p = d.get("payload") or {}
                if meta_cwd is None and isinstance(p, dict) and p.get("cwd"):
                    meta_cwd = p["cwd"]
                    meta_ts = p.get("timestamp") or d.get("timestamp")
                    meta_id = p.get("id", "")
                    git_branch = (p.get("git") or {}).get("branch")
                if first_prompt is None:
                    txt = ""
                    if isinstance(p, dict) and p.get("type") == "message" and p.get("role") == "user":
                        txt = extract_text(p.get("content"))
                    elif d.get("type") == "event_msg" and isinstance(p, dict) and p.get("type") == "user_message":
                        txt = p.get("message", "")
                    if txt and not looks_synthetic(txt):
                        first_prompt = txt
                if meta_cwd and first_prompt:
                    break
    except Exception:
        return None
    if not meta_cwd or not meta_ts:
        return None
    return {
        "source": "codex",
        "conversation_id": meta_id,
        "started_at": meta_ts,
        "cwd": meta_cwd,
        "file_path": str(fp),
        "git_branch": git_branch,
        "first_user_prompt": first_prompt or "",
    }


# --- Claude Code ---
# Claude Code stores sessions in two formats inside ~/.claude/projects/<encoded-path>/:
#   1. <session-uuid>.jsonl  (older / current main transcript)
#   2. sessions-index.json   (newer index; survives even after the .jsonl is archived)
# We read both and dedupe by sessionId.

def iter_claude_records():
    """Yield (source_kind, payload) tuples to be parsed into records.

    source_kind is 'jsonl' (path) or 'index' (dict entry).
    """
    if not CLAUDE_PROJECTS.exists():
        return
    for proj_dir in CLAUDE_PROJECTS.iterdir():
        if not proj_dir.is_dir():
            continue
        # Index first (cheaper, more complete)
        idx = proj_dir / "sessions-index.json"
        if idx.exists():
            try:
                with open(idx) as f:
                    data = json.load(f)
                for entry in data.get("entries", []):
                    yield ("index", entry)
            except Exception:
                pass
        # Then any .jsonl files (some may not be in the index, or index may be absent)
        for fp in proj_dir.glob("*.jsonl"):
            yield ("jsonl", fp)


def parse_claude_index_entry(entry: dict):
    cwd = entry.get("projectPath") or entry.get("cwd")
    if not cwd:
        return None
    sid = entry.get("sessionId") or ""
    ts = entry.get("created") or entry.get("modified")
    if not ts:
        return None
    prompt = entry.get("firstPrompt") or entry.get("summary") or ""
    if looks_synthetic(prompt):
        # index sometimes captures the ide_opened_file shim; fall back to summary
        prompt = entry.get("summary") or prompt
    fp = entry.get("fullPath") or ""
    return {
        "source": "claude",
        "conversation_id": sid,
        "started_at": ts if ts.endswith("Z") else ts,
        "cwd": cwd,
        "file_path": fp,
        "git_branch": entry.get("gitBranch"),
        "first_user_prompt": prompt or "",
    }


def parse_claude_session(fp: Path):
    """Read jsonl until we have cwd + first user prompt."""
    cwd = ts = sid = git_branch = None
    first_prompt = None
    try:
        with open(fp, errors="replace") as f:
            for i, line in enumerate(f):
                if i > 200 and cwd and first_prompt:
                    break
                try:
                    d = json.loads(line, strict=False)
                except Exception:
                    continue
                if cwd is None and isinstance(d, dict) and d.get("cwd"):
                    cwd = d["cwd"]
                    ts = d.get("timestamp")
                    sid = d.get("sessionId") or fp.stem
                    git_branch = d.get("gitBranch")
                if first_prompt is None and d.get("type") == "user":
                    msg = d.get("message") or {}
                    if isinstance(msg, dict) and msg.get("role") == "user":
                        txt = extract_text(msg.get("content"))
                        if txt and not looks_synthetic(txt):
                            first_prompt = txt
                            if not ts:
                                ts = d.get("timestamp")
                if cwd and first_prompt:
                    break
    except Exception:
        return None
    if not cwd or not ts:
        return None
    return {
        "source": "claude",
        "conversation_id": sid or fp.stem,
        "started_at": ts,
        "cwd": cwd,
        "file_path": str(fp),
        "git_branch": git_branch,
        "first_user_prompt": first_prompt or "",
    }


# --- main ---

def main():
    args = parse_args()
    config = load_json(args.config, None)
    if not config or "projects" not in config:
        sys.exit(f"config not found or invalid: {args.config}")
    projects = config["projects"]
    if args.project:
        projects = [p for p in projects if p["name"] == args.project]
        if not projects:
            sys.exit(f"unknown project: {args.project}")

    state = load_json(args.state, {"projects": {}})
    # cursors[project][source] = last started_at seen
    cursors = state.setdefault("projects", {})

    sources = ["codex", "claude"] if not args.source else [args.source]
    results = []
    seen_ids: set[tuple[str, str]] = set()

    # Exclude the currently-executing Claude Code session so a run that lives
    # under a watched project doesn't pull and analyze its own in-flight
    # transcript (which yields a partial, misleading view of itself).
    current_claude_session = os.environ.get("CLAUDE_CODE_SESSION_ID") or ""

    first_run_cutoff = None
    if args.first_run_days > 0:
        first_run_cutoff = (
            datetime.now(timezone.utc) - timedelta(days=args.first_run_days)
        ).isoformat().replace("+00:00", "Z")

    def consider(rec, src):
        if not rec:
            return
        proj_name = match_project(rec["cwd"], projects)
        if not proj_name:
            return
        if src == "claude" and current_claude_session and rec["conversation_id"] == current_claude_session:
            return
        rec["project"] = proj_name
        key = (src, rec["conversation_id"])
        if key in seen_ids:
            return
        seen_ids.add(key)
        # Precedence: --since > stored cursor > first-run window (only when no cursor yet)
        cursor = cursors.get(proj_name, {}).get(src)
        cutoff = args.since or cursor or first_run_cutoff
        if cutoff and rec["started_at"] <= cutoff:
            return
        results.append(rec)

    if "codex" in sources:
        for fp in iter_codex_files():
            consider(parse_codex_session(fp), "codex")

    if "claude" in sources:
        for kind, payload in iter_claude_records():
            if kind == "index":
                consider(parse_claude_index_entry(payload), "claude")
            else:
                consider(parse_claude_session(payload), "claude")

    results.sort(key=lambda r: r["started_at"])

    if args.limit:
        results = results[-args.limit:]

    for rec in results:
        out = dict(rec)
        if not args.full_prompt:
            prompt = out["first_user_prompt"]
            out["first_user_prompt"] = re.sub(r"\s+", " ", prompt).strip()[:240]
        print(json.dumps(out, ensure_ascii=False))

    if args.update_state and results:
        for rec in results:
            cursors.setdefault(rec["project"], {})
            prev = cursors[rec["project"]].get(rec["source"])
            if not prev or rec["started_at"] > prev:
                cursors[rec["project"]][rec["source"]] = rec["started_at"]
        state["projects"] = cursors
        state["last_run_at"] = datetime.utcnow().isoformat() + "Z"
        save_json(args.state, state)

    print(f"# {len(results)} records", file=sys.stderr)


if __name__ == "__main__":
    main()
