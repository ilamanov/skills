---
name: ship
description: Ship a change as reviewed PRs, and run the review loop until the PRs are ready to merge.
---

# Ship

## Goal

Put a change on clean, reviewed PRs that are ready to merge. The user merges.

The change can be pre-existing local changes in the working tree, a Linear ticket, or a description of what to build.

## Steps

1. **Implement the change, if necessary.** If the changes are already in the working tree, go to step 2. If an approach was agreed earlier, implement it as agreed. Work in a fresh worktree off `main`. If you are already in one, use it. If not, make one. Implement the full change locally as one change. Do not think about the PRs yet. Make sure that the full change works.
   - If the working tree has stubs from the `probe` skill, they are the agreed architecture. Implement the details on top of them. Do not change their structure. If the implementation forces a change, tell the user.
2. **Split the change into a stack of PRs.** Do this only after the full change works. First, use the `deslop` skill on the working tree, if it is installed. It removes AI-generated code patterns, so that the reviewers see clean code. Each PR does one thing that you can see. If the split is simple and clear, tell the user the split and continue. If the change is complex or you can split it in different ways, wait for the user to approve the split. If you are not sure, wait. Use the stack split guidance below.
3. **Open the PRs.** Attach before and after evidence. If you have evidence from the `reproduce` skill, attach it, because it shows more. If not, attach screenshots of the visible changes.
4. **Run the review loop.** Use only the reviews from Codex and Devin. Sort each finding with the review triage below. Record each ignored finding on the PR. Examine the PRs again at intervals of approximately 10 minutes with a scheduled check-in. Do not wait for the user to ask. Stop the loop when CI is green and the latest findings are only ones that you ignore. Do not push small changes only to get a clean result from the reviewers. When the loop stops, remove the scheduled check-ins.
5. **Report.** When the review loop is complete, give the user the final report.

## Stack split

- Split by function, not by code structure.
- Put a helper in the same PR as its first caller. Do not make PRs that only add scaffolding.
- Before you split, save a snapshot of the full change. Then make the branches one at a time from the snapshot.
- Each PR must pass the checks on top of its parent.
- When you finish, compare the total diff of the stack with the snapshot. They must be identical.
- Use GitHub stacked PRs with the `gh stack` extension. If the extension is not installed, install it. If stacks are not available for the repository, one PR is satisfactory.

## Reviewer signals

- Reviews start automatically after each push. Do not request a review.
- Codex adds 👀 to the PR description when a review is in progress.
- Codex posts a review comment when it has findings.
- When Codex has no findings, it adds 👍 to the PR description. Sometimes it also posts a comment that says that it found no issues.
- Devin posts its findings as review comments.
- If a push does not start a new review, the change was too small to review. The last result stays valid.

## Review triage

Most of these products are MVPs. The reviewers think that each product is a large, mature system.

- **Fix** real bugs, data loss, and security holes that an attacker can use. Always protect money and sensitive data.
- **Ignore** unrealistic cases, overly defensive changes, and accessibility. For example, ignore races between tabs or devices of one user, scale that the product does not have, compatibility for data or callers that do not exist, optional hardening, and nits.
- **Hold** a real bug if its fix needs a large redesign. Do not fix it yourself.

## Final report

Write the report in ASD-STE100.

1. **Held for your decision.** For each held finding, tell the problem, how probable it is, and the size of the fix.
2. **PRs.** Give the link and the status of each PR.
3. **Fixed.** For each fixed finding, tell the problem and the commit.
4. **Ignored.** For each ignored finding, tell the problem and the reason.

## Rules

- Do not open drafts.
- Make each fix a new commit. Do not amend commits. Only a stack rebase can force-push.
- Do not merge.
- Do not change the status or the comments of a Linear ticket, unless the user tells you to.
