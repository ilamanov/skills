# Agent API Conventions & Templates

## Table of Contents

1. [Endpoint Conventions](#endpoint-conventions)
2. [Response Format](#response-format)
3. [Multi-Step Flow Pattern](#multi-step-flow-pattern)
4. [File Upload Handling](#file-upload-handling)
5. [Auth Guard Template](#auth-guard-template)
6. [AGENT.md Template](#agentmd-template)

---

## Endpoint Conventions

- **Prefix**: All endpoints under `/api/agent/`.
- **Auth**: Every endpoint requires `x-api-key` header matching `AGENT_API_KEY` env var. Use timing-safe comparison.
- **Localhost-only**: The auth guard rejects requests where the host is not `localhost` or `127.0.0.1`. Block these routes entirely in production using whatever mechanism the framework provides (e.g. Next.js `middleware.ts` or `proxy.ts`, Express middleware, framework-level route guards, environment checks).
- **Methods**: `POST` for mutations, `GET` for queries.
- **Request body**: JSON (`application/json`).
- **Synchronous**: All endpoints block until completion. No streaming/SSE. Long-running operations return when done.
- **No batching** unless the app already has batch logic.
- **No new server-side state** just for this layer.

### Example Route Tree

Adapt file/folder structure to match the project's framework conventions. Below is one example (Next.js App Router style) — for Express/Fastify/etc., use the equivalent routing pattern.

```
/api/agent/
  AGENT.md                ← Documentation file: all endpoints, params, purpose
  models/
    route.ts              ← GET: list all models
    [modelId]/route.ts    ← GET: details, POST: update
    create/route.ts       ← POST: create a model
  posts/
    route.ts              ← GET: list/query posts
    [postId]/route.ts     ← GET: details, POST: update, DELETE: delete
    create/route.ts       ← POST: simple create
    create-wizard/
      start/route.ts      ← POST: begin wizard
      generate-prompt/route.ts
      preview/route.ts
      finalize/route.ts
  ...
```

---

## Response Format

All endpoints return this structure:

**Success:**
```json
{ "success": true, "data": { ... } }
```

**Error:**
```json
{ "success": false, "error": "Human-readable message", "code": "VALIDATION_ERROR", "details": { ... } }
```

Error codes: `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `INTERNAL_ERROR`

---

## Multi-Step Flow Pattern

For interactive/wizard flows, expose separate endpoints per step:

- Each step accepts accumulated state from prior steps as input and returns updated state plus the step's result.
- The caller (agent) is responsible for passing state forward — no server-side session.
- Each step should also be callable independently if the agent already has the required inputs.

### Example

```
POST /api/agent/posts/create-wizard/start
Body: { "modelId": "abc" }
→ { "data": { "model": {...}, "availableAxes": [...], "state": { "modelId": "abc" } } }

POST /api/agent/posts/create-wizard/generate-prompt
Body: { "state": { "modelId": "abc" }, "axisValues": { "mood": "playful" } }
→ { "data": { "generatedPrompt": "...", "state": { "modelId": "abc", "prompt": "..." } } }
```

---

## File Upload Handling

For endpoints involving file uploads, accept a JSON body with a `file` field supporting three input types:

- `{ "type": "path", "value": "/absolute/path/to/file.jpg" }` — server reads from local disk
- `{ "type": "base64", "value": "data:image/jpeg;base64,..." }` — inline content
- `{ "type": "url", "value": "https://..." }` — server downloads from URL

The endpoint converts any of these into the same blob/buffer the existing upload logic expects, then feeds it into the shared business logic.

---

## Auth Guard Template

Create a shared auth/localhost wrapper. Every endpoint uses this. Adapt to the project's framework and language.

```typescript
// Example for Node.js / TypeScript — adapt to the project's framework
import { timingSafeEqual } from 'crypto';

function safeEqual(a: string | null, b: string | undefined): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function withAgentAuth(handler: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    // 1. Localhost check
    const host = req.headers.get('host');
    if (!host?.match(/^(localhost|127\.0\.0\.1)(:\d+)?$/)) {
      return Response.json(
        { success: false, error: 'Forbidden', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }
    // 2. API key check (timing-safe)
    const apiKey = req.headers.get('x-api-key');
    const expectedKey = process.env.AGENT_API_KEY;
    if (!safeEqual(apiKey, expectedKey)) {
      return Response.json(
        { success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }
    // 3. Call handler with error catching
    try {
      return await handler(req);
    } catch (error) {
      return Response.json(
        { success: false, error: error instanceof Error ? error.message : 'Unknown error', code: 'INTERNAL_ERROR' },
        { status: 500 }
      );
    }
  };
}
```

Also block agent API routes in production. Use whatever mechanism the framework provides — e.g. Next.js `middleware.ts` or `proxy.ts` (for newer Next.js versions), Express middleware, framework-level route guards, or an environment variable check at the top of the guard.

---

## AGENT.md Template

Place this file in the root of the agent API folder (e.g. `app/api/agent/AGENT.md`, `routes/agent/AGENT.md`, or wherever the agent endpoints live). It is the agent's entry point — the first thing it reads to understand what it can do.

```markdown
# [App Name] Agent API

## Overview
[What this app does, 2-3 sentences.]

## Authentication
All endpoints require `x-api-key: <AGENT_API_KEY>` header.

## Endpoints
### [Domain]
| Method | Path | Description | Key Params |
|--------|------|-------------|------------|
| GET | /api/agent/[domain] | List all [entities] | ?status=&limit= |
| GET | /api/agent/[domain]/[id] | Get [entity] details | - |
| POST | /api/agent/[domain]/create | Create [entity] | { field1, field2 } |
| POST | /api/agent/[domain]/[id] | Update [entity] | { field1, field2 } |
| DELETE | /api/agent/[domain]/[id] | Delete [entity] | - |

### Workflows
#### [Workflow Name]
Multi-step flow. Steps:
1. POST /api/agent/.../start — initialize with { ... }
2. POST /api/agent/.../step-name — next step with { state, ... }
3. POST /api/agent/.../finalize — complete with { state, ... }

## Data Model Summary
[Key entities and relationships.]

## Error Handling
{ success: false, error: "message", code: "CODE" }
Codes: VALIDATION_ERROR, NOT_FOUND, UNAUTHORIZED, FORBIDDEN, INTERNAL_ERROR
```
