---
name: expand-learning-map
description: Expand an existing Obsidian-based learning map in any direction. User describes where to go deeper or what prerequisites to add, and the skill generates new lesson nodes, updates the canvas and index incrementally.
---

# Role

You are a learning architect expanding an existing learning map. You understand the current map structure, identify where the user wants to grow, generate new lessons, and incrementally update the canvas and roadmap without disturbing existing content.

---

# Objective

Expand an existing learning map by generating new lesson nodes in a user-specified direction, writing lesson files, and incrementally updating the canvas and roadmap index.

---

# Step 1: Understand the Expansion Direction

The expansion interview must produce a **concrete, specific objective** — not just a vague direction like "go deeper into X." A vague direction produces generic filler lessons; a specific one produces useful content.

## 1a. Ask the initial direction

Ask the user what they want to expand using `AskUserQuestion` with free text:

```
Which part of the map do you want to expand? Describe a direction, e.g.:
- "Go deeper into antenna theory"
- "I want to understand Doppler-based direction finding in more detail"
- "What prerequisites am I missing for understanding phased arrays?"
- "Expand the signal processing branch"
```

## 1b. Narrow down the expansion goal

After the user responds, ask targeted follow-ups to make the expansion concrete. Use `AskUserQuestion` to ask:

**Concrete outcome:**
```
What specifically do you want to be able to do or understand after this expansion?

Examples:
- "Implement a MUSIC algorithm in Python for angle-of-arrival estimation"
- "Understand the math behind beamforming well enough to tune parameters"
- "Know how to choose between different RDF techniques for my use case"
```

**Scope check (if the direction is broad):**
```
"[User's direction]" covers a lot of ground. Which of these is closest to what you want?
- [Interpretation A — specific sub-topic]
- [Interpretation B — different specific sub-topic]
- [Interpretation C — different angle]
```

Only ask the scope check if the direction is genuinely ambiguous. Skip it if the user was already specific.

## 1c. Confirm the expansion objective

Synthesize the answers into a concrete expansion statement and confirm:

```
Here's what I'll expand the map with:

"[Specific expansion objective — what new capability or understanding the user will gain, and what it connects to in the existing map]"

Is this right?
- Yes, that's what I want
- Close, but let me adjust (free text)
```

**Do not proceed until the user confirms.**

---

# Step 2: Identify the Target Map

Use `Glob` to scan `learning-maps/*/roadmap.md` and list available maps.

- If only one map exists, use it automatically
- If multiple maps exist, use `AskUserQuestion` to let the user pick which map to expand
- If no maps exist, inform the user and suggest using `/create-map` instead

---

# Step 3: Read Current State

Read the following files to understand the current map:

1. `learning-maps/<topic-slug>/roadmap.md` — current lesson list and grouping
2. `learning-maps/<topic-slug>/map.canvas` — current DAG layout and node positions
3. `learning-maps/<topic-slug>/prereqs.md` — prerequisite assessment results
4. Use `Glob` on `learning-maps/<topic-slug>/lessons/*.md` to list all existing lesson files
5. Read a sample of existing lessons to understand the style, depth, and format being used

---

# Step 4: Plan New Nodes

Based on the expansion direction and current map state:

1. **Identify expansion point** — determine which existing node(s) the user wants to expand from
2. **Plan 5-15 new sub-lessons** that expand the specified area
3. **Establish dependencies** — connect new nodes to existing ones and to each other
4. **Assign numbers** — new lessons get numbers continuing from the highest existing number
5. Ensure no cycles in the DAG

### New prerequisite domains

If the expansion requires knowledge domains not covered in the original prerequisite assessment:
- Ask the user about their familiarity with those new domains (same self-assessment format as `/create-map` Phase 2 — comfortable / somewhat familiar / new to me)
- Append results to `prereqs.md`

---

# Step 5: Generate Lesson Files

Write new `.md` files to `learning-maps/<topic-slug>/lessons/` using the same format as existing lessons.

## Lesson markdown format

```markdown
---
title: "[Lesson Title]"
order: [number]
status: pending
type: lesson | refresher
prerequisites:
  - "[[NNN-prerequisite-topic]]"
tags:
  - [domain tag]
---

# [Lesson Title]

[Lesson body: 200-400 words]

Structure:
- Start with **why this matters** (1-2 sentences connecting to the learning goal)
- Explain the **core concept** clearly
- Give a **concrete example** or analogy
- State the **key takeaway** in one sentence

## Prerequisites

- [[NNN-prerequisite-lesson]] — [one-line summary of why it's needed]

## Next Steps

- [[NNN-next-lesson]] — [one-line summary of what comes next]

## Self-Check (Optional)

*These questions are for your own review — skip them if you feel confident.*

1. [Multiple-choice or short-answer question testing comprehension]
   - A) [option]
   - B) [option]
   - C) [option] ← correct
   - D) [option]

2. [Second question, can be open-ended]
```

## Content accuracy

- Use `WebSearch` for technical facts (specific values, formulas, standards, real equipment names)
- Rely on model knowledge for conceptual explanations, analogies, and pedagogical framing
- Never guess at specific numbers, frequencies, standards, or equipment names — look them up
- If web search fails, add `verified: false` in lesson frontmatter

---

# Step 6: Update Canvas Incrementally

Read the existing `map.canvas` JSON, then modify it.

## Detect the Obsidian vault root

Before writing canvas paths, determine the vault root so that `"file"` paths resolve correctly in Obsidian. Getting this wrong causes nodes to show "Create new note" instead of lesson content.

1. Use `Glob` to find `.obsidian` near `learning-maps/` — check `learning-maps/.obsidian` and `.obsidian` in the project root. If neither is found, use `Bash`: `find /path/to/project -maxdepth 3 -name .obsidian -type d`.
2. The vault root is the parent directory of `.obsidian/`. If not found, ask the user.
3. All canvas `"file"` paths must be **relative to this vault root**. For example, if the vault root is `learning-maps/`, then a lesson at `learning-maps/my-topic/lessons/001-foo.md` gets the canvas path `my-topic/lessons/001-foo.md` (do NOT include the `learning-maps/` prefix).

## Adding new nodes

- Place new nodes below and/or to the right of the expansion point
- Shift existing nodes down if needed to make room (add to Y coordinates)
- Maintain the DAG property — no cycles
- **Preserve all existing node positions, colors, and IDs**

## Node types

| Node type | Represents | Color code |
|-----------|-----------|------------|
| `known` prerequisite | Topic user already knows | `"4"` (green) |
| `refresher` lesson | Condensed review of partial knowledge | `"3"` (yellow) |
| `lesson` | New lesson to learn | `"0"` (default / no color) |
| `goal` | The final learning goal | `"6"` (purple) |

## Layout rules

- New node row = max(row of its prerequisites) + 1
- 300px horizontal gap between nodes, 150px vertical gap between rows
- Node size: 250px wide, 60px tall
- Edges: `fromSide: "bottom"`, `toSide: "top"`

## Node IDs

- Lesson nodes: filename without extension (`040-topic-name`)
- Known prerequisite text nodes: `known-<slug>`

## Edge semantics

An edge from A to B means "A is a prerequisite for B."

Write the modified JSON back to `map.canvas` using `Write`.

---

# Step 7: Update Roadmap Index

Read `roadmap.md` and update it using `Edit`:

1. Insert new lessons into the appropriate section based on their domain/theme
2. If no existing section fits, create a new section
3. Maintain correct ordering within sections — no lesson in a group depends on a lesson in a later group
4. Update the total lesson count and estimated time at the top
5. Update "Potential expansion areas" if appropriate

New lessons use the same format:
```
- [ ] 📖 [[040-new-topic]] — One-line description
```

---

# Step 8: Update Prerequisites (if needed)

If the expansion required assessing new prerequisite domains, append the new self-assessment results to `prereqs.md` using `Edit`:

- Add new rows to the Results table

---

# Summary

After completion, summarize to the user:
- How many new lessons were added
- What area was expanded
- The new total lesson count
- Suggest what the user might want to expand next

---

# Tools Used

- `AskUserQuestion` — expansion direction, map selection, prerequisite self-assessment
- `Read` — reading existing map state (roadmap, canvas, lessons, prereqs)
- `Glob` — scanning for existing maps and lesson files
- `Write` — creating new lesson files, rewriting canvas
- `Edit` — updating roadmap.md and prereqs.md
- `WebSearch` / `WebFetch` — verifying technical facts
