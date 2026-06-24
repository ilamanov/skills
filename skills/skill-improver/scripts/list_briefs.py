#!/usr/bin/env python3
"""List recently-generated brief HTMLs (.briefs/*.html) across configured projects.

The `brief` skill produces visual one-pager HTMLs in each project's `.briefs/`
directory. This script discovers those files across all configured project
roots (including worktrees), filters by an mtime cursor so each run only sees
new briefs, and emits one JSON record per brief.

Usage:
    list_briefs.py [--config PATH] [--state PATH] [--since ISO8601]
                   [--project NAME] [--mode draft|final]
                   [--first-run-days N] [--limit N] [--update-state]

Output: one JSON object per line, sorted oldest -> newest.

Each record:
    {
      "project": "<config name>",
      "file_path": "<absolute html path>",
      "mtime": "<ISO timestamp>",
      "mode": "draft" | "final" | "unknown",
      "slug": "<derived from filename>",
      "size_bytes": <int>,
      "worktree": "<parent of .briefs/ — the repo/worktree root>"
    }

State file (separate from conversations state) is per-project, storing the
last brief mtime seen. Pass --update-state to advance after a successful run.
"""

from __future__ import annotations

import argparse
import fnmatch
import glob
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

DEFAULT_FIRST_RUN_DAYS = 14  # briefs are generated less often than conversations

BRIEF_FILENAME_RE = re.compile(r"^(draft|final)-brief-(.+)\.html$", re.IGNORECASE)


def parse_args():
    p = argparse.ArgumentParser()
    here = Path(__file__).resolve().parent.parent
    p.add_argument("--config", default=str(here / "config.json"))
    p.add_argument("--state", default=str(here / "state" / "briefs-state.json"))
    p.add_argument("--since", help="ISO8601 cutoff; overrides state file and first-run-days")
    p.add_argument(
        "--first-run-days",
        type=int,
        default=DEFAULT_FIRST_RUN_DAYS,
        help=f"When the state file has no cursor for a project, default to looking back "
             f"this many days. Default: {DEFAULT_FIRST_RUN_DAYS}. Pass 0 to scan everything.",
    )
    p.add_argument("--project", help="Filter to a single project name")
    p.add_argument("--mode", choices=["draft", "final"], help="Filter by brief mode")
    p.add_argument("--limit", type=int, default=0, help="Truncate output to N records")
    p.add_argument("--update-state", action="store_true",
                   help="Advance state cursors based on this run's results")
    p.add_argument("--from-batch", metavar="PATH",
                   help="With --update-state, advance cursors to the newest mtime per project "
                        "found in this JSONL batch file (the Step 3b output) instead of "
                        "re-discovering live. Use this so briefs that arrive between the pull "
                        "and the cursor-advance aren't skipped — the cursor should only move "
                        "past what was actually audited.")
    return p.parse_args()


def load_json(path: str, default):
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def local_state_path(state_path: str) -> str:
    """Path to the local floor cursor (advances every run regardless of merge).
    Anchored under the user's home so it survives the fresh worktree the scheduler
    spawns per run. Mirrors the same mechanism in list_conversations.py."""
    base = os.path.basename(state_path)
    name = base[:-len(".json")] if base.endswith(".json") else base
    return os.path.join(
        os.path.expanduser("~/.claude/skill-improver"), name + ".local.json"
    )


def save_json(path: str, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def expand_roots(roots: list[str]) -> list[str]:
    """Resolve glob patterns in project roots to actual directories that exist."""
    out: list[str] = []
    for root in roots:
        if "*" in root:
            for match in glob.glob(root):
                if os.path.isdir(match):
                    out.append(os.path.abspath(match))
        else:
            if os.path.isdir(root):
                out.append(os.path.abspath(root))
    return out


def iso_z(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def parse_iso(s: str | None) -> datetime | None:
    if not s:
        return None
    try:
        # Handle both naive and Z-suffixed timestamps.
        s2 = s.replace("Z", "+00:00") if s.endswith("Z") else s
        dt = datetime.fromisoformat(s2)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def discover_briefs(project_name: str, roots: list[str]):
    """Yield (file_path, mtime_dt, worktree_root) for every .briefs/*.html under any root."""
    seen: set[str] = set()
    for root in expand_roots(roots):
        briefs_dir = os.path.join(root, ".briefs")
        if not os.path.isdir(briefs_dir):
            continue
        for entry in os.scandir(briefs_dir):
            if not entry.is_file() or not entry.name.endswith(".html"):
                continue
            fp = os.path.abspath(entry.path)
            if fp in seen:
                continue
            seen.add(fp)
            try:
                st = entry.stat()
            except OSError:
                continue
            mtime = datetime.fromtimestamp(st.st_mtime, tz=timezone.utc)
            yield fp, mtime, root, st.st_size


def classify(filename: str) -> tuple[str, str]:
    m = BRIEF_FILENAME_RE.match(filename)
    if not m:
        return "unknown", os.path.splitext(filename)[0]
    return m.group(1).lower(), m.group(2)


def main():
    args = parse_args()
    config = load_json(args.config, {"projects": []})
    state = load_json(args.state, {"projects": {}, "last_run_at": None})
    # See list_conversations.py for the rationale: the tracked cursor only lands on
    # main when a run's PR merges, so a local floor cursor (advanced every run) keeps
    # closed PRs from causing re-audits of already-seen briefs.
    local_state = load_json(local_state_path(args.state), {"projects": {}, "last_run_at": None})

    project_filter = args.project
    mode_filter = args.mode

    since_override = parse_iso(args.since)
    first_run_cutoff: datetime | None = None
    if args.first_run_days > 0:
        first_run_cutoff = datetime.now(timezone.utc) - timedelta(days=args.first_run_days)

    records: list[dict] = []
    new_max_per_project: dict[str, datetime] = {}

    for proj in config.get("projects", []):
        name = proj["name"]
        if project_filter and name != project_filter:
            continue

        proj_state = state.get("projects", {}).get(name, {})
        local_proj_state = local_state.get("projects", {}).get(name, {})
        cursor_candidates = [
            c for c in (parse_iso(proj_state.get("last_mtime")),
                        parse_iso(local_proj_state.get("last_mtime"))) if c
        ]
        cursor = max(cursor_candidates) if cursor_candidates else None

        effective_cutoff = since_override or cursor or first_run_cutoff

        for fp, mtime, worktree, size in discover_briefs(name, proj["roots"]):
            if effective_cutoff and mtime <= effective_cutoff:
                continue
            mode, slug = classify(os.path.basename(fp))
            if mode_filter and mode != mode_filter:
                continue
            records.append({
                "project": name,
                "file_path": fp,
                "mtime": iso_z(mtime),
                "mode": mode,
                "slug": slug,
                "size_bytes": size,
                "worktree": worktree,
            })
            prev = new_max_per_project.get(name)
            if prev is None or mtime > prev:
                new_max_per_project[name] = mtime

    records.sort(key=lambda r: r["mtime"])
    if args.limit:
        records = records[: args.limit]

    for r in records:
        sys.stdout.write(json.dumps(r) + "\n")

    if args.update_state:
        # Advance only to what was actually audited. Re-discovering live here would
        # sweep up briefs written between the Step 3b pull and now, moving the cursor
        # past them even though no one audited them. When the caller hands us the
        # audited batch, key the cursor off that; otherwise fall back to this scan.
        advance_max = new_max_per_project
        if args.from_batch:
            advance_max = {}
            with open(args.from_batch) as fh:
                for line in fh:
                    if not line.strip():
                        continue
                    rec = json.loads(line)
                    name, mt = rec.get("project"), parse_iso(rec.get("mtime"))
                    if not name or mt is None:
                        continue
                    prev = advance_max.get(name)
                    if prev is None or mt > prev:
                        advance_max[name] = mt
        now = iso_z(datetime.now(timezone.utc))
        projects_state = state.setdefault("projects", {})
        local_projects_state = local_state.setdefault("projects", {})
        for name, mt in advance_max.items():
            iso = iso_z(mt)
            projects_state.setdefault(name, {})["last_mtime"] = iso
            # Local floor cursor: only ever moves forward, advances regardless of merge.
            lprev = parse_iso(local_projects_state.get(name, {}).get("last_mtime"))
            if lprev is None or mt > lprev:
                local_projects_state.setdefault(name, {})["last_mtime"] = iso
        state["last_run_at"] = now
        save_json(args.state, state)
        local_state["last_run_at"] = now
        save_json(local_state_path(args.state), local_state)


if __name__ == "__main__":
    main()
