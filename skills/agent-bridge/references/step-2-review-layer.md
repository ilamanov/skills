# Step 2: Implement the Review Layer, DB Changes, and Review Dashboard

You are working inside an existing web application codebase.

A previous step should have produced a planning doc describing which agent actions are exposed and which require review.

Your goal is to implement the **review layer** and the **review dashboard**, but **not the agent action endpoints yet**.

## Objective

For every action marked as **review-required**, create the infrastructure needed for safe human approval before data reaches the final system.

Also build a **local-only** review dashboard.

## Instructions

### 1. Read the planning doc

Read the action-planning doc created by the previous step:

```
/api/agent/AGENT_ACTION_PLAN.md
```

If you cannot find this file, stop and say:

> I cannot find `/api/agent/AGENT_ACTION_PLAN.md`.
> Please run **Step 1 (Discover Actions)** first.

Use it as the source of truth for:

* which actions require review
* what entities are involved
* what types of pending changes must be stored

### 2. Assess what the codebase supports

Before implementing anything, evaluate what storage and persistence mechanisms the codebase already has. The review layer should use whatever makes sense for this particular codebase:

* database tables (SQL, NoSQL, etc.)
* file-based storage (JSON files, SQLite, etc.)
* in-memory with file persistence
* any other mechanism already in use

Do **not** force a specific storage approach. Adapt to what exists.

If the codebase has **no persistence layer at all** and the review layer would require adding one (e.g. adding a database to a project that doesn't have one), **stop and tell the user**. Explain what would be needed and ask for explicit permission before adding new infrastructure. Only proceed if the user agrees.

### 3. Implement review storage

For each review-required action, implement an intermediate review mechanism using whatever storage approach fits the codebase.

The review mechanism should capture at least:

* action type
* payload
* status: pending / approved / rejected
* created_at
* reviewed_at
* review_notes
* proposed_by
* resulting_record_ids if applicable

Also implement an audit log if not already present.

### 4. Build the review dashboard

Implement a dashboard for reviewing pending items.

Capabilities should include:

* list pending items
* inspect payload
* diff / preview before approval
* approve
* reject
* view audit/history

The dashboard should be **local-only by default**.

### 5. Write review plan doc

Record all review-layer decisions in:

```
/api/agent/AGENT_REVIEW_PLAN.md
```

If the file already exists, update it instead of creating a new one. When updating, preserve user edits. Update sections instead of overwriting the entire file.

Never create new random documentation files for findings. Always use the canonical files in `/api/agent/` so that later prompts can reliably discover prior decisions.

The doc should follow this structure:

```
# Agent Review System Plan

## Review Strategy

## Review Storage

## Audit Log

## Dashboard Design

## Manual Setup Required
...
```

### 6. Turn-based workflow

At each step clearly say:

* **What I did**
* **Your turn**
* **What I'm waiting for**

Do not pretend manual steps are complete unless they actually are.

Explicitly tell the user when they need to do things like (depending on the codebase):

* generate migration files
* review migration SQL/code
* apply migrations
* create storage files/directories
* restart the app
* verify dashboard behavior

## Constraints

* do not implement `/api/agent/actions/...` endpoints yet
* do not implement prod guardrails (that is Step 4, run separately if desired)
* do not expose mutation endpoints publicly

## Deliverables

1. review-layer implementation
2. review dashboard implementation
3. audit log support
4. updated planning doc at `/api/agent/AGENT_REVIEW_PLAN.md`
5. a clear list of manual user steps
