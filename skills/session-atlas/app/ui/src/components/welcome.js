import { useEffect, useState } from 'preact/hooks'
import { html } from '../lib/html.js'
import { fetchProjects, timeAgo } from '../lib/api.js'
import { Badge, Logo } from './common.js'

export function Welcome({ onSelect }) {
  const [projects, setProjects] = useState(null)
  const [error, setError] = useState(null)
  const [manual, setManual] = useState('')

  useEffect(() => {
    let alive = true
    fetchProjects()
      .then((data) => alive && setProjects(data.projects))
      .catch((err) => alive && setError(err.message))
    return () => {
      alive = false
    }
  }, [])

  const submitManual = (event) => {
    event.preventDefault()
    const trimmed = manual.trim()
    if (trimmed) onSelect(trimmed)
  }

  return html`
    <div class="welcome">
      <div class="welcome__brand">
        <${Logo} />
        <h1 class="welcome__title">Session Atlas</h1>
      </div>
      <p class="welcome__tagline">
        Every Codex and Claude Code session for a project — mapped to the worktrees they ran in.
        Pick a project to begin.
      </p>

      <form class="manual-path" onSubmit=${submitManual}>
        <input
          type="text"
          placeholder="/absolute/path/to/a/project"
          value=${manual}
          spellcheck="false"
          onInput=${(e) => setManual(e.target.value)}
        />
        <button class="btn btn--accent" type="submit" disabled=${!manual.trim()}>Open</button>
      </form>

      <div class="welcome__section-label">Discovered projects</div>
      ${error && html`<div class="center-note center-note--error">${error}</div>`}
      ${!projects && !error && html`<div class="center-note"><span class="spinner"></span>Scanning Codex & Claude history…</div>`}
      ${projects && projects.length === 0 && html`<div class="center-note">No projects found in ~/.codex or ~/.claude. Enter a path above.</div>`}
      ${projects &&
      html`<div class="project-grid">
        ${projects.map(
          (project) => html`
            <button
              key=${project.path}
              class=${`project-row ${project.exists ? '' : 'project-row--missing'}`}
              onClick=${() => onSelect(project.path)}
            >
              <div class="project-row__main">
                <div class="project-row__name">
                  ${project.name}
                  ${!project.exists && html` <span class="badge badge--muted">missing</span>`}
                </div>
                <div class="project-row__path">${project.path}</div>
              </div>
              <div class="project-row__counts">
                ${project.codex > 0 && html`<${Badge} kind="codex">${project.codex}<//>`}
                ${project.claude > 0 && html`<${Badge} kind="claude">${project.claude}<//>`}
                ${project.worktrees > 1 &&
                html`<${Badge} kind="muted">⎇ ${project.worktrees}<//>`}
                ${project.lastUpdated &&
                html`<${Badge} kind="muted">${timeAgo(project.lastUpdated)}<//>`}
              </div>
            </button>
          `,
        )}
      </div>`}
    </div>
  `
}
