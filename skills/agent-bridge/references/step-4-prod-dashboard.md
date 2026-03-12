# Step 4: Make the Review Dashboard Accessible in Production

The user has decided to make the review/approval dashboard accessible in production.

This step is **only** for the review/approval dashboard — not the full agent execution API. The `/api/agent/actions/*` endpoints must remain localhost-only.

---

You are working inside an existing web application codebase.

Steps 1-3 should already be complete: actions discovered, review layer built, agent endpoints implemented, all localhost-only.

Your goal is to implement the **security guardrails** needed to safely expose the review dashboard beyond localhost.

## Objective

Harden the review dashboard so it can be exposed in production with layered protections.

This is a higher-security operating mode and must be treated separately from the default local-only setup.

## Instructions

### 1. Read prior planning docs

Read:

```
/api/agent/AGENT_ACTION_PLAN.md
/api/agent/AGENT_REVIEW_PLAN.md
/api/agent/AGENTS.md
```

If any are missing, stop and instruct the user to run the earlier steps first.

### 2. Implement code-level guardrails

Implement as many of the following as are appropriate in code:

* **Explicit feature flags** for prod dashboard exposure (e.g. `ENABLE_AGENT_REVIEW_DASHBOARD=true` and `ENABLE_AGENT_REVIEW_DASHBOARD_PUBLIC=true`, both defaulting to false)
* **Strong auth integration points** (SSO/OAuth, or strong username/password with TOTP MFA)
* **Role/authorization checks** (only specific users: owner, admin, reviewer)
* **MFA required** for a dashboard that approves writes
* **Session hardening** (secure cookies, short session lifetime, idle timeout, forced re-auth for sensitive actions)
* **CSRF protection** (mandatory for any web dashboard that can approve writes)
* **Audit logging** for view/approve/reject actions (who viewed, who approved/rejected, when, from what IP/device/session, what payload was approved, what records changed)
* **Environment labeling and warnings** (loudly display environment name, app name, branch/deployment/workspace)
* **Action-type risk classification** (deletes, publishes, emails, charges, webhooks, permission changes, bulk updates require stricter approval: always-review, second confirmation, dry-run only, or two-person approval)
* **Stricter approval flow for high-risk actions**
* **Kill switch** (global emergency disable for dashboard access, approval actions, and agent processing)
* **Rate limiting and brute-force protection**
* **Safe rendering / XSS protection** for untrusted payloads (escape HTML, sanitize markdown, do not execute embedded URLs/scripts)
* **Approval pipeline isolation** (approve item -> controlled processor -> validates against allowlist -> executes known handler; dashboard should not become a generic admin console)
* **Read-only by default** (many admins can inspect, only designated reviewers can approve)
* **IP allowlist or network restriction** integration points (office IPs, VPN-only, Cloudflare Access / Tailscale / private network gateway)
* **Explicit restriction** that public prod exposure applies only to review/approval UI, not arbitrary action execution

### 3. Tell the user what they must do manually

Clearly separate what you implemented in code vs what the user must do manually in infrastructure or deployment.

Use `AskUserQuestion` or equivalent where helpful to confirm specifics.

Manual tasks the user will likely need to complete:

* configure auth provider / SSO
* configure MFA policy
* create reviewer roles and assign users
* configure IP allowlist / VPN / access gateway
* set secrets / env vars for the new feature flags
* configure TLS / proxy / ingress
* test real reviewer accounts
* verify session settings
* verify production routing only exposes dashboard paths, not `/api/agent/actions/*`
* decide which users get reviewer vs read-only access

Be explicit and concrete. Do not gloss over these — the user must complete them for prod exposure to be safe.

### 4. Update documentation

Update:

```
/api/agent/AGENTS.md
```

When updating, preserve user edits. Update sections instead of overwriting the entire file.

Never create new random documentation files. Always use the canonical files in `/api/agent/`.

Add or update sections explaining:

* dashboard is prod-accessible only if explicitly enabled via feature flags
* this applies only to review/approval flows
* what code-level guardrails exist
* what the user must configure manually
* what remains intentionally blocked (the full agent API is never exposed publicly)

Also update:

```
/api/agent/AGENT_REVIEW_PLAN.md
```

Add a section recording that prod dashboard access was implemented and what guardrails are in place.

### 5. Turn-based workflow

At each stage clearly say:

* **What I did**
* **Your turn**
* **What I'm waiting for**

Do not claim that infrastructure/security configuration is complete unless the user has actually completed it.

## Anti-Recommendations

When implementing prod dashboard access, explicitly warn the user against these patterns:

* do not expose the full `/api/agent/actions/*` interface publicly — only the review dashboard
* do not rely only on a shared secret for authentication
* do not rely on obscurity ("nobody knows the URL") as a security measure
* do not use the same auth for normal app users and reviewers without role separation
* do not allow the dashboard to approve actions with external side effects (emails, payments, webhooks) without explicit warnings shown in the approval UI
* do not allow approval of bulk destructive actions without extra review or second confirmation

Include these warnings in the documentation and surface relevant ones in the dashboard UI where appropriate.

## Constraints

* do not expose `/api/agent/actions/*` publicly — only the review dashboard
* do not expose arbitrary execution
* do not weaken local-only defaults for the rest of the system
* feature flags must default to disabled — prod exposure is never on by default

## Deliverables

1. code-level hardening for the review dashboard
2. updated `/api/agent/AGENTS.md` and `/api/agent/AGENT_REVIEW_PLAN.md`
3. explicit manual security checklist for the user
4. confirmation that only the review dashboard, not the full agent API, is eligible for prod exposure
