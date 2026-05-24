---
name: skill-improver
description: Runs on a schedule to mine recent Codex and Claude Code conversations across configured projects, find moments where things went off plan (the user had to steer, correct, abort, or re-explain), and propose targeted improvements to the specific skills that were in use at the time. Opens one pull request per run against the skills repo, with each proposed edit annotated with the concrete steering moment that motivated it. Also analyzes its own runs (the `skills` repo is one of the configured projects) so it iteratively improves itself. Use this skill when the user asks to "analyze recent conversations", "find what went wrong", "improve skills based on past runs", or sets up a scheduled run of skill-improver. Make sure to use this skill whenever the user mentions recursive skill improvement, post-mortem analysis of agent conversations, or automating skill quality based on real usage.
---

# Skill Improver

A scheduled audit loop. Each run pulls newly finished agent conversations across configured projects, identifies steering moments, attributes each one to a specific skill (or the orchestration around it), and ships a single PR with all proposed skill edits — with the **why** spelled out in both the PR and the conversation that triggered the run.

The goal is continuous, evidence-based skill improvement. Every time something goes wrong, the question is: *what went wrong, and who should have caught it?* If a skill could have prevented it, the skill changes.

## Required tools

- `git` and `gh` (GitHub CLI, authenticated) — for branch + PR creation
- `python3` — runs the conversation puller
- Read access to `~/.codex/sessions/`, `~/.codex/archived_sessions/`, and `~/.claude/projects/`

If any are missing, stop and ask.

## Configuration

`config.json` (next to this file) lists projects to analyze and the path patterns where their conversations live (main repo, codex worktrees, claude worktrees, cursor worktrees, gwt-worktrees). To add a project, append a new entry:

```json
{
  "name": "my-new-project",
  "roots": [
    "/Users/nazar/LocalProjects/my-new-project",
    "/Users/nazar/.codex/worktrees/*/my-new-project",
    "/Users/nazar/.cursor/worktrees/my-new-project/*",
    "/Users/nazar/LocalProjects/my-new-project/.claude-worktrees/*",
    "/Users/nazar/gwt-worktrees/my-new-project/*"
  ]
}
```

The `state/state.json` file holds a per-project, per-source `started_at` cursor so each run only analyzes what's new since the last run.

The `skills` project is configured as one of the targets — this is intentional. The skill audits its own runs and proposes its own edits.

## Where conversations live (and why we scan both formats)

- **Codex**: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` (live) and `~/.codex/archived_sessions/*.jsonl`. First line is `session_meta` with `cwd`, `id`, `timestamp`, and `git.branch`. Codex spawns a fresh worktree per automation run under `~/.codex/worktrees/<hash>/<project>` — these must be matched.
- **Claude Code**: `~/.claude/projects/<encoded-cwd>/` contains both:
  - `<session-uuid>.jsonl` — the full transcript (older format, still common)
  - `sessions-index.json` — newer index that survives even after the .jsonl is archived; has `projectPath`, `firstPrompt`, `created`, `gitBranch`
  Claude Code creates worktrees under `<project>/.claude-worktrees/<name>` and users also use `~/gwt-worktrees/<project>/<name>` or `~/.cursor/worktrees/<project>/<hash>`. All show up under `~/.claude/projects/` with their cwd encoded into the dir name.

The path encoding in `~/.claude/projects/` is lossy (both `/` and `.` map to `-`), so don't try to derive cwd from the dir name. The `cwd`/`projectPath` field inside the file is authoritative — that's what the puller matches against `config.json` patterns.

## Two kinds of skills in this repo

Be precise about which is which — they're treated very differently:

- **External meta-skills** live under `.agents/skills/` (and `.claude/skills/` which is just symlinks to `.agents/`). These come from upstream via `npx skills update` — skill-creator is the canonical example, but more may be added over time. They are the *tools used to create, maintain, and improve* the user's own skills. **Never edit these.** They are read-only from this skill's perspective; updates only ever come from `npx skills update`.
- **User-owned skills** live under `skills/` at the repo root (e.g. `skills/ship/`, `skills/ticket/`, `skills/skill-improver/`). These are what this skill exists to improve. All analysis-driven edits target files here.

## The run

### Step 0 — Refresh external meta-skills

The meta-skills under `.agents/skills/` encode how skills in this repo should be written and operated. Refresh them at the top of every run so the rest of the run uses the latest guidance — and so any upstream improvements ship to the user promptly.

```bash
cd "$(git -C "$CLAUDE_PROJECT_DIR" rev-parse --show-toplevel)"
npx skills update
git status --short
```

Treatment:
- If `git status` shows changes (anywhere under `.agents/skills/` — could be any external meta-skill, not just skill-creator), stage and keep them. They will ship in the same PR as any analysis-driven edits, in their own PR section.
- These are not findings from conversation analysis — they're upstream releases. Summarize *what* changed (which meta-skill(s), brief diff summary) but don't try to invent a "why we changed this" — the why lives upstream.
- If `npx skills update` fails (network, auth, etc.), don't abort the run — proceed with Steps 1+ using the currently-installed versions. Note the failure in the final summary.

### Step 1 — Pull new conversations

```bash
SKILL_DIR="$CLAUDE_PROJECT_DIR/skills/skill-improver"   # or the absolute path to this skill
python3 "$SKILL_DIR/scripts/list_conversations.py" --full-prompt > /tmp/skill-improver-batch.jsonl
```

The script reads `state/state.json` and emits only conversations newer than the last cursor, one JSON object per line, oldest first.

**First-run behavior:** when a project/source has no cursor yet, the script defaults to a 7-day lookback window instead of dumping all history. Override with `--first-run-days N` (use `0` to scan everything; only do that if the user explicitly asks). This means the very first invocation is safe to run unattended — you'll get a small, manageable batch from the last week.

Useful flags:
- `--since 2026-05-01` — override both the cursor and first-run window
- `--first-run-days 14` — widen the first-run lookback (default 7)
- `--project pixelle2` — restrict to one project
- `--source claude` — restrict to one source
- `--limit 50` — keep batches manageable
- `--update-state` — advance the cursor after the run completes (only pass on success)

### Step 2 — Triage: filter to conversations worth analyzing

Length is not a useful filter — a two-turn exchange where the user's second message is "no, don't do that" is *more* valuable than a long conversation that went smoothly. Default to reading every conversation in the batch unless one of the cheap skip signals below clearly applies.

Skip only when there's nothing to learn from:
- Empty/aborted-at-init conversations (no user prompt was ever sent — just the session-meta and environment context).
- Automation scheduler heartbeats that did no real work — these look like `Automation: ...` first-prompt with a single agent reply that says "no work to do" or equivalent, then end.
- Conversations that are pure look-ups already answered cleanly in one turn (no follow-up, no correction). Be careful: a quick "thanks, but actually X" is still a steering moment.

Definitely keep — these are high-signal even when very short:
- Any conversation with a `<turn_aborted>` system event (user interrupted).
- Any conversation where the first prompt explicitly invokes a named skill (e.g., `$ship`, `$ticket`, `$ship NFL-4`). Attribution is unambiguous.
- Any conversation containing the corrective-language signals listed in Step 3 (cheap to grep for: "no", "don't", "stop", "actually", "wait", "instead", "you should have", "why did you", "that's wrong"). A one-turn correction often points at a real skill gap.

When in doubt, keep it. Reading a conversation that turns out to be uninteresting costs little; missing a sharp correction in a short conversation costs the next user the same mistake.

### Step 3 — Read each kept conversation end-to-end and tag steering moments

For each conversation, read the full transcript and look for these signals. **Read the full file** — these signals don't appear in summaries.

| Signal | What it looks like |
|---|---|
| Corrective steering | "no", "don't", "stop", "actually", "wait", "instead", "you should have", "why did you", "that's wrong" |
| Re-explanation | User repeats the task with new framing because the agent misunderstood |
| Backtracking | Agent reverts a commit / undoes an edit at user request |
| Plan deviation | Agent skipped a step the skill mandates, or invented a step that wasn't required |
| Tool misuse | Agent used `git reset --hard`, force-pushed without asking, ran a destructive command the skill should have gated |
| Missing safeguard | User flagged something the skill *should* have caught (missing tests, skipped review, no migration check) |
| Frustration | Long-form complaint, "you keep doing X", or explicit "this skill needs to ..." feedback |
| Aborted turn | `<turn_aborted>` event |

For every tagged moment, record:
```
{
  "conversation_id": "...",
  "source": "codex|claude",
  "project": "...",
  "skill_in_use": "ship | ticket | ... | (none)",
  "timestamp": "...",
  "signal": "corrective | re-explanation | ...",
  "quote": "<verbatim user message — keep it tight>",
  "what_should_have_caught_it": "<one sentence — which skill/step/check>",
  "proposed_change": "<concrete edit, in skill-author voice>"
}
```

`skill_in_use` is usually the skill named in the first user prompt (`$ship`, `$ticket`, etc.). If no skill was invoked, attribute to `(none)` — those findings may become *new* skills or process improvements rather than edits to existing skills.

### Step 4 — Cluster findings by skill and decide what's worth a code change

Group all findings by `skill_in_use`. For each skill:

1. **Look for repetition.** A single one-off steering moment is usually not enough to justify a skill edit — users have varied preferences and the model has off days. Two or more independent instances of the same pattern is the threshold for action. Note exceptions: any safety/destructive issue (force push, hard reset, deleted user work) is worth acting on after a single occurrence.
2. **Before drafting any edits, read the relevant external meta-skills under `.agents/skills/`.** At minimum, read `.agents/skills/skill-creator/SKILL.md` — it contains the house style for skill writing: explaining the *why*, avoiding MUST/NEVER stacks, keeping prompts lean, when to bundle a script. If other meta-skills are installed (e.g. something for evaluation, optimization, or packaging) and they're relevant to the kind of edit you're about to draft, read those too. The bar is: "the author of the meta-skill would approve this edit."
3. **Draft the smallest change that would have prevented the pattern.** Apply the skill-creator principles: explain the *why*, prefer reframing over MUST/NEVER, keep the prompt lean. A new sentence in the right section often beats a new heading.
4. **Decide what doesn't change.** Findings tied to one-off user preferences, project-specific context, or noise should be documented in the PR body but not turned into skill edits.

### Step 5 — Make the edits in a feature branch

```bash
cd "$(git -C "$CLAUDE_PROJECT_DIR" rev-parse --show-toplevel)"
git checkout -b skill-improver/run-$(date -u +%Y%m%d-%H%M%S)
# Step 0's npx skills update changes (if any) are already in the working tree —
# they'll be included in the same commit. Now apply analysis-driven edits.
# apply edits to skills/<name>/SKILL.md ...
```

Scope rules:
- Analysis-driven edits target **only `skills/<name>/`** (user-owned skills). Never edit anything under `.agents/skills/` or `.claude/skills/` — those are upstream and only change via `npx skills update`. If a finding clearly points at an external meta-skill (e.g. skill-creator gave bad advice), record it in the PR's "Considered but not changed" section and tag it as `upstream:<skill-name>` so the user can decide whether to file an issue upstream.
- Edit only `SKILL.md` files unless a finding clearly justifies a script or reference file change.
- Don't touch unrelated skills. Don't bundle drive-by cleanup with the improvement edits — keep the diff focused on the evidence.

### Step 5b — Advance the cursor (before commit)

The cursor lives in the tracked file `skills/skill-improver/state/state.json` and must persist across runs on `main`. The only way to land it without pushing to `main` directly is to include it in the same PR as the rest of the run. So advance it **before** committing in Step 6 — never leave it dirty in the working tree.

```bash
python3 "$SKILL_DIR/scripts/list_conversations.py" --update-state > /dev/null
```

This idempotently advances `state/state.json` to the newest `started_at` per project/source seen in this batch. The resulting working-tree change is part of the commit in Step 6.

**If the run aborts before Step 6** (push rejected, gh error, etc.), discard the state.json change so the next run re-analyzes the same batch:

```bash
git checkout -- skills/skill-improver/state/state.json
```

### Step 6 — Open one PR per run

```bash
git add -A
git commit -m "skill-improver: improvements from run $(date -u +%Y-%m-%d)"
git push -u origin HEAD
gh pr create --title "skill-improver: $(date -u +%Y-%m-%d) findings" --body "$(cat <<'EOF'
## Summary
<one paragraph: how many conversations analyzed, how many findings, which skills touched, plus whether skill-creator was updated this run>

## External meta-skill updates
<only if Step 0 produced changes; one bullet per updated meta-skill>
- `.agents/skills/<name>/` — <brief summary of what changed upstream>

These changes come from `npx skills update` and are bundled here so the user has a single review surface. They are not analysis-driven edits.

## Changes from conversation analysis
For each skill edited:

### skills/<name>/SKILL.md
**Why:** <pattern observed — how many times, across which projects>
**Evidence:**
- [<conversation file path>](<no-link, just the path>) — "<verbatim quote>"
- [<...>] — "<...>"
**Change:** <what the edit does and why it should prevent the pattern>

## Considered but not changed
<findings that didn't meet the bar for an edit — one bullet each, with reason>

## Skipped conversations
<count of skipped trivial/automation conversations>

## Cursor
Advanced state cursor for: <project[/source] list with new timestamps>

🤖 Generated by skill-improver
EOF
)"
```

Rules:
- **One PR per run**, not one per skill. The reviewer needs to see all evidence in one place.
- **Do not auto-merge.** PRs are for human review. If `gh pr merge --auto` is tempting, resist it.
- **Never push to `main` directly.** The skill always opens a PR even for tiny edits.
- **Open the PR if any of:** (a) conversation analysis produced edits under `skills/`, (b) Step 0's `npx skills update` produced changes under `.agents/skills/`, or (c) Step 5b advanced the state cursor. Any one is worth a PR — those changes still need a human to merge so the cursor lands on `main`.
- **If the run analyzed zero conversations** (puller returned an empty batch and no meta-skill updates), skip the PR entirely — there's no cursor to advance and nothing to ship. Go to Step 7 with "no changes warranted".
- **State-only PRs are normal.** A run with no findings *and* no meta-skill updates but with a non-empty batch should still open a PR containing only the `state/state.json` bump — that's how the cursor persists. Title and body should make clear it's a cursor-only run.

### Step 7 — Tell the user in the conversation what happened and why

Post a summary in the conversation that triggered this run (or stdout if scheduled), with:

1. Whether `npx skills update` ran cleanly and whether it changed any external meta-skill under `.agents/skills/` (one line — which meta-skills + a sentence on what changed if non-trivial).
2. How many conversations were analyzed, how many had findings, how many findings led to edits.
3. The PR URL (or "no PR opened — no changes warranted").
4. For each skill edited from analysis: one sentence on the pattern and one sentence on the fix.
5. Notable findings that *didn't* become edits, so the user knows nothing was hidden.

Keep it scannable. The PR body has the full evidence; the summary is the orientation.

## Recursive self-improvement

The `skills` project is one of the configured targets, and `skill-improver` lives under `skills/` (user-owned), so each run also analyzes conversations *in the skills repo itself* — including past skill-improver runs — and can propose edits to *this* SKILL.md. (The same does **not** apply to skill-creator and other meta-skills under `.agents/skills/` — those are upstream and out of scope for analysis-driven edits.)

If a previous run missed a pattern, or wrote a finding-quote-edit that turned out to be wrong, the next run sees the steering in the follow-up conversation and proposes a fix here.

Common self-improvements to watch for:
- The puller missed a class of conversation → improvement to `scripts/list_conversations.py` (cite the missed conversation as evidence)
- The triage heuristics filtered out a high-value conversation → loosen Step 2 criteria
- The "two or more instances" bar produced too many or too few edits → adjust
- A new file format appeared in `~/.claude/projects/` or `~/.codex/` → extend the parser

When self-improving, the same Step 5-7 rules apply: PR, explain, do not auto-merge.

## Scheduling

This skill is designed to be invoked by a cron job (Claude `/schedule` or a codex automation). The simplest setup is a daily run, but adjust to taste — more frequent runs mean smaller batches and faster feedback, less frequent means more context per finding. The script's 7-day first-run window means even an unattended first fire is bounded.
