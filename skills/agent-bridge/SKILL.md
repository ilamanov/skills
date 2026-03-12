---
name: agent-bridge
description: Build a safe local AI-agent HTTP interface for any web application. Scans the codebase, discovers all product actions, and exposes them as localhost API endpoints with a review/approval layer. Use when the user wants to expose product actions to an AI agent, create an agent API layer, build agent endpoints, add an MCP-like interface to their app, or make their app controllable by an AI agent. Works with any web framework.
---

# Agent Bridge

Build a safe localhost HTTP interface (`/api/agent/...`) that lets a local AI agent explore, understand, and operate a web application — similar in spirit to an MCP server but implemented as simple HTTP endpoints.

## Workflow

This skill has 4 steps. Steps 1-3 are sequential and build on each other. Step 4 is optional. Ask the user which step to run. Recommend starting with Step 1 if this is a fresh setup.

Present:

```
Which step would you like to run?

1. Discover Actions — scan codebase, identify actions, decide what to expose (start here)
2. Review Layer — implement review tables, audit log, and local review dashboard
3. Agent Endpoints — implement /api/agent/... routes and AGENTS.md
4. Prod Dashboard — (optional) expose the review dashboard in production with security guardrails
```

Steps 1-3 keep everything localhost-only. If after completing steps 1-3 you want the review/approval dashboard to also be accessible in production, run Step 4 to implement the required security guardrails and get a checklist of manual infrastructure work.

Use `AskUserQuestion` or equivalent interactive tool for the selection.

## Step Execution

Each step has a dedicated reference file with full instructions. Load the appropriate file based on the user's choice:

- **Step 1**: Read [references/step-1-discover-actions.md](references/step-1-discover-actions.md) and follow it
- **Step 2**: Read [references/step-2-review-layer.md](references/step-2-review-layer.md) and follow it
- **Step 3**: Read [references/step-3-agent-endpoints.md](references/step-3-agent-endpoints.md) and follow it
- **Step 4**: Read [references/step-4-prod-dashboard.md](references/step-4-prod-dashboard.md) and follow it

## Canonical Files

All steps read/write to these fixed paths so each step can find prior decisions automatically:

| File | Created by | Purpose |
|------|-----------|---------|
| `/api/agent/AGENT_ACTION_PLAN.md` | Step 1 | Action inventory and exposure decisions |
| `/api/agent/AGENT_REVIEW_PLAN.md` | Step 2 | Review tables, audit log, dashboard design |
| `/api/agent/AGENTS.md` | Step 3, updated by Step 4 | Runtime documentation for agents discovering the system |

Never create random documentation files. Always use these canonical paths. When updating existing files, preserve user edits — update sections, don't overwrite.

## Cross-Step Rules

These apply to every step:

- **Turn-based workflow**: At the end of each stage, clearly state: **What I did**, **Your turn**, **What I'm waiting for**
- **Interactive interviews**: Use `AskUserQuestion` or equivalent for all user decisions
- **Safe defaults**: Propose sensible defaults so the user can confirm quickly
- **No assumptions**: Never assume exposure or safety decisions without user confirmation
- **Manual steps**: Never pretend manual steps (migrations, env vars, restarts) are complete unless they actually are
