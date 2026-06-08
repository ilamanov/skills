import { html } from '../lib/html.js'

export function Logo() {
  return html`
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#0f172a" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="#38bdf8" stroke-width="2" />
      <circle cx="16" cy="16" r="2.5" fill="#38bdf8" />
      <circle cx="16" cy="7" r="2" fill="#f472b6" />
      <circle cx="24" cy="20" r="2" fill="#34d399" />
      <circle cx="8" cy="20" r="2" fill="#fbbf24" />
    </svg>
  `
}

export function Badge({ kind, children, dot }) {
  return html`<span class=${`badge badge--${kind}`}>
    ${dot && html`<span class="badge__dot"></span>`}${children}
  </span>`
}

export function SourceBadge({ source }) {
  return source === 'codex'
    ? html`<${Badge} kind="codex">Codex<//>`
    : html`<${Badge} kind="claude">Claude<//>`
}

const WORKSPACE_KIND_LABEL = {
  main: 'main checkout',
  'git-worktree': 'git worktree',
  'codex-worktree': 'codex worktree',
  'claude-worktree': 'claude worktree',
  external: 'external checkout',
}

export function workspaceKindLabel(kind) {
  return WORKSPACE_KIND_LABEL[kind] || kind
}
