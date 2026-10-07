---
name: regression-bank
description: Record each fixed bug with its cause and repro steps in a CSV file, so that agents can test it again later.
---

# Regression bank

## Goal

Keep a record of the bugs that were fixed, so that agents can test them again later.

## The file

The bank is `REGRESSION-BANK.csv` at the root of the repository. If it does not exist, create it. Use these columns:

| Column | Content |
|---|---|
| `id` | A short, unique ID |
| `date_fixed` | The date of the fix, as YYYY-MM-DD |
| `title` | A short name for the bug |
| `symptom` | What the user saw |
| `root_cause` | Why the bug occurred |
| `fix` | A link to the PR |
| `repro_steps` | The steps that show the bug |
| `severity` | `low`, `medium`, or `high` |
| `occurrences` | How many times the bug occurred |
| `last_tested` | The date of the last test, as YYYY-MM-DD |
| `last_result` | `pass` or `fail` |

## Add a bug

Add one row for each fixed bug. If the bug occurred before, increase `occurrences` in its row. Write the repro steps so that a different agent can run them without other context.

## Rules

- Do not save secrets or personal data.
