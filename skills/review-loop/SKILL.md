---
name: review-loop
description: >
  End-to-end PR workflow: prepares a branch, commits staged changes, creates or updates a GitHub PR,
  then runs 5 rounds of AI code review from Codex, Greptile, and Devin — fixing findings after each
  round. Codex is the primary signal for round completion; Greptile and Devin are best-effort.
  After 5 rounds, the PR is submitted. Use when the user wants to ship a PR through automated review.
license: MIT
compatibility: Requires git, gh (GitHub CLI) authenticated, and Codex/Greptile/Devin installed on the repo.
metadata:
  author: greptileai
  version: "3.0"
argument-hint: [description]
allowed-tools: Bash(gh:*) Bash(git:*)
---

# Review Loop

Prepare a PR, then run 5 rounds of AI code review using **Codex**, **Greptile**, and **Devin** — fixing findings after each round. After all 5 rounds, submit the PR.

## Reviewers

| Reviewer   | Trigger comment       | Reliability | Notes |
| ---------- | --------------------- | ----------- | ----- |
| **Codex**  | `@codex review`       | **High** — always posts findings | Primary signal for round completion |
| **Greptile** | `@greptile review`  | Medium — sometimes doesn't post | Wait for it alongside Codex, but don't block on it |
| **Devin**  | `@devin review`       | Low — often skips if no findings | Never block a round waiting for Devin |

**Codex is the anchor.** A round is considered complete once Codex has posted its findings. Greptile and Devin findings are incorporated if available, but their absence does not block progress.

## Inputs

- **Description** (optional): User's notes about the changes — passed as `$ARGUMENTS`.

## Context

Gather this context before starting:

- Current branch: !`git branch --show-current`
- Git status: !`git status --short`
- Existing PR: !`gh pr view --json number,title,url,state 2>/dev/null || echo "No PR exists"`
- Recent commits: !`git log main..HEAD --oneline 2>/dev/null || git log -3 --oneline`

## Instructions

### Phase 1: Prepare the branch and PR

#### Step 0: Handle merged PR branches

If **not** on `main` and a PR already exists for the current branch, check if it has been merged:

```bash
gh pr view --json state --jq '.state'
```

If the state is `OPEN`: **skip all of Phase 1** and go straight to Phase 2 (review loop). The PR is already set up.

If the state is `MERGED`:

1. Stash any uncommitted changes: `git stash --include-untracked` (skip if working tree is clean)
2. Switch to main: `git checkout main`
3. Pull latest: `git pull`
4. Create a new branch with a descriptive name based on the user's notes or the staged changes
5. Pop the stash if one was created: `git stash pop`
6. Continue to Step 1 on the new branch

#### Step 1: Prepare the branch

1. If on main, create a new branch with a descriptive name
2. Check for staged changes (`git diff --cached --stat`):
   - **If there are staged changes:** commit only the staged changes (do NOT `git add` anything else)
   - **If nothing is staged:** stage and commit all changes (except API keys or explicitly private content)
3. Push changes to the remote

#### Step 2: Create or update the PR

**If no PR exists:** Create a new PR following the [PR Standards](#pr-standards) below. **The PR must be created in "ready for review" state (not draft).** Do not use `--draft`. Reviewers (Codex, Greptile, Devin) will not trigger — neither automatically on creation nor via comment — on draft PRs.

**If a PR already exists (and is OPEN):**

1. Show the user the existing PR (number, title, URL) and ask for confirmation using AskUserQuestion:
   - **Update existing PR** — push new commits to the current branch and update the PR title/description if needed
   - **Create new branch & PR** — create a new branch from the current one, push there, and open a fresh PR

2. **If the user chose "Update existing PR":**

   a. Read the existing PR:

   ```bash
   gh pr view --json title,body,labels,number
   gh pr diff --stat
   ```

   Read specific files directly rather than dumping the full diff.

   b. Review whether the PR content accurately reflects the current diff:
   - Does the title follow semantic format?
   - Does the description accurately describe all commits?
   - Is the test plan still accurate?
   - Are the release notes complete?

   c. Update if needed:

   ```bash
   gh pr edit <number> --title "new title" --body "new body"
   ```

   d. Push any new commits (regular push, not force push)

3. **If the user chose "Create new branch & PR":**

   a. Create a new branch from the current HEAD with a descriptive name based on the user's notes or the staged changes
   b. Push the new branch to the remote
   c. Create a new PR following the [PR Standards](#pr-standards) below

#### Step 3: Link related issues

Search for related issues and link them using `Closes #123` or `Relates to #123`.

#### Handling problems

Committing automatically runs the linter. Fix any lint/type errors unless they require meaningful code changes — in that case, notify the user:

> I can't create/update this PR because [reason]. Would you like me to [suggestion]?

Never force commit or force push.

#### Schema and migration guardrail

If any review finding or required fix would change schema or migration artifacts, stop and ask the user for approval before editing them. This includes files such as:

- `prisma/schema.prisma`
- `prisma/migrations/**`
- other schema or migration files that would change database structure or migration ordering

Do not make schema or migration edits as part of the review loop until the user explicitly approves them.

---

### Phase 2: Review loop — 5 rounds

Once the PR exists and is pushed, run exactly **5 rounds** of AI review. The final score does not matter — the goal is 5 rounds of review and fixes.

Round 1 is special: all three reviewers are auto-triggered when the PR is created, so no trigger comments are needed. For rounds 2–5, manually trigger each reviewer.

#### State file

Use `.review-loop-state.md` at the repo root to track progress across rounds.

**At the start of the review loop (before round 1),** initialize the file:

```bash
cat > .review-loop-state.md << 'EOF'
# Review Loop State
PR: #<PR_NUMBER>
Current round: 1/5
Status: waiting for findings

## Round 1
### Findings
(none yet)
### Fixed
(none yet)
### Skipped
(none yet)
EOF
```

**At the start of each round,** update the current round number and status. **After collecting findings,** write them into the file under the current round's `### Findings` section — one line per finding with reviewer, file, line, and description. **After fixing/skipping,** update `### Fixed` and `### Skipped` for that round.

This gives the agent a persistent view of what has been seen and addressed, which feeds into deduplication — before fixing a finding in round N, check the state file to see if the same file+concern was already fixed in a prior round.

**At the end of the review loop (after round 5),** delete the state file:

```bash
rm -f .review-loop-state.md
```

#### A. Trigger reviews

**Round 1 (auto-triggered):** Skip this step — reviewers are triggered automatically on PR creation. **Do NOT post manual trigger comments for round 1.** The reviewers are already running; they just take 6–10 minutes to post findings. Be patient.

**Rounds 2–5:** Push the latest changes, then trigger all three reviewers:

```bash
git push
sleep 5
gh pr comment <PR_NUMBER> --body "@codex review"
gh pr comment <PR_NUMBER> --body "@greptile review"
gh pr comment <PR_NUMBER> --body "@devin review"
```

#### B. Wait for findings

Poll for reviewer responses. **Codex is the gate** — once Codex has posted, collect whatever Greptile and Devin have posted so far and move on.

**Important: Reviewers take 6–10 minutes to post findings.** Do not assume they failed just because nothing appears in the first few minutes. You MUST wait at least **10 minutes** before even considering that something might be wrong.

**Strategy:**

1. Poll PR comments and reviews every **2 minutes** (120 seconds).
2. Track which reviewers have posted findings **for the current round** (i.e., comments created after the round started — after the trigger comments were posted, or after PR creation for round 1).
3. Once **Codex** has posted, wait up to **2 more minutes** for Greptile and Devin to also post.
4. After that grace period, proceed with whatever findings are available.

**Fetching comments and reviews:**

```bash
# PR review comments (inline)
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments --paginate

# PR reviews (top-level review bodies)
gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/reviews --paginate

# PR issue comments (trigger comments and bot responses)
gh api repos/{owner}/{repo}/issues/<PR_NUMBER>/comments --paginate
```

**Identifying reviewer comments:**

- **Codex**: comments from `openai-codex[bot]` or similar — check `user.login` for `codex` (case-insensitive)
- **Greptile**: comments from `greptile-apps[bot]` or `greptile-apps-staging[bot]`
- **Devin**: comments from `devin-ai[bot]` or similar — check `user.login` for `devin` (case-insensitive)

Filter comments by `created_at` timestamp to only consider findings from the current round.

**Timeout:** If Codex hasn't posted after **20 minutes**, something is wrong. Log a warning and proceed with whatever findings exist. Do not wait indefinitely.

#### C. Collect and deduplicate findings

Gather all unresolved findings from all three reviewers:

1. **Inline review comments** — from `gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments`
2. **Review bodies** — from `gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/reviews`
3. **Issue comments** — some reviewers post findings as regular PR comments

Also fetch unresolved review threads via GraphQL (see [GraphQL reference](references/graphql-queries.md)):

```bash
gh api graphql -f query='
query($cursor: String) {
  repository(owner: "OWNER", name: "REPO") {
    pullRequest(number: PR_NUMBER) {
      reviewThreads(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          comments(first: 1) {
            nodes { body path author { login } }
          }
        }
      }
    }
  }
}'
```

**Filter out noise.** Exclude comments that are clearly not review findings:
- "LGTM", "thanks!", "looks good", merge coordination, CI status discussions
- Trigger comments (our own `@codex review` etc.)

**Deduplicate across reviewers and rounds.** If multiple reviewers flag the same issue (same file + same concern), merge them into one finding. Preserve the strongest/clearest description. Track which reviewers raised each finding. Also check `.review-loop-state.md` for findings already fixed in prior rounds — skip any that were already addressed.

For each unique finding, note:
- Which reviewer(s) posted it
- The file and line (if inline)
- The comment body
- The review thread ID (for resolution later)

#### D. Triage and fix findings

Classify every finding into one of:

- **Fix** — Valid bug, logic error, security issue, or correctness problem. Apply the fix.
- **Skip** — Ignore if any of these apply:
  - Nit or style-only (naming preferences, formatting, comment wording)
  - Not actually valid (misunderstanding of the code, already handled, false positive)
  - Overly defensive (adds complexity for scenarios that realistically won't occur — e.g., redundant null checks on values guaranteed by the framework, error handling for impossible states, excessive input validation on internal-only code paths)
  - Ambiguous — could go either way; skip and note it in the round summary
  - Conflicting — if two findings contradict each other, skip both and flag

When in doubt, lean toward skipping. The goal is to fix real bugs, not gold-plate the code.

For each "Fix" finding:

1. Read the relevant source file if not already read.
2. If the comment contains a GitHub suggestion block (` ```suggestion `), apply the suggested code directly.
3. Otherwise, apply the minimal change that addresses the issue. Do not refactor surrounding code or add unrelated improvements.
4. Keep fixes minimal and focused — one concern per edit.

#### E. Resolve threads

Resolve all addressed review threads:

```bash
gh api graphql -f query='
mutation {
  t1: resolveReviewThread(input: {threadId: "ID1"}) { thread { isResolved } }
  t2: resolveReviewThread(input: {threadId: "ID2"}) { thread { isResolved } }
}'
```

Batch multiple thread resolutions into a single mutation where possible.

#### F. Commit and push

```bash
git add -A
git commit -m "address review feedback (review-loop round N/5)"
git push
```

If there were no actionable findings in this round (all reviewers had nothing or only informational comments), skip the commit — just push to re-trigger for the next round.

Then go back to step **A** for the next round.

---

### Phase 3: Submit and report

#### Submit the PR

After all 5 rounds are complete, mark the PR as ready for human review:

```bash
gh pr ready <PR_NUMBER>
```

#### Report

After exiting the loop, summarize:

```
Review loop complete — 5 rounds finished.

  Round  | Codex     | Greptile  | Devin     | Fixed | Skipped
  -------|-----------|-----------|-----------|-------|--------
  1      | 4 comments| 2 comments| (no post) | 5     | 1
  2      | 2 comments| 1 comment | 3 comments| 5     | 1
  3      | 1 comment | (no post) | (no post) | 1     | 0
  4      | 0 comments| 1 comment | (no post) | 1     | 0
  5      | 0 comments| 0 comments| (no post) | 0     | 0

  Total fixed: 12
  Total skipped: 2
  PR: https://github.com/owner/repo/pull/123
  PR submitted for human review.

  Skipped findings:
  - src/auth.ts:45 — "Consider renaming this variable" (nit)
  - src/db.ts:112 — "Add null check on framework-guaranteed value" (overly defensive)
```

Mark reviewers as `(no post)` if they did not post findings for that round.

---

## PR Standards

### Title format

Use semantic PR titles (Conventional Commits):

```
<type>(<scope>): <description>
```

#### Types

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `refactor` - Code change that neither fixes a bug nor adds a feature
- `perf` - Performance improvement
- `test` - Adding or fixing tests
- `chore` - Maintenance tasks

#### Scope (optional)

A noun describing the affected area: `fix(editor):`, `feat(sync):`, `docs(examples):`

#### Examples

- `feat(editor): add snap threshold configuration option`
- `fix(arrows): correct binding behavior with rotated shapes`
- `docs: update sync documentation`

### Body template

```md
<description paragraph>

### Change type

- [x] `bugfix` | `improvement` | `feature` | `api` | `other`

### Test plan

1. Step to test...

- [ ] Unit tests
- [ ] End to end tests

### Release notes

- Brief description of changes for users
```

#### Description paragraph

Start with: "In order to X, this PR does Y."

- Keep it specific — avoid vague phrases like "improve user experience"
- Link related issues in the first paragraph
- Don't expect readers to also read the linked issue

#### Change type

- Tick exactly one type with `[x]`
- Delete unticked items

#### Test plan

- List manual testing steps if applicable
- Remove the numbered list if changes cannot be manually tested
- Tick checkboxes for included test types

#### Release notes

- Write brief notes describing user-facing changes
- Use imperative mood: "Add...", "Fix...", "Remove..."
- Omit entirely for internal work with no user-facing impact

### API changes section

Include when changes affect `api-report.md`:

```md
### API changes

- Added `Editor.newMethod()` for X
- Breaking! Removed `Editor.oldMethod()`
```

### PR readiness

- Default to opening the PR as **ready for review**
- Use a **draft PR** only when the changed area is failing verification, incomplete, blocked, or otherwise not actually ready for review
- If only unrelated or clearly flaky verification failures remain, still open the PR as ready for review and explicitly call out the residual risk in the PR body

### Important

- Never include AI attribution ("Generated with Claude Code", "Co-Authored-By: Claude", etc.) in commits, PR titles, or descriptions
- Never use title case for descriptions — use sentence case
- Never put yourself as co-author of any commits
