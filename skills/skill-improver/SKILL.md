---
name: skill-improver
description: Runs on a schedule to mine recent Codex and Claude Code conversations across configured projects, find moments where things went off plan (the user had to steer, correct, abort, or re-explain), and propose targeted improvements to the specific skills that were in use at the time. Opens one pull request per run against the skills repo, with each proposed edit annotated with the concrete steering moment that motivated it. Also analyzes its own runs (the `skills` repo is one of the configured projects) so it iteratively improves itself. Use this skill when the user asks to "analyze recent conversations", "find what went wrong", "improve skills based on past runs", or sets up a scheduled run of skill-improver. Make sure to use this skill whenever the user mentions recursive skill improvement, post-mortem analysis of agent conversations, or automating skill quality based on real usage.
---

# Skill Improver

A scheduled audit loop. Each run pulls newly finished agent conversations across configured projects, identifies steering moments, attributes each one to a specific skill (or the orchestration around it), and ships a single PR with all proposed skill edits — with the **why** spelled out in both the PR and the conversation that triggered the run.

The goal is continuous, evidence-based skill improvement. Every time something goes wrong, the question is: *what went wrong, and who should have caught it?* If a skill could have prevented it, the skill changes.

## Required tools

- `git` and `gh` (GitHub CLI, authenticated) — for branch + PR creation
- `python3` — runs the conversation puller and the brief discovery script
- Read access to `~/.codex/sessions/`, `~/.codex/archived_sessions/`, and `~/.claude/projects/`
- Read access to the `.briefs/` directory inside each configured project root (and its worktrees) — this is where the `brief` skill writes its HTML artifacts

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

The `state/state.json` file holds a per-project, per-source `started_at` cursor so each run only analyzes what's new since the last run. A separate `state/briefs-state.json` file holds the per-project mtime cursor for `.briefs/*.html` artifacts (see Step 3b) — kept apart because briefs are a different cadence and source from conversations and bundling them muddies both cursors.

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
- **User-owned skills** live under `skills/` at the repo root (e.g. `skills/ship/`, `skills/ticket/`, `skills/skill-improver/`). These are what this skill exists to improve. All analysis-driven edits target files here. Note that many of these are also **distributed to the other configured projects** — they show up under each project's own `.agents/skills/<name>/` (synced via `npx skills`). So when a conversation in ao2, cartograph, etc. invokes `$ship`, `$advisor`, or `$project-health-check`, that *is* this repo's skill in use: attribute the finding to `skills/<name>/` and edit it here, never in the other project's copy. Don't dismiss a cross-project `$skill` conversation as "some other repo's skill" — that mis-triage has dropped in-scope conversations.

## The run

### Step 0 — Pre-flight: sync main, then refresh external meta-skills

Two pre-flight actions run before any analysis. Both happen in the **main worktree** of the skills repo (not a feature worktree).

**0a. Sync `main` with `origin/main`.** Every later step branches off `main` — the upstream refresh below, the feature branch in Step 5 — so stale local `main` ships stale work. Fast-forward only.

Guardrails:
- Don't disturb in-progress work — if the working tree is dirty or the current branch isn't `main`, skip the sync and proceed to 0b using the current state. Note it in the final summary.
- Don't force, reset, or rebase. If `main` has diverged from `origin/main`, report the divergence in the final summary and proceed to 0b.
- If the fetch fails (network, auth), don't abort — note the failure and proceed.

**0b. Refresh external meta-skills.** The meta-skills under `.agents/skills/` encode how skills in this repo should be written and operated. Refresh them so the rest of the run uses the latest guidance — and so any upstream improvements ship to the user promptly.

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

### Step 3b — Audit recent brief artifacts

The `brief` skill produces visual HTML one-pagers in each project's `.briefs/` directory. Those artifacts are direct, durable evidence of how well the skill is performing — much higher signal than reading transcripts about brief generation. This step audits each new brief against the skill's own self-check list and surfaces failures as findings, attributed to `skill_in_use: brief`.

```bash
python3 "$SKILL_DIR/scripts/list_briefs.py" > /tmp/skill-improver-briefs.jsonl
```

The script reads `state/briefs-state.json` and emits one JSON object per `.briefs/*.html` file that is newer than the per-project cursor, oldest first. First-run window defaults to 14 days (briefs are generated less often than conversations, so a wider window is fine).

Useful flags mirror the conversation puller: `--since`, `--project`, `--mode draft|final`, `--limit N`, `--update-state` (advance the cursor — only pass on success).

**For each new brief, open the HTML file and check it against the rules in [skills/brief/SKILL.md](../brief/SKILL.md)'s "Step 6 — Save, open, and self-check" section.** That self-check list is the source of truth for what a good brief looks like; this audit is just running it across recent real outputs. Concretely, look for:

- Hero TL;DR longer than two sentences, or padded into a narrative paragraph.
- Mode pill missing or too visually subtle to disambiguate DRAFT from FINAL at a glance.
- PR Stack section missing entirely (even for a single PR), or buried below high-stakes callouts / code tour / file index.
- Section order deviating from the prescribed sequence (Hero → PR Stack → High-stakes → Endpoint Audit → Schema → Code Tour → PR Evolution → File Index).
- Code Tour section that is prose-only — no `<pre><code>` blocks, no inline diff or source snippets.
- Schema changes summarized in prose instead of walked line by line in a table.
- (FINAL) Follow-up commits in PR Evolution that aren't tagged with a cause (review finding / user steering / other), or skipped review findings not surfaced in a warning-colored row.
- Tour stops totaling 8+ without a sticky tour TOC.

Tag findings the same way as conversation findings, but with a brief-specific shape:

```
{
  "source": "brief-audit",
  "project": "...",
  "skill_in_use": "brief",
  "brief_path": "<absolute html path>",
  "mode": "draft | final",
  "mtime": "...",
  "rule_violated": "<short name of the self-check rule, e.g. 'PR stack buried'>",
  "evidence": "<what you observed — e.g. 'PR Stack appears as section 6, after Code Tour'>",
  "proposed_change": "<concrete edit to skills/brief/SKILL.md, in skill-author voice>"
}
```

The same clustering bar in Step 4 applies: a single off-template brief is noise; **two or more independent instances of the same rule violation** are the threshold for a skill edit. If the same violation shows up across multiple projects, that's especially strong signal that the rule isn't getting through and needs sharper wording.

### Step 4 — Cluster findings by skill and decide what's worth a code change

Group all findings by `skill_in_use`. For each skill:

1. **Look for repetition.** A single one-off steering moment is usually not enough to justify a skill edit — users have varied preferences and the model has off days. Two or more independent instances of the same pattern is the threshold for action. Note exceptions: any safety/destructive issue (force push, hard reset, deleted user work) is worth acting on after a single occurrence.
2. **Before drafting any edits, read `.agents/skills/skill-creator/SKILL.md`.** That's the canonical reference for how skills in this repo are written: explain the *why*, avoid stacks of MUST/NEVER, keep prompts lean, prefer reframing over heavy constraints, bundle scripts for repeated work. Every edit you propose should be one skill-creator would approve. If other meta-skills under `.agents/skills/` are relevant to the kind of edit you're about to draft (e.g. evaluation, packaging), read those too.
3. **Draft the smallest change that would have prevented the pattern.** Apply the skill-creator principles. A new sentence in the right section often beats a new heading.
4. **Decide what doesn't change.** Findings tied to one-off user preferences, project-specific context, or noise should be documented in the PR body but not turned into skill edits.

### Step 4b — If no analysis-driven edits, switch to cleanup mode

A run produces analysis-driven edits *or* a cleanup pass — never both. Bundling the two muddies review: the reviewer can't easily tell whether a deletion is a deliberate trim or a regression in the new findings, and the cleanup gets rubber-stamped along with the findings instead of getting its own scrutiny.

So after Step 4, branch:

- **If Step 4 produced any edits**, skip this step entirely and go to Step 5. Even if a target skill looks bloated, leave the cleanup for a future run — shipping the finding now matters more than tidying.
- **If Step 4 produced no edits** (no patterns met the bar, all findings were noise, or the batch was empty of high-signal conversations), consider this run a cleanup-mode run.

In cleanup mode:

1. Survey user-owned skills under `skills/` and consider candidates that genuinely need simplification. A finding-free run does **not** mean a skill must be cleaned — most runs in cleanup mode should be no-ops, because most skills on most days are fine. Only count a skill as a candidate if you see real signals: SKILL.md past ~300 lines and growing across recent commits, repeated *why* explanations, dense MUST/NEVER stacks, multiple paragraphs added by previous skill-improver runs piling onto the same section, sections that no longer match the workflow. Vague "could be tighter" doesn't qualify — skill-cleaner itself will refuse to make changes if the target is already tight, and burning a PR on a no-op cleanup wastes the reviewer's time.
2. **Filter out skills that were recently cleaned and haven't meaningfully grown since.** For each candidate, check git log for the last cleanup pass on that file:
   ```bash
   git log --format='%H %ad %s' --date=short -- skills/<name>/SKILL.md | grep -i 'cleanup' | head -1
   ```
   If there's a hit, look at what's landed on that file since:
   ```bash
   git log --oneline <last-cleanup-sha>..HEAD -- skills/<name>/SKILL.md
   git diff --stat <last-cleanup-sha>..HEAD -- skills/<name>/SKILL.md
   ```
   Skip the candidate if the last cleanup was recent (rule of thumb: within the last ~30 days *or* within the last 3 skill-improver runs that touched it) **and** the churn since is small (under ~50 lines added, or just trivial edits like typo fixes). The point is to stop the loop of re-cleaning the same skill every run — a skill that was just tightened needs time to accumulate real growth before another pass is justified.
3. After filtering, if no candidate remains, this is a no-op run — go to Step 5 and let Step 6 decide whether the cursor-bump alone is worth a PR. If one or more candidates remain, pick the single best one (largest, or the one with the most clearly bloated section).
4. Read `skills/skill-cleaner/SKILL.md` and follow it on the chosen skill. It edits in place and returns a structured report. If skill-cleaner itself reports "no changes — skill is already tight", treat the run as a no-op and don't open a cleanup PR for it (this is the second safety net behind the recency filter — if the first didn't catch it, the cleaner's own judgment does).
5. The report is the entire payload of this run's PR — the cleanup *is* the change. Step 6's PR body uses the cleanup-mode template.

When in doubt, lean toward no-op. A state-only PR (or no PR at all) is always preferable to a cleanup that wasn't justified — re-cleaning a fine skill churns the file, dilutes the signal of past cleanup commits, and trains the reviewer to ignore cleanup PRs.

### Step 5 — Make the edits in a feature branch

```bash
REPO="$(git -C "${CLAUDE_PROJECT_DIR:-$PWD}" rev-parse --show-toplevel)"
cd "$REPO"
git checkout -b skill-improver/run-$(date -u +%Y%m%d-%H%M%S)
# Step 0's npx skills update changes (if any) are already in the working tree —
# they'll be included in the same commit. Now apply analysis-driven edits.
# apply edits to skills/<name>/SKILL.md ...
```

**Edit the same checkout you branched in — this is a real trap.** Resolve `$REPO` once (above) and prefix *every* file edit with it (`$REPO/skills/<name>/SKILL.md`), including the path passed to file-editing tools — not just `cd`. When this skill runs under a feature worktree (common — the harness spawns one, and `CLAUDE_PROJECT_DIR` is often unset, so the fallback resolves to that worktree), that worktree **is** the repo root. A past run branched correctly in the worktree but passed the *main* checkout's absolute path to its `Edit` calls, so the changes silently landed on `main`'s working tree and the feature branch's diff came back empty. Guard against it: **after the first edit, run `git diff --stat` and confirm it is non-empty before continuing.** An empty diff means you edited the wrong checkout — never edit files under the main checkout path while working in a worktree.

Scope rules:
- Analysis-driven edits target **only `skills/<name>/`** (user-owned skills). Never edit anything under `.agents/skills/` or `.claude/skills/` — those are upstream and only change via `npx skills update`. If a finding clearly points at an external meta-skill (e.g. skill-creator gave bad advice), record it in the PR's "Considered but not changed" section and tag it as `upstream:<skill-name>` so the user can decide whether to file an issue upstream.
- Edit only `SKILL.md` files unless a finding clearly justifies a script or reference file change.
- Don't touch unrelated skills. Don't bundle drive-by cleanup with the improvement edits — keep the diff focused on the evidence.

### Step 5b — Advance the cursors (before commit)

Two cursors persist across runs on `main` and both live in tracked files:

- `skills/skill-improver/state/state.json` — conversation cursor (per-project, per-source `started_at`)
- `skills/skill-improver/state/briefs-state.json` — brief-artifact cursor (per-project `last_mtime`)

The only way to land them without pushing to `main` directly is to include them in the same PR as the rest of the run. So advance both **before** committing in Step 6 — never leave them dirty in the working tree.

```bash
python3 "$SKILL_DIR/scripts/list_conversations.py" --update-state --from-batch /tmp/skill-improver-batch.jsonl > /dev/null
python3 "$SKILL_DIR/scripts/list_briefs.py" --update-state --from-batch /tmp/skill-improver-briefs.jsonl > /dev/null
```

Each script advances its own state file to the newest value per project **seen in the Step 1 / Step 3b batch** — that's what `--from-batch` enforces, pointing each script at the JSONL it emitted earlier. This matters because Step 5b runs much later than the pull: without `--from-batch`, `--update-state` re-scans live and moves the cursor past any conversation or brief that arrived in between, so it never gets analyzed. Pass the batch files and the cursor only ever moves past what you actually read. The resulting working-tree changes are part of the commit in Step 6.

**If the run aborts before Step 6** (push rejected, gh error, etc.), discard both state changes so the next run re-analyzes the same batch:

```bash
git checkout -- skills/skill-improver/state/state.json skills/skill-improver/state/briefs-state.json
```

### Step 6 — Open one PR per run

The body depends on which mode the run ended up in (see Step 4b). Pick the matching template.

**Findings-mode PR** (Step 4 produced edits):

```bash
git add -A
git commit -m "skill-improver: findings from run $(date -u +%Y-%m-%d)"
git push -u origin HEAD
gh pr create --title "skill-improver: $(date -u +%Y-%m-%d) findings" --body "$(cat <<'EOF'
## Summary
<one paragraph: how many conversations analyzed, how many briefs audited, how many findings, which skills touched, plus whether any external meta-skill was updated this run>

## External meta-skill updates
<only if Step 0 produced changes; one bullet per updated meta-skill>
- `.agents/skills/<name>/` — <brief summary of what changed upstream>

These changes come from `npx skills update` and are bundled here so the user has a single review surface. They are not analysis-driven edits.

## Changes from conversation analysis
For each skill edited based on conversation findings:

### skills/<name>/SKILL.md
**Why:** <pattern observed — how many times, across which projects>
**Evidence:**
- <conversation file path> — "<verbatim quote>"
- <...> — "<...>"
**Change:** <what the edit does and why it should prevent the pattern>

## Changes from brief audit
<only if Step 3b produced edits to skills/brief/SKILL.md>

### skills/brief/SKILL.md
**Why:** <self-check rule violated — how many briefs, across which projects/modes>
**Evidence:**
- <brief html path> (mode) — <what was observed>
- <...> — <...>
**Change:** <what the edit does and why it should make the rule land>

## Considered but not changed
<findings that didn't meet the bar for an edit — one bullet each, with reason. Include both conversation and brief findings here.>

## Skipped conversations
<count of skipped trivial/automation conversations>

## Cursors
Advanced conversation cursor for: <project[/source] list with new timestamps>
Advanced brief cursor for: <project list with new mtimes>

🤖 Generated by skill-improver
EOF
)"
```

**Cleanup-mode PR** (Step 4 produced no edits, Step 4b ran skill-cleaner):

```bash
git add -A
git commit -m "skill-improver: cleanup pass from run $(date -u +%Y-%m-%d)"
git push -u origin HEAD
gh pr create --title "skill-improver: $(date -u +%Y-%m-%d) cleanup of <skill-name>" --body "$(cat <<'EOF'
## Summary
No analysis-driven edits this run (<one sentence on why — empty batch / no patterns met the bar / all findings were noise>). Switched to cleanup mode and ran skill-cleaner on `skills/<name>/`.

## External meta-skill updates
<only if Step 0 produced changes; same format as findings PR>

## Cleanup pass: skills/<name>/SKILL.md
**Why this skill:** <one sentence — e.g. "470 lines, +180 from skill-improver runs over the last 3 months, dense MUST stacks in Step 3">
<paste the full report skill-cleaner returned>

## Cursors
Advanced conversation cursor for: <project[/source] list with new timestamps>
Advanced brief cursor for: <project list with new mtimes>

🤖 Generated by skill-improver
EOF
)"
```

Rules:
- **One PR per run** in one mode — findings or cleanup, never both. See Step 4b for why.
- **Do not auto-merge.** PRs are for human review. If `gh pr merge --auto` is tempting, resist it.
- **Never push to `main` directly.** The skill always opens a PR even for tiny edits.
- **Open the PR if any of:** (a) Step 4 produced edits under `skills/` (from conversation findings *or* brief audit), (b) Step 0's `npx skills update` produced changes under `.agents/skills/`, (c) Step 4b ran skill-cleaner and it made changes, or (d) Step 5b advanced either cursor. Any one is worth a PR — those changes still need a human to merge so the cursors land on `main`.
- **If the run analyzed zero inputs** (both pullers returned empty batches and no meta-skill updates), skip the PR entirely — nothing to advance, nothing to ship. Go to Step 7 with "no changes warranted".
- **State-only PRs are normal.** A run with no findings, no cleanup, and no meta-skill updates but with a non-empty batch of conversations and/or briefs should still open a PR containing only the cursor bumps — that's how the cursors persist. Title and body should make clear it's a cursor-only run.

### Step 7 — Tell the user in the conversation what happened and why

Post a summary in the conversation that triggered this run (or stdout if scheduled), with:

1. Whether the pre-flight ran cleanly — main-sync outcome (fast-forwarded / already up to date / skipped because dirty or diverged) and whether `npx skills update` changed any external meta-skill under `.agents/skills/` (one line — which meta-skills + a sentence on what changed if non-trivial).
2. How many conversations were analyzed and how many briefs audited (Step 3b); how many of each had findings; how many findings led to edits.
3. Which mode this run ended up in — findings, cleanup, or no-op — and the PR URL (or "no PR opened — no changes warranted").
4. If findings mode: for each skill edited, one sentence on the pattern and one sentence on the fix. Call out separately whether the finding came from conversation analysis or brief audit. Plus notable findings that *didn't* become edits, so the user knows nothing was hidden.
5. If cleanup mode: which skill was cleaned, why it was the chosen candidate, and the size delta from skill-cleaner's report.

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

**Entry point under the scheduler.** The scheduled task says "Run the skill-improver skill," but this skill lives in the skills repo at `skills/skill-improver/SKILL.md` — it is *not* registered as an invocable Skill, so attempting to load it by name fails ("Unknown skill") in both Claude and codex. Don't treat that as a dead end: locate this file directly and follow it. If `CLAUDE_PROJECT_DIR` is unset (common under the scheduler), glob for `skills/skill-improver/config.json` under the known skills-repo roots in `config.json` to find the repo, then read the `SKILL.md` next to it. This has cost two consecutive runs a couple of wasted turns at startup.
