import { useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Badge, workspaceKindLabel } from './common.js'
import { removeWorktree, timeAgo } from '../lib/api.js'

function WorkspaceCard({ workspace, projectPath, onMutated, flash }) {
  const [busy, setBusy] = useState(false)
  const cls = [
    'workspace',
    workspace.kind === 'main' ? 'workspace--main' : '',
    workspace.orphaned ? 'workspace--orphan' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const remove = async (force) => {
    if (!force) {
      const ok = confirm(
        `Remove this worktree?\n\n${workspace.path}\n\n` +
          `Deletes the working directory and deregisters it from git. ` +
          `Conversation transcripts are kept.`,
      )
      if (!ok) return
    }
    setBusy(true)
    try {
      await removeWorktree(projectPath, workspace.path, force)
      flash('Worktree removed')
      onMutated()
    } catch (error) {
      setBusy(false)
      if (error.data?.dirty) {
        const force2 = confirm(
          `${error.message}\n\nForce-remove anyway and discard those changes? This cannot be undone.`,
        )
        if (force2) return remove(true)
      } else {
        flash(error.message, true)
      }
    }
  }

  return html`
    <div class=${cls}>
      <div class="workspace__top">
        <span class="workspace__branch">${workspace.branch || (workspace.detached ? 'detached HEAD' : '—')}</span>
        <span class="workspace__kind">${workspaceKindLabel(workspace.kind)}</span>
        <div class="workspace__badges">
          ${workspace.codexStatus && html`<${Badge} kind=${badgeForCodex(workspace.codexStatus)}>codex: ${workspace.codexStatus}<//>`}
          ${workspace.claudeStatus && html`<${Badge} kind="claude">claude: ${workspace.claudeStatus}<//>`}
          ${!workspace.codexStatus && !workspace.claudeStatus && html`<${Badge} kind="muted">no agent session<//>`}
          ${workspace.orphaned && html`<${Badge} kind="warn">not in git worktrees<//>`}
          ${workspace.prunable && html`<${Badge} kind="warn">prunable<//>`}
        </div>
      </div>
      <div class="workspace__path">${workspace.path}</div>
      ${workspace.latest &&
      html`<div class="workspace__latest">
        Latest: <b>${workspace.latest.title || 'Untitled'}</b>
        · ${workspace.latest.source} · ${timeAgo(workspace.latest.updatedAt)}
        · ${workspace.attached} session${workspace.attached === 1 ? '' : 's'}
      </div>`}
      ${workspace.kind !== 'main' &&
      html`<div class="workspace__actions">
        <button class="btn btn--sm btn--danger" disabled=${busy} onClick=${() => remove(false)}>
          ${busy ? '…' : 'Remove worktree'}
        </button>
      </div>`}
    </div>
  `
}

function badgeForCodex(status) {
  if (status === 'archived') return 'archived'
  if (status === 'active + archived history') return 'active'
  return 'active'
}

export function Workspaces({ workspaces, gone, projectPath, onMutated, flash }) {
  const withSessions = workspaces.filter((w) => w.attached > 0 || w.kind === 'main')
  const idle = workspaces.filter((w) => w.attached === 0 && w.kind !== 'main')
  const goneTotal = gone?.total || 0
  const card = (w) =>
    html`<${WorkspaceCard}
      key=${w.path}
      workspace=${w}
      projectPath=${projectPath}
      onMutated=${onMutated}
      flash=${flash}
    />`

  return html`
    <div class="workspaces">${withSessions.map(card)}</div>
    ${idle.length > 0 &&
    html`<div class="subhead">${idle.length} present, no agent session — cleanup candidates</div>
      <div class="workspaces">${idle.map(card)}</div>`}
    ${goneTotal > 0 &&
    html`<div class="gone-note">
      ${goneTotal} worktree${goneTotal === 1 ? '' : 's'} referenced by past sessions no longer
      exist${gone.withSessions > 0 ? ` (${gone.withSessions} had sessions)` : ''} on disk —
      already deleted, hidden from this list. Their transcripts still appear under Sessions.
    </div>`}
  `
}
