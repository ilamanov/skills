# Step 1: Explore Codebase, Identify Actions, Decide What to Expose

You are working inside an existing web application codebase.

Your goal is to **explore the codebase and produce a structured action inventory** for a future local AI-agent interface.

Do **not** implement endpoints or schema changes yet.

## Objective

Find all meaningful actions that users or developers can perform in the product, then run an **interactive interview** with the user to decide:

* which actions should be exposed to the agent
* which actions should remain internal
* which exposed actions require human review
* which exposed actions are safe for direct execution
* which actions are too risky and should be excluded

The future interface is intended to work like an MCP server in spirit, but implemented as a localhost HTTP API under `/api/agent/...`.

## Instructions

### 1. Explore the codebase

Scan the codebase and identify actions such as:

* create / update / delete entities
* uploads
* admin operations
* workflow triggers
* background jobs
* read-only queries
* publish/send/charge/external side effects

Look in places such as:

* API handlers
* controllers
* service layers
* form handlers
* admin pages
* background workers
* CLI utilities

For each candidate action, capture:

* action name
* short description
* where it lives in the codebase
* required inputs
* side effects
* whether it is read-only or write
* whether it has external side effects
* your default recommendation:
  * do not expose
  * expose as read-only
  * expose with review
  * expose with direct execution

### 2. Interview the user

Use `AskUserQuestion` or the closest equivalent interactive question tool whenever available.

The interview should be conversational and iterative.

At minimum, ask the user:

* which actions should be exposed?
* for each exposed write action, should it require review?
* are there actions you found that should definitely never be exposed?
* are there actions missing from the list?

Use **safe defaults**:

* read-only actions -> usually direct
* writes -> review by default
* deletes / publishing / emails / payments / webhooks -> review or exclude by default

### 3. Write findings to a doc

Always write findings to:

```
/api/agent/AGENT_ACTION_PLAN.md
```

If the file already exists, update it instead of creating a new one. When updating, preserve user edits. Update sections instead of overwriting the entire file.

Never create new random documentation files for findings. Always use the canonical files in `/api/agent/` so that later prompts can reliably discover prior decisions.

The doc should follow this structure:

```
# Agent Action Plan

## Purpose
(short explanation)

## Discovered Actions
(table or list)

## Exposure Decisions

### Exposed
...

### Exposed With Review
...

### Direct Execution
...

### Not Exposed
...

## Notes
...
```

The doc should contain:

* summary of the purpose of the agent layer
* full inventory of discovered actions
* final decisions:
  * exposed
  * internal-only
  * review-required
  * direct-execution
  * excluded
* open questions / unresolved items
* manual setup assumptions, if any

### 4. Turn-based workflow

At the end of each stage, clearly separate:

* **What I did**
* **Your turn**
* **What I'm waiting for**

If the user needs to do anything manually, say so explicitly.

## Constraints

* do not implement endpoints yet
* do not add DB schema yet
* do not add review tables yet
* do not add dashboard yet
* do not assume exposure decisions without confirming with the user

## Deliverable

Your final output for this step should be:

1. a structured list of discovered actions
2. interactive confirmation from the user
3. a written planning doc saved to `/api/agent/AGENT_ACTION_PLAN.md`
