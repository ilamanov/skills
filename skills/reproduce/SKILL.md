---
name: reproduce
description: Reproduce a reported problem, or measure a current behavior, with a repeatable check and evidence that a person can see. Use the same check later to prove that the problem is gone.
---

# Reproduce

## Goal

Make a problem occur on demand, and make it visible. A problem can be a bug, a slow operation, a failure, or any behavior that is not correct. When the check exists, you can confirm the problem, find its cause, and prove a fix.

## Steps

1. **Find the exact symptom.** Write down what the user saw, what they expected, and the conditions.
2. **Make a check.** The check is a set of steps that you can run again in the same way, for example a test, a script, or browser steps. It fails on the symptom that the user saw. For a performance or quality problem, the check measures the current state against a target. Use the same surface as the report.
3. **Capture evidence.** Use screenshots, screen recordings, logs, or measurements. Record where and when you captured each item.
4. **Run the check again after a change.** Use the same steps on the new target, for example a branch or production. Show the before and after results together.

## Rules

- If you cannot reproduce the problem, do not guess the cause. Tell the user what you tried and what you need.
- In production, only read. Get approval from the user before you change real data.
- Remove secrets and personal data from all evidence.
