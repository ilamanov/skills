---
name: incremental-plan
description: Break a product or feature spec into a sequence of small, independently testable implementation steps. Use when the user has a spec document and wants to implement it incrementally rather than all at once — building and verifying one piece at a time before moving on. Triggers on requests like "break this spec into steps", "create an incremental plan", "split this into parts I can test", "how should I implement this step by step", "create a build plan", or when a user has a spec and wants a phased implementation approach.
---

# Incremental Plan

Break a spec into a sequence of small steps that can each be built and tested in isolation.

## Why

A big spec implemented end-to-end in one pass is hard to debug, hard to test, and hard to course-correct. Splitting it into incremental steps means each piece gets built, verified, and locked in before moving on. Problems surface early. The engineer stays in control.

## Workflow

### 1. Read the Spec

Read the spec document the user provides. Identify:

- The core mechanism (the fundamental thing that makes the product work)
- The distinct technical layers (e.g., backend service, database, frontend UI, external integrations, auth)
- Dependencies between features (what requires what)

### 2. Ask Clarifying Questions (if needed)

Usually the spec has everything needed. But ask if:

- The spec doesn't mention what's already built (greenfield vs. adding to existing product)
- It's unclear which parts the user considers highest-risk or most uncertain
- There are multiple valid orderings and the user might have a preference

Keep this light — 1-2 questions max. This is not an interview.

### 3. Decompose into Steps

Split the spec into the smallest steps that are each independently **demonstrable** — the engineer can run it, see it work, and confirm it's correct before moving on.

**Splitting principles:**

- **Core mechanism first.** Start with the fundamental thing that makes the product work, stripped of everything else. For a terminal streaming product, that's getting PTY output into a browser. For a chat app, that's sending and displaying a message. Everything else layers on top.

- **One technical concern per step.** Each step should touch one layer or one integration. "Build the WebSocket server" and "Build the terminal UI component" are separate steps, not one step. This keeps each step easy to reason about and test.

- **Defer auth, polish, and edge cases.** Security, error handling, and UX polish are important but should come after the core works. Hardcode credentials, skip validation, use ugly UI — whatever makes the step testable faster. Layer these on in later steps.

- **Each step must be testable by a human.** Every step ends with something the engineer can manually verify. "Refactor internal module" is not a step — it has no observable behavior to test. "Data flows from A to B and I can see it" is a step.

- **Prefer vertical slices over horizontal layers.** When possible, a step should cut through multiple layers to produce a visible result (e.g., "API endpoint + minimal UI to call it") rather than building an entire layer with nothing to show (e.g., "build all API endpoints"). But keep the slice narrow.

- **Integration steps are explicit.** When earlier steps were built in isolation with stubs or hardcoded values, add a step to connect them together. Don't assume integration is trivial — it's where bugs hide.

**Typical ordering pattern (adapt to the specific spec):**

1. Core mechanism — minimal proof that the fundamental thing works
2. Data layer — persistence, schema, basic CRUD
3. Core features — one step per feature or feature group, building on the data layer
4. Integration — connecting isolated pieces, replacing stubs with real implementations
5. Auth & permissions — layered on after core features work
6. Edge cases & error handling — robustness pass
7. Polish — UI refinement, performance, final UX details

This is a starting point, not a rigid formula. Some specs won't follow this order. Use judgment.

### 4. Write the Plan

Write the plan to `plan-<spec-name>.md` in the same directory as the spec.

**Format for each step:**

```markdown
## Step N: [Short Title]

**Goal:** One sentence — what this step achieves.

**Build:**

- Concrete list of what to implement
- Specific enough that an AI coding agent or engineer could start working from this

**Scope cutoffs:**

- What's intentionally deferred, stubbed, or hardcoded in this step
- Prevents scope creep and makes it clear what "done" means for this step

**Verify:**

- Concrete actions the engineer takes to confirm this step works
- "Start the server, open localhost:3000, you should see X"
- "Run this curl command, expect Y response"
- "Click the button, observe Z"

**Spec coverage:** Which sections/features of the original spec this step addresses (by name or reference).
```

**Plan structure:**

```markdown
# [Product/Feature Name] — Incremental Build Plan

**Source spec:** `<filename>`

**Overview:** 1-2 sentences on the overall approach — why the steps are ordered this way.

**Steps at a glance:**

1. [Step 1 title] — [one-line summary]
2. [Step 2 title] — [one-line summary]
   ...

---

## Step 1: [Title]

[full step detail]

## Step 2: [Title]

[full step detail]

...
```

## Key Principles

1. **Testable over comprehensive.** A step that builds 30% of the spec but can be fully verified is better than a step that builds 60% but can't be tested until more work is done.
2. **Err on the side of smaller steps.** When unsure whether to split, split. Two 30-minute steps are easier to manage than one 3-hour step that might go wrong halfway through.
3. **Stay at the right altitude.** The plan describes _what_ to build per step, not _how_ to implement it line by line. Leave implementation details to the engineer or coding agent. But be specific enough about scope and boundaries that there's no ambiguity about what's in vs. out.
4. **No orphan steps.** Every step must produce something verifiable. If a step exists only to "set up" the next step with no way to test it alone, merge it into the next step.
5. **The plan is a guide, not a contract.** Note in the document that step boundaries may shift during implementation — the point is to provide a clear path, not a rigid checklist.
