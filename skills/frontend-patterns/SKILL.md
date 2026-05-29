---
name: frontend-patterns
description: Generally-applicable frontend/UI best practices. Use whenever building, modifying, or reviewing UI — adding a form/button/dialog/modal, wiring keyboard shortcuts, creating any interactive surface that submits a form, or any time TSX/JSX is being written or edited. Consult BEFORE writing the code so the patterns are baked in, not retrofitted. If a scenario described in the skill body matches the work, apply the pattern — don't ask, just follow it (call out the choice in one line so the user can override).
---

# Frontend Patterns

Generally-applicable best practices for frontend work. **Read every pattern below. If any matches what you're about to build, apply it.** Don't ask permission for things that are codified here — just follow the rule and note in one line that you did.

## When to consult this skill

Any time you are:
- Writing or editing TSX/JSX
- Adding a button that performs a save/create/submit action
- Adding any form
- Adding any dialog, modal, popover, or sheet
- Wiring keyboard shortcuts
- Reviewing UI changes

If none of the patterns below match the scenario, return to the original task without comment.

## Patterns

- For desktop, `Cmd+Enter` should always "submit" — be it save, create, send, confirm, or any other primary action. `Cmd+Enter` should behave exactly as if clicking on the primary button manually (same disabled/loading/validation behavior, same side effects). Use `Ctrl+Enter` on Windows/Linux (`e.metaKey || e.ctrlKey`).
- When you need to use a dialog, use `ResponsiveDialog` instead, which shows a Dialog on desktop and a Drawer on mobile. This is better UX for mobile because dialogs on mobile are not that great. If this component doesn't exist, then create one by using the Dialog and Drawer components from shadcn (mirror shadcn's `Dialog` API so it's a drop-in — `Content`, `Header`, `Title`, `Description`, `Footer`, `Trigger`, `Close`).
- When rendering markdown content (chat messages, LLM output, comments, notes, any user/AI-authored text that may contain markdown), **never just dump the string into a `<div>` or `<p>` with `{text}` or `whitespace-pre-wrap`.** Use a real markdown renderer. Default to **`react-markdown`** with **`remark-gfm`** (tables, strikethrough, task lists, autolinks) **and `remark-breaks`** (so single `\n` becomes a `<br>` — without this, single newlines collapse and the output looks like a wall of run-on text, which is the failure mode agents repeatedly ship). For code blocks add `rehype-highlight` or `react-syntax-highlighter`. Install: `npm i react-markdown remark-gfm remark-breaks`. Minimal usage:
  ```tsx
  import ReactMarkdown from 'react-markdown';
  import remarkGfm from 'remark-gfm';
  import remarkBreaks from 'remark-breaks';

  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{text}</ReactMarkdown>
  ```
  Do **not** use `dangerouslySetInnerHTML` with a hand-rolled regex replacer (`.replace(/\n/g, '<br>')` etc.) — it's an XSS hole and misses every other markdown construct. If the project already standardizes on a different renderer (`marked`, `markdown-it`, MDX), use that — but verify single-newline-to-`<br>` behavior is on (`breaks: true` in marked/markdown-it).
- **Prefer server components.** Add `'use client'` only when the component genuinely needs the browser — interactive state/effects (`useState`, `useEffect`, refs), event handlers, or browser-only APIs. Keep client boundaries as low in the tree as possible: push interactivity into small leaf components rather than marking a whole page/route `'use client'`.
- **Style with Tailwind utilities and the project's existing design tokens; avoid custom CSS.** Reach for the configured tokens/theme (colors, spacing, radii, typography) rather than hard-coded values, and avoid one-off CSS files or inline `style={{…}}` unless there's something Tailwind genuinely can't express (call out why in one line when you do).
- **Keep reusable design-system primitives under `components/ui/*`.** Generic, app-wide building blocks (buttons, inputs, dialogs, etc.) live there; feature-specific components do not (co-locate those with the feature — see the `codebase-conventions` skill).

## How to behave when this skill applies

1. Identify which pattern(s) match the work.
2. Apply them. Don't propose alternatives unless there's a concrete reason the pattern doesn't fit.
3. In one short line, tell the user which pattern you applied so they can override if needed.
4. If `ResponsiveDialog` doesn't exist and you had to create it, mention that too.

## Future patterns

This skill will grow over time. New patterns should be added as bullet points in the **Patterns** section above, phrased as rules the agent can apply mechanically.
