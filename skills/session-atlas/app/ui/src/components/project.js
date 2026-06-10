import { html } from '../lib/html.js'
import { Logo } from './common.js'
import { Workspaces } from './workspaces.js'
import { Snapshots } from './snapshots.js'
import { Sessions } from './sessions.js'

export function Project({ data, busy, onBack, onRefresh, onMutated, flash }) {
  const { project, workspaces, sessions } = data
  const codexCount = sessions.filter((s) => s.source === 'codex').length
  const claudeCount = sessions.filter((s) => s.source === 'claude').length
  const archivedCount = sessions.filter((s) => s.archived).length

  return html`
    <div class="topbar">
      <div class="topbar__main">
        <h1 class="topbar__title"><${Logo} />${project.name}</h1>
        <div class="topbar__meta">
          <span class="mono">${project.path}</span>
          ${project.branch && html`<span>branch <span class="mono">${project.branch}</span></span>`}
          ${project.remote && html`<span>remote <span class="mono">${project.remote}</span></span>`}
        </div>
        <div class="topbar__meta">
          <span>${sessions.length} sessions (${codexCount} Codex, ${claudeCount} Claude)</span>
          <span>${workspaces.length} worktrees</span>
          ${archivedCount > 0 && html`<span>${archivedCount} archived</span>`}
        </div>
      </div>
      <div class="topbar__actions">
        <button class="btn btn--ghost" onClick=${onBack}>← Projects</button>
        <button class="btn" disabled=${busy} onClick=${onRefresh}>
          ${busy ? html`<span class="spinner"></span>` : '↻'} Refresh
        </button>
      </div>
    </div>

    <div class="panels">
      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">Worktrees <span class="panel__count">${workspaces.length}</span></h2>
          <p class="panel__sub">present on disk · git list + managed stores</p>
        </div>
        <${Workspaces}
          workspaces=${workspaces}
          gone=${data.goneWorktrees}
          projectPath=${project.path}
          onMutated=${onMutated}
          flash=${flash}
        />
        <${Snapshots} projectPath=${project.path} onMutated=${onMutated} flash=${flash} />
      </section>

      <section class="panel">
        <div class="panel__head">
          <h2 class="panel__title">Sessions <span class="panel__count">${sessions.length}</span></h2>
          <p class="panel__sub">newest first · archived collapsed below</p>
        </div>
        <${Sessions} sessions=${sessions} onMutated=${onMutated} flash=${flash} />
      </section>
    </div>
  `
}
