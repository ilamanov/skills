---
name: lecture-notes
description: Transform a plain-text video lecture transcript into clean, skimmable markdown study notes. Use when the user provides a lecture transcript (or a file containing one) and wants structured notes, a summary, or a study reference from it. Triggers on requests like "make notes from this lecture", "summarize this transcript", "turn this lecture into notes", or when a transcript file is provided with a request for notes.
---

# Lecture Notes

Transform a video lecture transcript into a well-structured markdown document optimized for skimming and review.

## Input

A plain-text transcript of a video lecture, provided either as:
- A file path to a `.txt` or `.md` file
- Text pasted directly into the conversation

Read the entire transcript before producing notes.

## Process

1. **Read** the full transcript to understand scope, structure, and key themes
2. **Identify** the natural topic boundaries — where the lecturer shifts subjects
3. **Extract** key concepts, definitions, examples, and takeaways per topic
4. **Write** the notes document following the output structure below

## Output Structure

Save the output as a markdown file. Use the lecture title or topic as the filename (e.g., `intro-to-neural-networks.md`). If unclear, ask the user or derive from content.

### Document layout

```
# [Lecture Title]

> **TL;DR:** [2-3 sentence summary of the entire lecture]

> **Key Takeaways:**
> - [3-5 most important points from the lecture]

---

## [Topic 1 heading]

[Concise notes as bullets — one idea per bullet]

- **Bold** key terms and definitions inline
- Use sub-bullets for supporting details or examples
- Include concrete examples the lecturer gave

## [Topic 2 heading]

...

---

## Glossary

| Term | Definition |
|------|-----------|
| ...  | ...       |

## Mentioned Resources

- [Any books, papers, tools, links, or names the lecturer referenced]
```

### Formatting rules

- Use `##` for major topic sections, `###` for subtopics within a section
- **Bold** key terms, names, and definitions on first use
- Use bullet points, not paragraphs — one idea per bullet
- Use sub-bullets (`  -`) for examples, clarifications, or supporting details
- Use `>` blockquotes for direct quotes worth preserving verbatim
- Use tables for comparisons or structured data the lecturer presents
- Keep bullets concise — aim for 1-2 lines each, not full sentences when possible
- Omit filler, repetition, tangents, and off-topic remarks
- Preserve the lecturer's logical flow — do not reorder topics
- Include the Glossary section only if the lecture introduces 3+ domain-specific terms
- Include the Mentioned Resources section only if the lecturer references external materials
- Omit the `---` dividers between sections if the document is short (< 5 sections)
