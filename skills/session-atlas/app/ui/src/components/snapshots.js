import { useEffect, useState, useCallback } from 'preact/hooks'
import { html } from '../lib/html.js'
import { fetchSnapshots, restoreSnapshot, timeAgo } from '../lib/api.js'

// Recoverable snapshots of cleaned-up Codex worktrees. Lazy-loaded so it never
// slows the project view, and silent when there's nothing (non-Codex projects).
export function Snapshots({ projectPath, onMutated, flash }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState('')

  const load = useCallback(() => {
    fetchSnapshots(projectPath)
      .then(setData)
      .catch(() => setData({ dirty: [], clean: [], counts: { dirty: 0, clean: 0, total: 0 } }))
  }, [projectPath])

  useEffect(() => {
    setData(null)
    load()
  }, [load])

  if (!data || data.counts.total === 0) return null

  const restore = async (snap) => {
    setBusy(snap.id)
    try {
      const res = await restoreSnapshot(projectPath, snap.id)
      flash(`Restored → ${res.result.path}`)
      onMutated() // the new worktree shows up in the Worktrees list
      load()
    } catch (error) {
      flash(error.message, true)
    } finally {
      setBusy('')
    }
  }

  return html`
    <div class="snapshots">
      <div class="subhead">
        Cleaned-up worktree snapshots · ${data.counts.dirty} recoverable
      </div>
      ${data.dirty.length === 0 &&
      html`<div class="snapshot-none">No snapshots captured uncommitted work.</div>`}
      <div class="snapshots__list">
        ${data.dirty.map(
          (snap) => html`
            <div class="snapshot" key=${snap.id}>
              <div class="snapshot__top">
                <span class="badge badge--warn">${snap.type}</span>
                ${snap.baseRef && html`<span class="snapshot__base mono">${snap.baseRef}</span>`}
                <span class="snapshot__when">${timeAgo(snap.date)}</span>
              </div>
              ${snap.stat &&
              html`<div class="snapshot__stat">
                <b>${snap.stat.files}</b> file${snap.stat.files === 1 ? '' : 's'} ·
                <span class="snapshot__add">+${snap.stat.insertions}</span> ·
                <span class="snapshot__del">−${snap.stat.deletions}</span> ·
                <span class="mono">${snap.sha.slice(0, 8)}</span>
              </div>`}
              <div class="snapshot__actions">
                ${snap.restored
                  ? html`<span class="session__note">Restored — see Worktrees</span>`
                  : html`<button
                      class="btn btn--sm btn--accent"
                      disabled=${busy === snap.id}
                      onClick=${() => restore(snap)}
                    >
                      ${busy === snap.id ? '…' : 'Restore as worktree'}
                    </button>`}
              </div>
            </div>
          `,
        )}
      </div>
      ${data.clean.length > 0 &&
      html`<details class="empties">
        <summary>
          ${data.clean.length} snapshot${data.clean.length === 1 ? '' : 's'} with no uncommitted
          work (already in history)
        </summary>
        <div class="empties__list">
          ${data.clean.slice(0, 250).map(
            (s) => html`<div class="empties__row" key=${s.id}>
              <span class="mono">${s.sha.slice(0, 8)}</span>
              <span>${(s.subject || '').slice(0, 64)}</span>
            </div>`,
          )}
        </div>
      </details>`}
    </div>
  `
}
