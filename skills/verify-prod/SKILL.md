---
name: verify-prod
description: After a change is merged, prove with evidence that it works in production and does not break other parts.
---

# Verify in production

## Goal

Prove that a merged change works for real users. Show evidence, not assumptions.

## Steps

1. **Find what to verify.** Find the merged change and the behavior that it must have. If a check for this behavior exists, use it. If not, make one.
2. **Wait for the deploy.** Make sure that production runs the merged commit.
3. **Run the check in production.** Capture the result. If you have evidence from before the change, show it next to the new result.
4. **Look for new problems.** Compare errors and logs before and after the deploy. Examine the related flows.
5. **Report the result.** Put the proof on the PR and on the ticket, if one exists. Tell the user if the change is verified or not.

## Rules

- In production, only read. Get approval from the user before you change real data.
- If the check fails or you find a regression, tell the user immediately. The user decides about a rollback.
