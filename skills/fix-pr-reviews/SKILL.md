---
name: fix-pr-reviews
description: Fetch and triage code review findings from PR comments and/or review markdown files. Pulls review comments from the current branch's open PR (GitHub review comments, inline suggestions, and general comments that look like code reviews — from Claude Code, Codex, Copilot, etc.), classifies which findings are valid versus ignorable, explains how valid findings should be fixed, and sets up a thread watcher for new PR review comments when working against a GitHub PR. Does not modify code unless the user explicitly gives approval to apply fixes. Also accepts local review files. When explicitly asked to commit and push review fixes, pushes the branch and comments "@codex review" on the PR to request a fresh review. Triggers on requests like "fix PR reviews", "fix review comments", "fix PR feedback", "apply review fixes", "fix code review findings", "check new findings", or any mention of fixing/issues from PR comments or review files.
---

# Fix PR Reviews

Fetch and triage valid code review findings from PR comments and/or local review markdown files. The default first pass is analysis only: report which findings are valid, which can be ignored, and how each valid finding should be fixed. Do not edit files until the user explicitly gives a green light to apply fixes.

Important permission boundary:

- Approval to **fix/apply/address** review findings means edit files and run verification only.
- Approval to fix does **not** authorize staging, committing, or pushing.
- Stage only when the user explicitly says to stage.
- Commit only when the user explicitly says to commit.
- Push only when the user explicitly says to push.
- Never infer commit or push permission from phrases like "fix them", "apply the fixes", "go ahead", or "address the feedback".
- Review watchers are triage-only. A watcher may fetch comments and report new findings, but must not edit files, stage, commit, or push.

## Combined with PR workflow

When this skill is invoked together with the `pr` skill, the combined workflow is PR-first:

1. Use the `pr` skill to create or update the GitHub PR before trying to fetch review findings.
2. Immediately start or refresh the PR review watcher for that PR, even if no review comments exist yet and even before any fixes are applied.
3. Fetch and triage the current PR review streams once after the watcher is in place.
4. Keep checking for new or changed findings through the watcher while the PR remains open.

Do not wait for the first review findings or for approved fixes before creating the watcher in this combined workflow.

## Sources

This skill pulls findings from two sources (either or both):

1. **PR comments (automatic)** — Fetched from the open PR for the current branch via `gh`. Includes:
   - GitHub PR review comments (inline code comments)
   - PR review bodies (top-level review summaries)
   - General PR comments that contain code review content
   - Filters for comments that look like code reviews (mentions files, lines, bugs, suggestions, code snippets, etc.) from any reviewer — AI agents (Claude Code, Codex, Copilot, etc.) and humans alike.

2. **Local review files (if provided)** — Markdown files the user passes explicitly (e.g., `review1.md`, `review2.md`). Accept any number of files in any format (structured or free-form).

## Workflow

1. **Determine the PR** — Run `gh pr list --head <current-branch> --json number,url --jq '.[0]'` to find the open PR for the current branch. If no PR exists and no local files are provided, inform the user and stop.

2. **Fetch PR comments** — If a PR exists, fetch all review data:

   ```bash
   # Get PR review comments (inline code comments)
   gh api repos/{owner}/{repo}/pulls/{pr_number}/comments --paginate

   # Get PR reviews (top-level review bodies)
   gh api repos/{owner}/{repo}/pulls/{pr_number}/reviews --paginate

   # Get general issue comments on the PR
   gh api repos/{owner}/{repo}/issues/{pr_number}/comments --paginate
   ```

3. **Filter for review content** — From the fetched comments, keep only those that look like code reviews. Include a comment if it matches ANY of:
   - Mentions a file path (e.g., `src/foo.ts`, `components/bar.tsx`)
   - Contains code blocks or inline code references
   - Mentions line numbers
   - Uses review language (bug, issue, fix, error, should, missing, incorrect, vulnerability, race condition, unused, leak, etc.)
   - Contains a GitHub suggestion block (` ```suggestion `)
   - Comes from a known AI reviewer bot or user account
   - Is part of a PR review (not just a casual conversational comment)

   Exclude comments that are clearly non-review (e.g., "LGTM", "thanks!", merge coordination, CI status discussions).

4. **Collect local review files** — If the user provided review files, read them too.

5. **Build a unified issue list** — Extract every distinct finding across PR comments and local files. Deduplicate: if multiple sources flag the same issue (same file + same concern), merge them into one entry. Preserve the strongest/clearest description. Track the source of each finding (PR comment URL or local file name).

6. **Triage each finding** — Classify every finding into one of:
   - **Valid** — A real bug, logic error, security issue, correctness problem, or worthwhile performance/reliability concern. Explain how you would fix it, but do not apply the fix yet.
   - **Skip** — Ignore if any of these apply:
     - Nit or style-only (naming preferences, formatting, comment wording)
     - Not actually valid (misunderstanding of the code, already handled, false positive)
     - Overly defensive (adds complexity for scenarios that realistically won't occur — e.g., redundant null checks on values guaranteed by the framework, error handling for impossible states, excessive input validation on internal-only code paths)

   When in doubt, lean toward skipping. The goal is to fix real bugs, not gold-plate the code.

7. **Report triage and proposed fixes** — Stop after the first exploration pass and output a brief summary. Include enough code references to make the triage auditable:

   ```
   ## Review findings triage

   ### Sources
   - PR #<number>: <count> comments fetched, <count> review findings extracted
   - <local-file>: <count> findings extracted
   - Deduplicated to <total> unique findings

   ### Valid findings
   - <file:line> — <one-line description>. Proposed fix: <specific minimal approach>. (source: <PR comment URL or file>)

   ### Ignored findings
   - <one-line description> — <reason skipped>

   ### Blockers / inaccessible findings
   - <source> — <what could not be fetched or verified>
   ```

   End by asking for explicit approval before applying any fixes if the user has not already given it.

8. **Only after explicit approval: fix valid issues** — If the user clearly says to apply fixes, then for each approved "Valid" finding:
   - Read the relevant source file if not already read
   - Apply the minimal change that addresses the issue
   - Do not refactor surrounding code or add unrelated improvements
   - Run focused verification when possible
   - Do not stage, commit, or push unless the user explicitly requested those actions in addition to fixing

9. **After approved fixes, report summary** — After all fixes, output a brief summary:

   ```
   ## Review fixes applied

   ### Sources
   - PR #<number>: <count> comments fetched, <count> review findings extracted
   - <local-file>: <count> findings extracted
   - Deduplicated to <total> unique findings

   ### Fixed
   - <file:line> — <one-line description> (source: <PR comment URL or file>)

   ### Skipped (not valid / nit / overly defensive)
   - <one-line description> — <reason skipped>

   ### Verification
   - <commands run and results>
   ```

10. **Start or refresh a PR review watcher** — If the run is working against a GitHub PR, set up a heartbeat automation attached to the current thread to watch that PR for new review comments. Do this immediately when this skill is used together with the `pr` skill, and otherwise do it after the initial PR comment triage pass or after approved fixes. Skip this for local-review-file-only runs or if no PR was found.

Use the app automation tool when available; if it is unavailable, say the watcher could not be created and include the exact manual command/check the user can run later. Prefer updating an existing watcher for the same PR over creating a duplicate.

Watcher requirements:

- Name it clearly, e.g. `Watch PR #<number> review findings`.
- Poll every 5 minutes while the PR is open unless the user explicitly asks for a different cadence.
- The watcher prompt must be self-contained: include repo, PR number/URL, branch, and the same fetch/filter/deduplicate/triage rules from this skill.
- Use the current thread as state. Each watcher report must include a compact `Watcher state` line with fetched comment/review/issue-comment IDs and timestamps it has already processed.
- On each wake, fetch all three PR review streams again, compare against the latest `Watcher state`, and process every unseen or updated review-like comment. This must handle multiple back-to-back new comments in one run.
- Report to the user only when new or changed review findings are found, using the same `Review findings triage` format: sources, valid findings, ignored findings, blockers, and explicit approval request before fixes.
- Do not repeat already-triaged findings unless they changed materially or a new duplicate needs to be deduplicated into the existing finding.
- If the PR is closed or merged, report that once and pause/delete the watcher if the automation tool supports it.
- Do not use a watcher to apply fixes. When the user approves a watcher-reported finding, run this skill normally from Step 8.

11. **Stage, commit, and push only with separate explicit approval** — After approved fixes are applied:

- If the user explicitly asked to stage: stage only the specific files modified for review fixes.
- If the user explicitly asked to commit: commit with a descriptive message summarizing the fixes, e.g. `fix: address PR review findings`.
- If the user explicitly asked to push: push to the current branch with `git push`. This updates the existing PR automatically.
- If the push fails because the remote is ahead, stop and report the problem unless the user already explicitly approved pulling/rebasing.
- After a successful push to a branch with an open PR, add a new PR comment containing exactly `@codex review` to trigger a fresh Codex review. Use `gh pr comment <number> --body "@codex review"` or the equivalent GitHub API. Do this only after the push succeeds; if no open PR exists, say no review trigger was posted.

## Guidelines

- Never create new files unless a finding explicitly requires it.
- Never modify code during the initial review-finding exploration pass.
- Treat "check", "review", "triage", "look at", "which are valid", and similar wording as analysis-only unless the user also explicitly says to fix/apply.
- Wording such as "fix them", "apply the fixes", "go ahead", "green light", or "address the feedback" authorizes code edits and verification only.
- Wording such as "commit the fixes" authorizes committing, but not pushing.
- Wording such as "push the fixes", "commit and push", or "update the PR branch" authorizes pushing.
- Keep fixes minimal and focused — one concern per edit.
- If a finding is ambiguous or could go either way, skip it and mention it in the summary so the user can decide.
- If two findings conflict, skip both and flag in the summary.
- Preserve existing code style (indentation, naming conventions, patterns).
- When applying GitHub suggestion blocks (` ```suggestion `), use the suggested code directly.
- If `gh` is not authenticated or the repo has no remote, fall back to local review files only and inform the user.
