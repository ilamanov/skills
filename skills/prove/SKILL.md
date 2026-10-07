---
name: prove
description: Capture evidence that a change works, at the level of proof that the change needs.
---

# Prove

## Goal

Show the user that a change works. The user must be able to trust the result without a test of their own.

## Steps

1. **Find what the change must do.** Include the edge cases that are important.
2. **Select the level of proof.**
   - For a small change, a screenshot or a short recording is sufficient.
   - For a change to a flow, record all the steps of the flow.
   - For a change that has state, for example accounts, payments, or saved data, record the full flow and the important edge cases.
3. **Use the app as a user.** Use the `drive-app` skill.
4. **Capture the evidence.** If possible, show the behavior before and after the change.

## Rules

- Prove the real behavior. Lint and tests that pass are not proof.
- Remove secrets and personal data from all evidence.
