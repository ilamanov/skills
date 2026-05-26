---
name: ui-patterns
description: Generally-applicable UI/frontend best practices. Use whenever building, modifying, or reviewing UI — adding a form/button/dialog/modal, wiring keyboard shortcuts, creating any interactive surface that submits a form, or any time TSX/JSX is being written or edited. Consult BEFORE writing the code so the patterns are baked in, not retrofitted. If a scenario described in the skill body matches the work, apply the pattern — don't ask, just follow it (call out the choice in one line so the user can override).
---

# UI Patterns

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

## How to behave when this skill applies

1. Identify which pattern(s) match the work.
2. Apply them. Don't propose alternatives unless there's a concrete reason the pattern doesn't fit.
3. In one short line, tell the user which pattern you applied so they can override if needed.
4. If `ResponsiveDialog` doesn't exist and you had to create it, mention that too.

## Future patterns

This skill will grow over time. New patterns should be added as bullet points in the **Patterns** section above, phrased as rules the agent can apply mechanically.
