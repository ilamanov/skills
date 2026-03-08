---
name: cartograph
description: >
  Map any TypeScript/JS web app codebase into a structured vocabulary of surfaces,
  features, entities, relationships, operations, and flows. Surfaces are entry points
  (pages/routes); features are standalone capabilities embedded across surfaces
  (e.g., "Prompt Wizard", "Star Credits", "Content Unlock"). Produces a JSON file
  and an interactive HTML visualizer. Use when the user wants to understand a codebase,
  map its structure, see what entities exist, understand data flows, or get a high-level
  overview of what an app does. Triggers on: "map this codebase", "what does this app do",
  "show me the entities", "cartograph", "extract the structure", "codebase overview",
  "understand this repo".
---

# Cartograph

Extract a structural map of any TypeScript/JS web app: surfaces, features, entities, relationships, operations, and flows. Three orthogonal axes — surfaces are where you go (pages/entry points), features are what you can do (standalone capabilities), entities are what the app works with (data).

## Workflow

### Phase 1: Discover Codebase Structure

1. Read `package.json` for project name and dependencies (framework detection)
2. Glob for key structural files:
   - Schema: `**/*.prisma`, `**/schema.*`, `**/models/**`
   - Routes/Pages: `app/**/page.{tsx,ts,jsx,js}`, `app/api/**/*.{ts,js}`, `pages/**/*.{tsx,ts}`
   - Server actions: grep for `"use server"`
   - Components: `components/**/*.{tsx,jsx}`
   - Lib/services: `lib/**/*.{ts,js}`, `services/**/*.{ts,js}`
3. Read the directory tree to understand the overall shape

### Phase 2: Identify Surfaces

Surfaces are the top-level organizational axis — self-contained entry points or standalone pieces of functionality. Each app is fundamentally a collection of surfaces.

1. Walk the route tree (`app/**/page.tsx`) and identify each distinct user-facing experience
2. Group related routes into surfaces (e.g., `/create` + `/create/[id]/edit` = one "Creation Studio" surface)
3. Look for admin-only areas, standalone tools, dashboards, and onboarding flows
4. For each surface, determine:
   - **Entrypoint**: main page file and route
   - **Actor**: who uses it (user/admin/system)
   - **Description**: what this surface does as a standalone experience
5. After entities, operations, and flows are extracted, map each back to its surface(s):
   - `entityIds`: which entities does this surface read/write?
   - `operationIds`: which operations are triggered from this surface?
   - `flowIds`: which flows belong to this surface?
6. Identify entity exposure — find the limit of each entity's reach:
   - Entities in only 1 surface are **surface-scoped** (private)
   - Entities in 2 surfaces are **shared**
   - Entities in 3+ surfaces are **cross-cutting** (core infrastructure)

### Phase 3: Extract Features

Features are standalone capabilities embedded within surfaces. They're not pages — they're the reusable functional building blocks that surfaces compose. A surface is "where you go"; a feature is "what you can do there."

Look for these patterns:
1. **Tools** — interactive multi-step experiences (wizards, editors, sandboxes). Look for modal components, multi-step forms, stateful composition flows
2. **Interactions** — single-action engagement patterns (like, save, follow, share). Look for optimistic-update hooks, toggle actions, engagement server actions
3. **Transactions** — money/credit flows (purchase, tip, unlock). Look for payment integrations, credit deduction/grant logic, checkout flows
4. **Gates** — access control mechanisms (age verification, NSFW filtering, auth walls). Look for middleware, overlay components, confirmation dialogs
5. **Infrastructure** — backend capabilities used by other features (AI generation, media processing, webhook handlers). Look for polling loops, queue submissions, external API clients
6. **Workflows** — multi-step admin/system processes (content review, scan pipelines, approval queues). Look for status machines, review UIs, batch processing

For each feature:
- **Name and description**: what this feature does as a standalone capability
- **Kind**: tool, interaction, transaction, gate, infrastructure, or workflow
- **surfaceIds**: which surfaces embed this feature
- **entityIds**: which entities this feature reads/writes
- **implementations**: key files (2-5 most important, not every file)

Features should feel independently describable — "the like system", "the prompt wizard", "the star credit system". If you can't describe it without referencing a specific page, it's probably part of a surface, not a feature.

### Separate implementations = separate features

The same conceptual capability often exists as **independent implementations** in different surfaces — for example, a user-facing "Prompt Wizard" modal in chat and an admin "Prompt Remix Wizard" panel in the post management area. These share a backend service but have entirely different UI components, actors, and capabilities.

**Always create a separate feature entry for each distinct implementation**, even when they serve the same conceptual purpose. Do not collapse them into one feature with multiple `surfaceIds`. Two implementations are separate features if they have:
- Different UI components (different component trees / directories)
- Different actors (user vs admin)
- Different capabilities (one has extra modes, steps, or options)

Name them distinctly (e.g., "Prompt Wizard" vs "Admin Prompt Remix Wizard") so the developer can see both and decide whether they're related. They may share backend services — that's fine, note it in the description — but the feature entries stay separate.

**To avoid missing these**: after extracting features from one surface, scan every other surface's component tree for similar patterns. Grep for shared service imports (e.g., if a user feature imports from `lib/wizard/`, check if any admin code also imports from `lib/wizard/`). This catches admin/user mirror features that are easy to overlook.

### Phase 4: Extract Entities

Read schema/type definitions and extract domain objects:

1. **DB models** (high confidence) — Prisma models, TypeORM entities, Mongoose schemas
2. **TypeScript types/interfaces** (medium confidence) — types used as API payloads, form data, state
3. **Enums** (high confidence) — enum definitions representing domain concepts
4. **Derived types** (medium confidence) — transformed versions (e.g., `PostWithAuthor`)

For each entity: id, name, kind, description, source location, key fields (3-8 most important), confidence.

### Phase 5: Map Relationships

1. Foreign keys and references in schema → `has-many`, `belongs-to`, `has-one`
2. Nested includes/joins → confirms relationships
3. Type compositions → `derives-from`
4. Looser references → `references`

### Phase 6: Identify Operations

For each entry point (route handler, server action, API endpoint):

1. Which entity it targets
2. Operation type: `create`, `read`, `update`, `delete`, or `domain`
3. Descriptive name (e.g., "Publish Post", "Generate Preview")
4. Side effects on other entities
5. Implementation location (file + function)

### Phase 7: Synthesize Flows

1. Start from UI pages — what can a user do on each page?
2. Trace: UI action → handler → service → DB
3. Name each flow by its user-visible goal
4. Identify trigger and actor (user/admin/system)
5. List steps in order, linking to operations and entities

### Phase 8: Output

1. Assemble JSON following the schema in `references/json-schema.md`
2. Write `cartograph.json` to the repo root
3. Tell the user: "Open the visualizer (`assets/visualizer.html` in this skill's directory) in your browser and load `cartograph.json` via the file picker."

## Important

- **Read-only** — never modify the codebase being analyzed
- **Prefer inclusion** — when unsure, include with lower confidence
- **Plain language** — descriptions should be understandable by a PM
- **Relative paths** — all file paths relative to repo root
- **Large repos** — analyze by feature/route directory and merge
- See `references/json-schema.md` for the exact output format
