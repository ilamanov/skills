---
name: ship
description: Ship changes as a PR (or Graphite stack) with an automatic review loop. Entry can be anything - changes already sitting in the working tree, a Linear ticket to implement, or just a plain-text description of what to build. Implements if needed, splits into a stack, then automatically triages review findings from Codex and Devin - fixing real bugs and ignoring unrealistic, overly-defensive, and accessibility findings without asking per finding - and reports at the end what was found, fixed, and ignored. Stops when everything is green; merging is the user's call. Use when the user says "ship", "ship these changes", "ship FOO-123", "open a PR for this", or describes a change and wants it shipped.
---

# Ship

Take something — existing changes, a ticket, or just a description — and get it onto a clean, reviewed PR stack. Handle the review loop yourself: fix the real bugs, ignore the noise, and report what you did. Stop when it's green. The user merges on their own time.

The whole skill runs on two habits: keep the user in the loop on the one judgment call that's theirs (how to split complex work), and handle the mechanical parts — including the entire review loop — yourself.

## What's being shipped

The invocation tells you. Three flavors:

- **Changes already exist locally** — the working tree is the implementation. Skip straight to deslop + stack.
- **A Linear ticket is referenced** — read it via the Linear MCP to understand what to build. The ticket is just the spec here: read it, build it, done. Leave the ticket itself alone (status, comments, assignee) unless the user asks. If the invocation references Linear and the Linear MCP isn't available, stop and tell the user — don't guess at the ticket's contents.
- **A plain-text ask** — the prompt itself describes the change. Just build it.

One special case: if the working tree holds a skeleton from the `probe` skill (stub files sketching the change's load-bearing decisions — schema, interfaces, signatures, module layout), that skeleton is the **agreed architecture** — the user already reviewed it, possibly after shaping the whole thing with `advisor` first (`advisor` → `probe` → `ship` is the pipeline for very complex changes). Fill in the details on top of it; don't redesign the shape it laid down, and raise it explicitly if implementation genuinely forces a deviation.

## Tools

Nothing is strictly required. Linear MCP, Graphite (`gt`), and `gh` all help, but work with what's installed:

- No `gt` → single PR (or plain git branches) instead of a stack.
- No `gh` → push the branch and give the user a compare URL; the review loop obviously needs `gh`, so tell them it's off.
- Linear MCP only matters when the invocation actually references a ticket (see above).

## Implementing (when the code isn't written yet)

Don't draft a plan first — just build. If something is genuinely ambiguous, ask; otherwise trust your read of it.

Work in a fresh worktree off `main` unless you're already sitting in one (harness-provided worktrees count — use them, don't nest). Implement the whole thing end-to-end on one working branch, uncommitted, until lint/typecheck/tests pass — and actually exercise the behavior if it's observable, don't let green lint stand in for "it works".

Then run the `deslop` skill on the working tree if it's installed (skip silently if not).

## Splitting into a stack

Look at the full diff and propose a breakup:

- Slice by functionality, not code shape — each PR should deliver something observable on its own. Helpers ride with their first caller; no scaffolding-only PRs.
- **Gate on the user only when it's warranted**: complex work (multiple subsystems, auth/schema/payments, new architecture) or an ambiguous ask where they should sanity-check your interpretation. Bounded work with an obvious shape → post the proposal as an FYI and keep moving. When unsure, gate.

Then split: snapshot the end state, rebuild branch by branch, each branch passing checks against its parent, cumulative diff matching the snapshot exactly. If there's no Graphite, one PR is fine — don't force a stack.

## Creating PRs

- **Always ready-for-review, never draft.** Drafts just stall the auto-review. (Watch out for `gt submit --no-interactive` — it defaults to draft, so pass `--publish`.)
- **Title**: conventional commits (`feat(scope): …`). **Body**: short — what changed and why, enough for a reviewer to orient.
- **Before/after screenshots for anything user-visible.** They go in the PR body itself, not just the chat — the PR is where reviewers look. Capture the _after_ from the actually-running app; capture the _before_ from the PR's own base branch (its parent in the stack — using `main` for a stacked child would smuggle the parent's changes into the comparison).
  - If the page sits behind a login, use the user's own browser session (drive their signed-in browser via the browser tools) rather than creating test users or hacking around auth. If that's not available, ask — don't declare it blocked.
  - If the view renders empty just because there's no data, mock some data for the shot, then revert the mock so it never reaches the diff.
  - Embed as GitHub attachment URLs (`user-attachments/...`), not files committed to the branch — repo links don't render reliably in PR bodies and throwaway images bloat the diff. After editing, double-check the images actually render.

## Review loop (automatic — this is the important part)

Codex and Devin review the PRs remotely. **Listen to both** — comments from `@codex` and from `@devin`. Ignore CodeRabbit, Greptile, and any other bot entirely. Don't triage their comments, don't reply to them, don't let them block anything.

**Triggering is automatic.** The reviewers auto-trigger in a smart way after every push — you do **not** post a comment to kick off a review, and you do **not** retrigger after pushing fixes. If a push doesn't trigger a review, that's the signal the change was small enough not to need one — take it at face value and move on. Never manually request a review to force another round.

**How to read the signals.** Each agent posts its status on the PR — a review-in-progress indicator (e.g. Codex's 👀 on the PR description), a review comment when it has findings, or a clean bill when it doesn't (e.g. Codex's 👍 on the PR description with no new comment). Read each agent's own comments and reactions to tell in-progress / findings / clean apart, per agent.

**What counts as clean, precisely** — a PR is clean when, for every agent reviewing it, the most recent review it actually ran came back with no findings you'd fix. This resolves the one case that would otherwise be ambiguous: after you push fixes, a review that _doesn't retrigger_ (the change was too small to warrant one) counts as that agent accepting the current state — treat the prior clean/handled signal as still standing. Don't wait for a fresh clean signal that will never come, and don't report a PR clean while an agent still has an open review round in progress or unaddressed findings. In short: the last signal an agent gave is the one that counts; silence after a too-small push preserves it, it doesn't reset it.

The loop, per round:

1. **Wait for findings.** Reviews take a while to land (Codex is typically ~6–7 minutes; Devin similar), so schedule a check-in on a **10-minute** window (ScheduleWakeup or whatever the harness gives you) rather than blocking or making the user ping you. On each check-in, read the signals above — reactions and any new comments from Codex and Devin — to tell in-progress / findings / clean apart.
2. **Triage and fix autonomously.** When findings land, run each one through the rules in **"What to fix, what to ignore, and when to stop"** below. You decide Fix vs. Ignore yourself — do **not** wait for the user to pick. Fix the real ones; ignore the noise.
3. **Act on the findings.**
   - **Fix**: make the change on the branch that owns the code, commit and push as new commits (never amend or force-push — the user reviews the PR commit by commit, and rewritten history destroys that), and reply on the finding's thread ("Fixed in `<sha>`: <one-line how>").
   - **Ignore**: reply on the finding's thread ("Ignoring: `<reason>`") **and** record it in an `## Explicit skips` section at the bottom of the PR body — one bullet per ignored finding with the reason, written for the reviewer so a later pass doesn't re-flag it. Every finding gets closed out one way or the other — nothing left hanging.
4. **No manual retrigger.** Pushing the fixes auto-triggers the next review round if the change warrants it. Just schedule the next 10-minute check-in. New findings → back to step 2, same rules. If a push produces no new review, the reviewers judged it too small to re-review — that's a stop signal, not something to override.
5. Also keep CI green throughout — treat a red check like a finding you can fix without asking (it's not a judgment call, it's broken).

**Done when**: all checks are green and the review has converged (see "when to stop" below) — every finding either fixed or explicitly ignored, and the incremental findings have dwindled to nits/unrealistic edge cases. Then **report** (see the reporting rule in the next section), say the PRs are ready, and stop — the PRs are the deliverable, and merging is the user's call on their own time.

## What to fix, what to ignore, and when to stop

This is the judgment that used to be the user's; now it's yours. For **every new finding**, before touching anything, analyze it:

- **What is the issue, exactly?** State the bug or risk in plain terms.
- **How likely is it to actually happen?** Frequent, rare, or basically never at this product's scale?

Then decide. **Err on the side of ignoring.** The reviewers (Codex and Devin) flag as if every product were a mature, high-scale, multi-tenant, security-hardened, fully-accessible system. It isn't — **most of these products are MVP-stage**: few or no users, no data in the old shape, no external API consumers, no budget yet for hardening. Reviewers surface a lot of unrealistic edge cases that aren't worth fixing, and chasing all of them burns time the MVP can't spare.

### Baseline assumptions about how the product is used

Judge every finding against these — a finding whose premise contradicts one of these is an Ignore:

- **The user works in a single tab.** Ignore anything whose setup is "suppose two tabs / two devices / two sessions issue a query at almost the same time" — optimistic-concurrency version checks, `expectedVersion`/compare-and-swap, lost-update and stale-write races, ETag/If-Match plumbing. A single user doesn't fire near-simultaneous mutations to race their own data. (The one exception is genuinely multi-actor state — two different _people_ editing the same record, or a background job racing a user action — judge that on its own.)
- **The user isn't trying to break the product.** Ignore hardening against a user maliciously feeding bad input to sabotage their own experience.
- **But real attackers are real.** Obvious security holes an outside attacker could exploit against an important part of the product **must be fixed** — especially anything on the **financial** side (payments, billing, balances, credits, anything touching money). Guard the money and the sensitive surfaces against hackers even at MVP stage. Security on the important paths is not "over-defensive"; it's the exception to err-on-ignoring.
- **The products aren't accessibility-friendly yet, and that's a deliberate call.** There's no budget for accessibility at this stage — the company prioritizes speed of development, and a11y comes later. **Ignore all accessibility findings**: missing ARIA attributes, keyboard-navigation gaps, focus management, color-contrast, screen-reader support, alt text, and the like. Note them as ignored-for-now, don't fix them.

### Ignore by default

- **Multi-tab / multi-device / multi-session races** (see above).
- **Scale/concurrency the product won't hit** — race guards on single-user flows, advisory locks against a double-click, rate limiting on internal endpoints, race fixes on a cron that runs one at a time.
- **Backward-compat for data or callers that don't exist** — no persisted old-shape data, no external consumers → the right move is a clean break: rename it, change the contract, drop the old value. No shims, dual-writes, deprecation windows, or migrations for data that isn't there. (If you _can't_ confidently establish there's no existing usage — a populated table, a shipped feature, a public API — don't assume it away; fix conservatively or flag it.)
- **Deploy shapes the project doesn't have** — code-runs-before-its-migration windows, cross-version rolling-deploy traffic on a single-instance app.
- **Optional hardening that would need a big overhaul / rearchitecture** — defensive or nice-to-have improvements whose only cost is complexity and whose fix means substantial restructuring. Not worth it at this stage; note as ignored and move on rather than pulling the thread. **This bucket is optional hardening only.** If the large fix addresses a _real_ correctness, data-loss, or security defect (see Fix), it does **not** belong here — don't bury it as ignored; hold it for the user (see "Real defects whose proper fix is large" below).
- **Accessibility** (see above).
- **Nits and style-only** comments.
- **Fix cascades** — a finding that only exists because an earlier defensive fix opened the very window it now guards. The whole chain is skippable; the cascade is the signal the first fix shouldn't have landed.

### Fix

- **Real correctness bugs** that would bite at the current scale — wrong results, broken flows, crashes on realistic input.
- **Data-loss bugs.**
- **Security issues a real attacker could exploit**, especially on financial or otherwise sensitive/important paths.

When a finding is genuinely ambiguous — you can't tell whether it's real without info you don't have (most often: whether there's existing usage that a "breaking change" would hurt) — don't guess. Fix conservatively or surface that one finding to the user; the rest of the round proceeds without waiting.

### Real defects whose proper fix is large

**The Fix rules always take precedence over the ignore buckets** — a realistic correctness, data-loss, or security defect is never ignored just because its fix is large. But a fix that needs substantial restructuring is too big to make autonomously inside the review loop: it's the kind of change the user should see and split deliberately, not something to slip in unreviewed. So for a real defect whose proper fix is large:

- **Don't attempt the big overhaul on your own**, and **don't silently declare the PR ready** as if the finding were noise — this is not the ignore path.
- **Hold it for the user.** Record it as an explicit skip on the PR (thread reply + `## Explicit skips` entry) noting the fix is real but large, and **highlight it prominently at the very end** (see the report) as a decision only the user makes — they decide whether it's worth fixing now. If a small, safe partial mitigation genuinely exists, you may apply it, but don't force a rearchitecture.

### When to stop the review phase

The reviewers auto-trigger after each push, so the loop naturally winds down as fixes land. Stop when **both**:

- **CI is green**, and
- **the review has converged** — the latest round's incremental findings are all small: nits, style, or the unrealistic/over-defensive/accessibility buckets above. In other words, nothing left that the rules say to Fix. (A real-but-large defect you've held for the user doesn't keep the loop running — you're not going to auto-fix it — but it isn't "resolved" either: it must surface prominently in the end report, not vanish into convergence.)

Concretely: once a round comes back with only ignorable findings (or a push produces no new review at all, meaning the reviewers judged it too minor to re-review), the review is done. **Don't keep pushing trivial changes just to chase a spotless bill from the bots** — a green checkmark on real bugs is the bar, not zero comments.

### Report at the end (always)

When the loop finishes, give the user the full picture — every finding raised across the whole review, grouped by PR. For each one:

- **What it was**, in plain terms.
- **Fixed** — how, and the commit — **Ignored** — with the reason — or **Held for your call** — a real correctness/data-loss/security defect whose proper fix is large (see that section above).

**Call out the ignored findings explicitly** and explain _why_ each was ignored (single-tab assumption, MVP scale, accessibility deferred, over-defensive, optional hardening that'd need an overhaul, etc.).

**Highlight the "held for your call" findings most prominently** — in their own short section at the very end, separate from the ignored noise. For each, explain the bug, how it would bite (and how likely), and roughly what fixing it would take, so you can decide whether it's worth doing now. These are the ones you might actually want to act on; don't let them blend into the ignore list.

This is the deliverable of the automatic loop: the user sees exactly what the bots found and what you decided about each — fixed, ignored, or held for their decision — without having to open the PRs.

## Rules

- **Autonomous review.** Fix the real bugs and ignore the unrealistic / over-defensive / accessibility findings yourself — don't wait for per-finding approval. The one exception: a real correctness/data-loss/security defect whose proper fix is large isn't auto-fixed and isn't ignored either — hold it and surface it at the end for the user to decide. Beyond that, the only judgment call left with the user is how to split complex work.
- **Listen to both `@codex` and `@devin`.** Ignore all other review bots (CodeRabbit, Greptile, etc.).
- **Never manually trigger or retrigger a review.** Reviews auto-trigger after every push; a push that produces no review means the change was too small to need one. Don't post `@codex review` / `@devin review` or otherwise force a round.
- Every ignored finding gets both a reply on its thread and an entry in the PR's `## Explicit skips` section, and is reported at the end with the reason.
- Never force-push, never amend published commits — fixes are always new commits on top.
- Never open PRs as drafts.
- No AI attribution in commits or PR bodies.
- Before/after screenshots in the PR body for anything user-visible.
- Tear down any scheduled check-ins when the loop finishes or the user bails.
