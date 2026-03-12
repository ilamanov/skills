# Step 3: Implement the Agent Endpoints

You are working inside an existing web application codebase.

Previous steps should already have:

* identified which actions to expose
* classified them as review-required or direct-execution
* implemented the review layer for reviewed actions

Your goal is to implement the **agent-facing API endpoints** and the **agent documentation**.

## Objective

Expose the approved action set through a localhost HTTP interface under `/api/agent/...`.

This interface should be MCP-like in spirit, but implemented as ordinary HTTP routes.

## Instructions

### 1. Read the planning docs

Read the docs produced by prior steps:

```
/api/agent/AGENT_ACTION_PLAN.md
/api/agent/AGENT_REVIEW_PLAN.md
```

If either file is missing, stop and instruct the user to run the earlier step first.

Use them as the source of truth.

### 2. Implement endpoints

Create `/api/agent/...` endpoints for approved actions only.

Suggested structure:

```
/api/agent/read/...
/api/agent/actions/...
```

Rules:

* only explicitly approved actions may be exposed
* review-required write actions must submit to the review layer, not write directly
* direct-execution actions may execute directly only if previously approved as such
* also consider read-only endpoints that help the agent understand the current state of the product — entity lists, individual records, counts, relationships, metadata, status fields, system summaries. These let the agent explore and understand the product before taking actions. Not every product needs them, but don't overlook them

### 3. Support multi-step workflows

For flows that require multiple user-like steps, create step-based endpoints.

Examples:

```
/api/agent/actions/create-post/start
/api/agent/actions/create-post/step
/api/agent/actions/create-post/confirm
```

### 4. Refactor shared logic

Avoid code duplication.

Use this shape:

```
core logic
   |
service layer
   |
wrappers
   |- normal app flows
   |- agent endpoints
```

### 5. Create AGENTS.md

Create:

```
/api/agent/AGENTS.md
```

Never create new random documentation files for findings. Always use the canonical files in `/api/agent/` so that later prompts can reliably discover prior decisions. When updating existing files, preserve user edits. Update sections instead of overwriting the entire file.

Document:

* higher-level purpose of the agent layer
* available endpoints
* review-vs-direct behavior
* how multi-step flows work
* safety expectations
* what must be configured manually by the user
* what is intentionally not exposed

### 6. Implement security requirements

The agent layer must implement these safeguards:

**Feature Flag Kill Switch** — The entire agent system must be disabled unless explicitly enabled (e.g. `ENABLE_LOCAL_AGENT_API=true`). Default: disabled.

**Secret Authentication** — Agent endpoints must require a secret token/header even on localhost (e.g. `X-Agent-Key: <secret>`). Do not rely on localhost alone.

**Hard Environment Checks** — The agent layer must refuse to start if: environment is production, host is not localhost/127.0.0.1, or required safety env vars are missing. Enforced in code, not just documented.

**Default Review for Writes** — All write operations go through the review layer by default. Direct execution only if explicitly approved by the user.

**Explicit Action Allowlist** — The agent may only call explicitly exposed actions. No arbitrary SQL, no direct internal function calls, no arbitrary table mutations.

**Rate Limiting / Queueing** — Protect endpoints from excessive agent requests.

**File Upload Sandboxing** — If the agent uploads files: enforce size limits, file type restrictions, sanitize filenames, constrain storage paths.

**No Silent Side Effects** — Actions that send emails, charge payments, publish content, trigger webhooks, or call external APIs should be always-review or dry-run/preview only.

**Migration / Maintenance Protection** — The agent must not trigger database migrations, bulk backfills, or destructive maintenance scripts unless explicitly exposed and approved.

### 7. Turn-based workflow

At each stage clearly say:

* **What I did**
* **Your turn**
* **What I'm waiting for**

If the user needs to restart the app, test routes, set env vars, or verify behavior manually, say so explicitly.

## Constraints

* keep agent routes localhost-only by default
* do not expose anything beyond the approved allowlist
* do not add prod dashboard guardrails here (that is handled in Step 4)
* do not expose review dashboard approval routes publicly

## Deliverables

1. `/api/agent/...` endpoints
2. shared-logic refactors
3. `/api/agent/AGENTS.md`
4. a list of manual testing/setup steps for the user
