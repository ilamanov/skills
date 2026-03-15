---
name: fix-pr-reviews
description: Automatically fetch and fix valid code review findings from PR comments and/or review markdown files. Pulls review comments from the current branch's open PR (GitHub review comments, inline suggestions, and general comments that look like code reviews — from Claude Code, Codex, and other AI or human reviewers), triages them, and fixes the valid ones. Also accepts local review markdown files. Triggers on requests like "fix PR reviews", "fix review comments", "fix PR feedback", "apply review fixes", "fix code review findings", or any mention of fixing issues from PR comments or review files.
---

# Fix PR Reviews

Automatically fetch and fix valid code review findings from PR comments and/or local review markdown files.

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
   - **Fix** — Valid bug, logic error, security issue, or correctness problem. Apply the fix.
   - **Skip** — Ignore if any of these apply:
     - Nit or style-only (naming preferences, formatting, comment wording)
     - Not actually valid (misunderstanding of the code, already handled, false positive)
     - Overly defensive (adds complexity for scenarios that realistically won't occur — e.g., redundant null checks on values guaranteed by the framework, error handling for impossible states, excessive input validation on internal-only code paths)

   When in doubt, lean toward skipping. The goal is to fix real bugs, not gold-plate the code.

7. **Fix valid issues** — For each "Fix" finding:
   - Read the relevant source file if not already read
   - Apply the minimal change that addresses the issue
   - Do not refactor surrounding code or add unrelated improvements

8. **Report summary** — After all fixes, output a brief summary:

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
   ```

9. **Commit and push** — After all fixes are applied:
   - Stage all changed files: `git add` the specific files that were modified.
   - Commit with a descriptive message summarizing the fixes, e.g.: `fix: address PR review findings` followed by a short list of what was fixed.
   - Push to the current branch: `git push`. This updates the existing PR automatically.
   - If the push fails (e.g., remote is ahead), pull with rebase first (`git pull --rebase`) then push again.

## Guidelines

- Never create new files unless a finding explicitly requires it.
- Keep fixes minimal and focused — one concern per edit.
- If a finding is ambiguous or could go either way, skip it and mention it in the summary so the user can decide.
- If two findings conflict, skip both and flag in the summary.
- Preserve existing code style (indentation, naming conventions, patterns).
- When applying GitHub suggestion blocks (` ```suggestion `), use the suggested code directly.
- If `gh` is not authenticated or the repo has no remote, fall back to local review files only and inform the user.
