---
name: session-atlas
description: >
  Map every Codex and Claude Code session for a project to the git worktrees
  they ran in, in an interactive local UI. Use whenever someone wants to see,
  search, audit, or clean up past AI coding-agent conversations and the
  worktrees those ran in — e.g. "what Codex sessions ran on this repo", "list my
  Claude Code sessions", "which worktree was that session in", "find the chat
  where I refactored auth", "archive old Codex sessions", or "show every session
  across my worktrees". Reach for it to untangle which of many worktrees still
  has live agent history attached. This is about Codex and Claude Code transcript
  history plus git worktrees — not HTTP, login, or auth sessions, not terminal or
  tmux sessions, and not user-research sessions.
---

# Session Atlas

Codex and Claude Code both store their conversation transcripts globally — keyed
by the working directory a session ran in, not by the repo. That makes it hard to
answer simple questions like "which of these worktrees still has a live session"
or "where's that conversation where I refactored the auth flow". Session Atlas
scans both stores and reassembles that picture for one project at a time: every
session, the worktree it ran in, whether it's active or archived, and a summary
of what each one actually did.

The work is **deterministic** — a local server reads the stores and extracts
everything live, so there's nothing for you to assemble by hand. Your job is just
to launch it.

## Launching the UI

The server lives in this skill's own `app/` directory. Install dependencies once,
then start it — point npm at that directory wherever this skill is installed:

```
npm --prefix <this-skill>/app install   # first run only
npm --prefix <this-skill>/app start
```

It opens a browser to a local port (6310–6320). The server scans `~/.codex` and
`~/.claude` and serves a **project picker** — there's no project argument, because
the whole point is to choose among the projects it discovers (or paste any path).
Tell the user the URL if the browser doesn't open on its own.

`CODEX_HOME` / `CLAUDE_HOME` override the store locations; `SESSION_ATLAS_PORT`
pins the port; `SESSION_ATLAS_NO_OPEN=1` skips opening the browser.

## What it shows

Pick a project and you get two sections:

- **Workspaces** — every current git worktree (`git worktree list`) plus any
  managed or deleted checkout that still has transcripts pointing at it (Codex
  worktrees under `~/.codex/worktrees`, Claude worktrees under
  `<project>/.claude/worktrees`). Each shows its branch, its Codex status
  (`active`, `archived`, or `active + archived history`) and Claude status, the
  latest session, and a flag when a workspace is no longer a registered git
  worktree. Worktrees with no agent sessions are collapsed out of the way.
- **Sessions** — newest first, Codex and Claude merged, searchable by what was
  said. Each expands to the first request, the last request, the final outcome,
  the working directory, and the transcript path. Archived Codex sessions are
  collapsed by default.

## Cleanup actions

**Archiving Codex sessions.** Codex's notion of "archived" is purely physical:
an archived transcript lives in `~/.codex/archived_sessions` and is dropped from
`~/.codex/session_index.jsonl` (active ones stay in it). The UI's archive button
mirrors exactly that — it moves the transcript and syncs the index — and
unarchive reverses it, restoring the transcript to its dated `sessions/` path.

**Deleting Claude sessions.** Claude Code keeps no archive state in its on-disk
store (`~/.claude`) — archiving is a desktop-app concept the app records in its
own store, which this skill deliberately does not read or write. So the only
cleanup the CLI store supports is a hard delete, and Claude session cards offer a
Delete button that does exactly that: it removes the transcript `.jsonl` and its
per-session sidecar directory, and nothing else — project `memory/`, plugin
folders, and other sessions are shared and left untouched. It refuses to delete a
session that is currently running (checked against `~/.claude/sessions`), and the
confirm spells out that it is permanent — there is no transcript backup to undo
from.

**Removing worktrees.** Each workspace card (except the main checkout) has a
Remove button that runs the proper `git worktree remove` — deregistering the
worktree and deleting its directory, never a bare `rm` that would orphan git's
metadata. It refuses when the worktree has uncommitted or untracked changes (or
when git can't confirm it's clean), and offers an explicit force path that
discards them. Transcripts are never touched, so the conversation still appears
under Sessions afterward. For a worktree that exists on disk but git's list
doesn't track it, removal falls back to deleting the directory and pruning the
stale admin entry.

## Notes

- **Read-only on the analyzed project** — the only writes are Codex archive moves
  the user triggers, under `~/.codex`.
- Session summaries are extracted straight from transcripts: real user/automation
  prompts and the final assistant message, skipping injected `AGENTS.md`,
  environment, and permissions context. Automation and scheduled-task prompts
  count as real requests.
- Membership is matched by the `cwd`/remote recorded *inside* the transcripts, not
  by decoding store folder names (Claude's folder encoding varies across
  versions), so deleted and managed worktrees still attach correctly.
- The UI never loads code or fonts from a CDN — Preact/htm are vendored and the
  display/UI/mono fonts are bundled as local WOFF2 (see `ui/styles/fonts/`).
  `npm run check` in `app/` verifies no remote imports, plus syntax.
