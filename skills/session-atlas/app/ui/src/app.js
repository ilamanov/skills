import { useEffect, useState, useCallback } from 'preact/hooks'
import { html } from './lib/html.js'
import { fetchProject } from './lib/api.js'
import { Welcome } from './components/welcome.js'
import { Project } from './components/project.js'

function readHashPath() {
  const match = location.hash.match(/^#project=(.*)$/)
  return match ? decodeURIComponent(match[1]) : null
}

export function App() {
  const [selected, setSelected] = useState(readHashPath())
  const [project, setProject] = useState(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  const load = useCallback(async (path, { refresh = false } = {}) => {
    setStatus('loading')
    setError(null)
    try {
      const data = await fetchProject(path, { refresh })
      setProject(data)
      setStatus('ready')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    if (selected) {
      location.hash = `project=${encodeURIComponent(selected)}`
      load(selected)
    } else {
      location.hash = ''
      setProject(null)
      setStatus('idle')
    }
  }, [selected, load])

  useEffect(() => {
    const onHash = () => setSelected(readHashPath())
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  const flash = useCallback((message, isError = false) => {
    setToast({ message, isError })
    setTimeout(() => setToast(null), 2600)
  }, [])

  let view
  if (!selected) {
    view = html`<${Welcome} onSelect=${setSelected} />`
  } else if (status === 'loading' && !project) {
    view = html`<div class="center-note"><span class="spinner"></span>Scanning sessions…</div>`
  } else if (status === 'error') {
    view = html`<div class="center-note center-note--error">
      ${error}
      <div style="margin-top:16px">
        <button class="btn" onClick=${() => setSelected(null)}>← Back to projects</button>
      </div>
    </div>`
  } else if (project) {
    view = html`<${Project}
      data=${project}
      busy=${status === 'loading'}
      onBack=${() => setSelected(null)}
      onRefresh=${() => load(selected, { refresh: true })}
      onMutated=${() => load(selected, { refresh: true })}
      flash=${flash}
    />`
  }

  return html`
    <div class="app">${view}</div>
    ${toast &&
    html`<div class=${`toast ${toast.isError ? 'toast--error' : ''}`}>${toast.message}</div>`}
  `
}
