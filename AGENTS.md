# AGENTS.md

Orientation for any agent working in this repo. Read this before editing skill files.

## Two kinds of skills

This repo holds skills of two very different provenances. Treat them differently.

### External meta-skills — `.agents/skills/` (and `.claude/skills/`)

Skills installed from upstream sources via `npx skills update`. They are the *tools used to create, maintain, and improve* the user's own skills (skill-creator is the canonical example; more will be added over time).

- `.claude/skills/` is just symlinks into `.agents/skills/` — same files, different entry point.
- The authoritative list of what's installed (and from where) is `skills-lock.json` at the repo root.
- **Do not edit these files by hand.** They are read-only from any agent's perspective. The only legitimate way they change is `npx skills update`.
- If you spot a problem in an external meta-skill (bad advice, broken script), record it as a finding for the user to take upstream — don't patch it locally. Local patches get clobbered on the next update.

### User-owned skills — `skills/`

Skills the user wrote and maintains (e.g. `skills/ship/`, `skills/ticket/`, `skills/skill-improver/`). These are the editable ones.

- All skill improvements, refactors, new skills, and analysis-driven edits target this tree.
- Follow the house style in `.agents/skills/skill-creator/SKILL.md` — explain the *why*, prefer reframing over MUST/NEVER stacks, keep prompts lean, bundle scripts for repeated work.

## Skill description length limit

Frontmatter `description` fields have a **1024-character maximum**. Skills exceeding it are silently filtered from the agent's available-skills list and never trigger. When writing or editing a skill, keep the description well under 1024 chars (target ~800 to leave headroom) and put detailed guidance in the body. If a skill is mysteriously not triggering, measure its description first.

## Don't break the frontmatter YAML

The `description` is an unquoted YAML scalar — any `word: ` (word + colon + space) inside it parses as a nested mapping and silently breaks the install (`npx skills update` reports `No valid skills found`). Reword to avoid it (e.g. *"Auto-detects mode: DRAFT"* → *"Auto-detects whether the run is DRAFT"*); quoting works but is uglier. `https://` is fine (no space after colon).

## Keep guidance lean and non-prescriptive

Write the *why* and the *what*, not step-by-step *how*. Don't spell out specific commands, flags, or exact output formats — they go stale, and the agent can work them out from context. Trust the reader: one clear sentence beats a bulleted procedure. When you catch yourself enumerating commands or templating exact syntax, cut it back to intent.

## When in doubt

If you're about to edit a SKILL.md and you can't tell from the path whether it's user-owned, check `skills-lock.json`. Any skill name listed there is external — leave it alone.
