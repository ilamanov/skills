import { useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { Badge, SourceBadge } from './common.js'
import {
  archiveSession,
  unarchiveSession,
  deleteClaudeSession,
  formatWhen,
  timeAgo,
} from '../lib/api.js'

function Field({ label, value, mono, variant }) {
  if (!value) return null
  return html`<div class="session__field">
    <div class="session__field-label">${label}</div>
    <div class=${`session__field-value ${variant ? `session__field-value--${variant}` : ''} ${mono ? 'session__path' : ''}`}>${value}</div>
  </div>`
}

function SessionCard({ session, onMutated, flash }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const toggleArchive = async (event) => {
    event.stopPropagation()
    setBusy(true)
    try {
      if (session.archived) {
        await unarchiveSession(session.id)
        flash('Session unarchived — moved back to ~/.codex/sessions')
      } else {
        await archiveSession(session.id)
        flash('Session archived — moved to ~/.codex/archived_sessions')
      }
      onMutated()
    } catch (err) {
      flash(err.message, true)
      setBusy(false)
    }
  }

  const deleteSession = async (event) => {
    event.stopPropagation()
    const ok = confirm(
      `Permanently delete this Claude session?\n\n${session.title}\n${session.transcriptPath}\n\n` +
        `This removes the transcript file (and its sidecar data, if any) for good — ` +
        `there is no undo, and Claude has no archive to fall back on. ` +
        `Project memory and other sessions are left untouched.`,
    )
    if (!ok) return
    setBusy(true)
    try {
      await deleteClaudeSession(session.id)
      flash('Claude session deleted')
      onMutated()
    } catch (err) {
      flash(err.message, true)
      setBusy(false)
    }
  }

  return html`
    <div class=${`session ${session.archived ? 'session--archived' : ''}`}>
      <div class="session__head" onClick=${() => setOpen((v) => !v)}>
        <span class=${`session__chevron ${open ? 'is-open' : ''}`}>▶</span>
        <span class="session__title">${session.title}</span>
        <div class="session__badges">
          <${SourceBadge} source=${session.source} />
          ${session.archived
            ? html`<${Badge} kind="archived">archived<//>`
            : html`<${Badge} kind="active" dot=${true}>active<//>`}
        </div>
        <span class="session__when" title=${session.updatedAt}>${timeAgo(session.updatedAt)}</span>
      </div>
      ${open &&
      html`<div class="session__body">
        <${Field} label="Initial request" value=${session.initialRequest} />
        <${Field} label="Last request" value=${session.lastRequest} />
        <${Field} label="Outcome" value=${session.outcome} variant="outcome" />
        <div class="session__field">
          <div class="session__field-label">Details</div>
          <div class="session__field-value">
            ${session.userTurns} user turn${session.userTurns === 1 ? '' : 's'} ·
            updated ${formatWhen(session.updatedAt)} ·
            <span class="mono">${session.id}</span>
          </div>
        </div>
        <${Field} label="Working directory" value=${session.cwd} mono=${true} />
        <${Field} label="Transcript" value=${session.transcriptPath} mono=${true} />
        <div class="session__actions">
          ${session.source === 'codex'
            ? html`<button class="btn btn--sm" disabled=${busy} onClick=${toggleArchive}>
                ${busy ? '…' : session.archived ? 'Unarchive' : 'Archive'}
              </button>`
            : html`<button class="btn btn--sm btn--danger" disabled=${busy} onClick=${deleteSession}>
                  ${busy ? '…' : 'Delete'}
                </button>
                <span class="session__note">Permanent — Claude has no archive state. Removes the transcript only.</span>`}
        </div>
      </div>`}
    </div>
  `
}

export function Sessions({ sessions, filter, onFilterChange, onMutated, flash }) {
  const [query, setQuery] = useState('')

  const normalized = query.trim().toLowerCase()
  const visible = sessions.filter((s) => {
    if (filter === 'codex' && s.source !== 'codex') return false
    if (filter === 'claude' && s.source !== 'claude') return false
    if (!normalized) return true
    return [s.title, s.initialRequest, s.lastRequest, s.outcome, s.cwd]
      .join(' ')
      .toLowerCase()
      .includes(normalized)
  })

  const active = visible.filter((s) => !s.archived)
  const archived = visible.filter((s) => s.archived)

  const renderCard = (s) =>
    html`<${SessionCard} key=${`${s.source}:${s.id}`} session=${s} onMutated=${onMutated} flash=${flash} />`

  return html`
    <div class="controls">
      <input
        type="search"
        placeholder="Search titles, prompts, outcomes…"
        value=${query}
        onInput=${(e) => setQuery(e.target.value)}
      />
      <div class="segmented">
        ${['all', 'codex', 'claude'].map(
          (key) => html`<button
            key=${key}
            class=${filter === key ? 'is-active' : ''}
            onClick=${() => onFilterChange(key)}
          >${key === 'all' ? 'All' : key === 'codex' ? 'Codex' : 'Claude'}</button>`,
        )}
      </div>
    </div>

    ${active.length === 0 && archived.length === 0 && html`<div class="center-note">No sessions match.</div>`}
    ${active.length > 0 && html`<div class="sessions">${active.map(renderCard)}</div>`}

    ${archived.length > 0 &&
    html`<details>
      <summary class="subhead" style="cursor:pointer;list-style:none">
        ${archived.length} archived Codex session${archived.length === 1 ? '' : 's'} — click to show
      </summary>
      <div class="sessions" style="margin-top:10px">${archived.map(renderCard)}</div>
    </details>`}
  `
}
