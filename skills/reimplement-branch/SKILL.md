---
name: reimplement-branch
description: Reimplement the current branch on a new branch with a clean, narrative-quality git commit history. Use when the user wants to clean up messy commits, create a tutorial-style commit history, or prepare a branch for review with logical, self-contained commits. Triggers on requests like "clean up my commits", "reimplement this branch", "create a clean history", or "make my commits reviewable".
---

# Reimplement Branch

Create a new branch with a clean, narrative-quality commit history from an existing branch's changes.

## Gather Context

Run these commands to understand the current state:

```bash
git branch --show-current          # Source branch
git status --short                 # Uncommitted changes
git log main..HEAD --oneline       # Commits since main
git diff main...HEAD --stat        # Full diff summary
```

## Workflow

Use the autonomous workflow when the user wants the agent to complete the
entire reimplementation, verification, and PR flow end to end.

### 1. Validate source branch

- Ensure no uncommitted changes or merge conflicts
- Confirm branch is up to date with `main`

### 2. Analyze the diff

Study all changes between source branch and `main`. Form a clear understanding of the final intended state.

### 3. Create clean branch

```bash
git checkout main
git checkout -b <new-branch-name>
```

Use the user-provided branch name, or `{source-branch}-clean` if none provided.

### 4. Plan commit storyline

Break the implementation into self-contained logical steps. Each step should reflect a stage of development—as if writing a tutorial.

### 5. Reimplement the work

Recreate changes in the clean branch, committing step by step. Each commit must:

- Introduce a single coherent idea
- Include a clear commit message and description

**Use `git commit --no-verify` for intermediate commits.** Pre-commit hooks check tests, types, and imports that may not pass until full implementation is complete.

### 6. Verify correctness

- Confirm final state exactly matches source branch: `git diff <source-branch>`
- Run final commit **without** `--no-verify` to ensure all checks pass

### 7. Open PR

Use the `/pr` skill to create a pull request. Include a link to the original branch in the PR description.

## Interactive Stacked PR Workflow

Use this workflow when the user wants to collaborate on the reimplementation
timeline, create one clean change at a time, or build a stack of PRs where each
branch depends on the previous branch.

### 1. Treat the source branch as a snapshot

Record the source branch name and inspect its full diff against `main`, but do
not assume the source branch will be merged.

```bash
git branch --show-current
git status --short
git log main..HEAD --oneline
git diff main...HEAD --stat
```

### 2. Discuss the commit and PR timeline

Break the snapshot into reviewable milestones with the user. Prefer milestones
that can stand alone as stacked PRs:

- Foundation changes first, such as file moves, schema, or shared types
- Server-side behavior next
- API boundaries after the backing behavior exists
- UI integration last
- Documentation or agent instruction changes separately unless they are required

Do not start committing until the user confirms the initial timeline or the next
branch to carve out.

### Standalone-first carve-out pattern

It is okay, and often preferable, to break the snapshot into several small PRs
instead of trying to make every branch correspond to the original feature's
internal implementation order. Start by separating out changes that are
independently useful and easy to review:

- Repository instructions, skills, generated metadata, or other tooling changes
- Runtime/client swaps that do not depend on the feature
- Pure UI refactors that preserve behavior and create a cleaner place for later
  feature work
- File moves or namespace changes that can compile without the rest of the
  feature

For each standalone change, create a branch from the current stack base, stage
only that change, commit it, push it, and open a PR. The rest of the snapshot can
remain as unstaged working-tree changes on top of the branch so the next PR can
be carved out from the same source material.

When a standalone PR merges, temporarily stash the remaining unstaged snapshot
changes, update the new stack base, create the next branch, and restore the
snapshot changes:

```bash
git stash push --include-untracked -m "snapshot remainder before <next-branch>"
git switch main
git pull --ff-only
git switch -c codex/<next-change>
git stash pop
git restore --staged .
```

If restoring the snapshot conflicts with new `main` changes, resolve or reset
only the conflicted files needed for the current PR. Keep unrelated snapshot
work unstaged. This lets the agent and user repeatedly extract focused PRs while
preserving the rest of the source branch as local working-tree material.

### 3. Move the snapshot diff onto the stack base

Switch to the desired base, usually `main`, and apply the source branch diff into
the working tree without staging it.

```bash
git switch main
git diff main...<source-branch> | git apply
git status --short
```

Keep unrelated pre-existing worktree changes separate. If needed, unstage files
without discarding content before starting the stack.

### 4. Create the next branch from the current stack tip

For the first PR, branch from `main`. For later PRs, branch from the previous PR
branch so the stack is explicit.

```bash
git switch -c codex/<change-name>
```

### 5. Commit only the next milestone

Stage only the files or hunks that belong to the current milestone. Leave the
rest of the snapshot diff unstaged for later branches.

```bash
git add -p
git commit --no-verify
```

Use `--no-verify` for intermediate stacked commits when later milestones are
needed for the full app to pass checks.

### 6. Verify and open a PR for that branch

Run the relevant focused checks for the current branch. Open a PR whose base is
the previous stack branch, or `main` for the first branch. Mention the source
snapshot branch in the PR description.

### 7. Continue from the new stack tip

After each PR branch is created, continue from that branch, carve out the next
milestone from the remaining unstaged snapshot diff, and repeat until the final
stacked branch matches the source snapshot.

At the end, verify that the stack tip matches the snapshot:

```bash
git diff <source-branch>
```

## Rules

- Never add yourself as author or contributor
- Never include "Generated with Claude Code" or "Co-Authored-By" lines
- End state of clean branch must be identical to source branch
