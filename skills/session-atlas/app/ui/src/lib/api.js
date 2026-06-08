async function request(url, options) {
  const response = await fetch(url, options)
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!response.ok) {
    const error = new Error(data?.error || `request failed (${response.status})`)
    error.status = response.status
    error.data = data
    throw error
  }
  return data
}

export function fetchProjects({ refresh = false } = {}) {
  return request(`/api/projects${refresh ? '?refresh=1' : ''}`)
}

export function fetchProject(path, { refresh = false } = {}) {
  const params = new URLSearchParams({ path })
  if (refresh) params.set('refresh', '1')
  return request(`/api/project?${params.toString()}`)
}

export function archiveSession(id) {
  return request('/api/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, source: 'codex' }),
  })
}

export function unarchiveSession(id) {
  return request('/api/unarchive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, source: 'codex' }),
  })
}

export function deleteClaudeSession(id) {
  return request('/api/session/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, source: 'claude' }),
  })
}

export function removeWorktree(project, worktreePath, force = false) {
  return request('/api/worktree/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project, path: worktreePath, force }),
  })
}

// "2026-06-07T21:48:36Z" -> "Jun 7, 9:48 PM" (relative-ish, compact).
export function formatWhen(iso) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  const opts = sameYear
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { year: 'numeric', month: 'short', day: 'numeric' }
  return date.toLocaleString(undefined, opts)
}

export function timeAgo(iso) {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.round(months / 12)}y ago`
}
