---
name: agent-api-layer
description: "Add a localhost-only API layer to a codebase that exposes every action and query to an external AI agent. Creates a programmatic control plane for the entire app — the agent can do everything a user or admin can do through the UI, plus read any app state. Use when the user wants to (1) expose app actions to an AI agent via API, (2) create an agent API layer, (3) add programmatic access to app functionality, (4) build a control plane for their app, or (5) mentions 'agent API' or 'agent layer'. Triggers on requests like 'add an agent API', 'expose actions to an agent', 'create agent endpoints', 'build the agent layer'."
---

# Agent API Layer

Add a localhost-only API layer that exposes every action and query in the app to an external AI agent. The agent should be able to do everything a user or admin can do through the UI, plus read any app state.

## Workflow

Three phases, executed strictly in order. Each phase has a checkpoint — do NOT proceed until the user confirms.

1. **Phase 1: Scan & Discover** — catalog every action in the app
2. **Phase 2: Plan** — design the endpoint tree, refactoring, and conventions
3. **Phase 3: Implement** — build it all out

---

## Phase 1: Scan & Discover

Scan the entire codebase and catalog every action the app can perform. Search these locations:

| Source | What to extract |
|---|---|
| **Server actions / RPC functions** (e.g. `"use server"` files, tRPC routers, controller methods) | Every exported function that performs a backend operation — user-triggerable actions |
| **API routes / route handlers** (e.g. `app/api/**/route.ts`, Express routers, FastAPI endpoints) | Every HTTP handler (GET, POST, PUT, DELETE, PATCH) |
| **Client event handlers** (`onClick`, `onSubmit`, form actions, etc.) | Trace what server action or API call they invoke — these are UI entry points |
| **Scheduled jobs / cron** | Any cron config, scheduled functions, background job definitions |
| **Webhook handlers** | Incoming webhook routes |
| **Database writes** | ORM `create`, `update`, `delete`, `upsert` calls — some may not be exposed through any UI yet but represent capabilities the agent should have |

For each discovered action, record:

```
- Name: e.g., "Create Post"
- Source: e.g., app/admin/posts/create/actions.ts → generateRemixPrompt()
- Type: mutation | query | trigger
- Current auth: admin | authenticated-user | public | api-key
- Params: { modelId: string, prompt: string, ... }
- Multi-step: yes/no (if yes, list the steps)
- File I/O: yes/no (if yes, describe what files are involved)
```

### Checkpoint 1: Present Findings

Present the full action inventory to the user using `AskUserQuestion`. Organize by domain (e.g., "Models", "Posts", "Users"). First output the full inventory as text, then ask:

1. **"Here's what I found. Is this complete, or am I missing actions?"** — Options: `Looks complete` / `Missing some (I'll list them)` / `Let me review and get back to you`
2. **"Which of these should I skip (if any)?"** — Some actions may not make sense to expose. Let the user exclude them.
3. **Any domain-specific questions** — If you encountered ambiguity during the scan (e.g., "Is this admin-only flow also intended for the agent?", "Should the agent be able to trigger this webhook manually?"), ask now.

**Do NOT proceed to Phase 2 until the user confirms the inventory.**

---

## Phase 2: Plan the Implementation

Based on the confirmed inventory, create a detailed implementation plan covering all subsections below. Read [references/conventions.md](references/conventions.md) for endpoint conventions, response format, auth guard template, multi-step flow patterns, file upload handling, and the AGENT.md template.

### 2a. Refactoring Needed

Identify where business logic needs extraction so UI paths and agent paths share the same core:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  UI Component    │────▶│                  │     │  /api/agent/*   │
│  (browser)       │     │  Core Business   │◀────│  (agent caller) │
└─────────────────┘     │  Logic Function  │     └─────────────────┘
                        │                  │
┌─────────────────┐     │  (shared)        │
│  Server Action   │────▶│                  │
│  (existing)      │     └──────────────────┘
└─────────────────┘
```

Rules:
- **Extract, don't duplicate.** If a server action / route handler has business logic inline, extract it into a standalone function. The existing handler becomes a thin wrapper.
- **Caller-specific concerns stay in wrappers.** File uploads, auth, input format (FormData vs JSON) differ between UI and agent — the shared core should not care about these.
- **Don't change existing behavior.** UI paths must continue working exactly as before. This is purely additive.

For each action needing refactoring, note:
- Which file currently contains the logic
- What function to extract and where to put it
- What the server action wrapper will look like after extraction

### 2b. Endpoint Structure

Plan the full endpoint tree following the conventions in [references/conventions.md](references/conventions.md).

### 2c. Multi-Step Flows

For interactive/wizard flows, plan separate endpoints per step following the pattern in [references/conventions.md](references/conventions.md).

### 2d. File Uploads

For endpoints involving file uploads, follow the file upload handling pattern in [references/conventions.md](references/conventions.md).

### 2e. Read-Only / Query Endpoints

Plan query endpoints for anything the agent needs to understand app state:
- List and filter entities (with basic query params: `?status=published&limit=10`)
- Get details of a single entity with related data
- Get aggregate stats
- Get app configuration or settings

### 2f. Documentation File

Plan the `AGENT.md` file for the root of the agent API folder, following the template in [references/conventions.md](references/conventions.md).

### Checkpoint 2: Present the Plan

Present the full implementation plan to the user using `AskUserQuestion`. First output the complete plan as text, including:
- Summary of refactoring needed (which files change, what gets extracted)
- The full endpoint tree
- How multi-step flows will work
- How file uploads will work
- Any trade-offs or decisions you made

Then ask:
1. **"Here's my implementation plan. How does it look?"** — Options: `Looks good, proceed` / `Needs changes (I'll explain)` / `Too much scope, pare it down`
2. **Any specific trade-off questions** — If you had to make judgment calls, surface them now (e.g., "Should I expose deletion endpoints or keep those admin-UI-only?").

**Do NOT proceed to Phase 3 until the user approves the plan.**

---

## Phase 3: Implement

Execute the approved plan in this order. Read [references/conventions.md](references/conventions.md) for the auth guard template and other implementation details.

### Step 1: Auth Guard

Create the shared auth/localhost wrapper first — every endpoint uses it. Use the auth guard template from [references/conventions.md](references/conventions.md) as a starting point. Also block agent API routes in production — use whatever mechanism the framework provides (e.g. Next.js `middleware.ts` or `proxy.ts`, Express middleware, framework-level route guards, environment checks, etc.).

### Step 2: Refactor Business Logic

Extract shared functions as planned. After each extraction:
- Verify the existing UI path still works (the existing handler should behave identically).
- Run lint/typecheck to catch breakage early.

### Step 3: Read Endpoints

Create query/list endpoints first — lowest risk, immediately useful.

### Step 4: Write Endpoints

Create mutation endpoints, starting with simple ones, progressing to multi-step flows.

### Step 5: Documentation File

Write `AGENT.md` in the root of the agent API folder (e.g. `app/api/agent/AGENT.md`, `routes/agent/AGENT.md`, or wherever the agent endpoints live). This should reflect the actual endpoints created, not copy-pasted from the plan — make sure it's accurate.

### Step 6: Verify

- Run the project's lint, typecheck, and test commands.
- Test a few representative endpoints manually with `curl` to confirm they work end-to-end.
- Verify the existing UI is unaffected.

### Checkpoint 3: Report Results

Tell the user what was done:
- How many endpoints were created
- What refactoring was performed
- Any issues encountered or deviations from the plan
- How to test it (sample `curl` commands)
- Remind them to set `AGENT_API_KEY` in their `.env`
