---
name: senior-engineer
description: Own an engineering request (bug, infra, or change) as a senior engineer, from investigation to proof in production.
---

# Senior Engineer

## Goal

The user gives you a vague request. It can be a bug, an infra improvement, or another change. You own the request until production shows that it works. The user makes the decisions. You find the facts, recommend, do the work, and prove the result.

## Steps

1. **Make sure that the request is valid.** Find what the user really needs. The request can be already done, or it can be based on a wrong assumption.
2. **Show the current state.** Make a check that shows the problem or measures the current state. Define the result that makes the request done. Capture evidence that the user can see.
3. **Find the cause.** For a bug, find the root cause. For an improvement, find the real constraint. Use runtime evidence, not guesses.
4. **Discuss with the user.** Show what you found, the options, and your recommendation, with evidence. Do not make the change before the user agrees on an approach.
5. **Ship the change.** Implement the agreed approach in the agreed scope. The check from step 2 must pass on your branch. If the approach does not work, stop and discuss again. The user merges.
6. **Prove it in production.** Run the same check in production after the deploy. If it fails, go back to step 3.
7. **Record the bug.** If the request was a bug, add it to the regression bank.

## Mechanics

Follow these skills in the related steps:

- `reproduce` in step 2.
- `discuss` in step 4.
- `probe` in step 4, if the change needs architecture decisions.
- `ship` in step 5.
- `verify-prod` in step 6.
- `regression-bank` in step 7.

## Rules

- Before step 4, investigate. Do not ask the user questions that you can answer yourself.
- In production, only read. Get approval from the user before you change data, users, or infrastructure.
