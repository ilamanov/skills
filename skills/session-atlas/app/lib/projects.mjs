// Ties raw transcript metas to a chosen project: discovers candidate project
// roots for the welcome screen, and assembles the full per-project view
// (workspaces + sessions) once one is picked.

import path from 'node:path'
import {
  CLAUDE_HOME,
  CODEX_HOME,
  CODEX_WORKTREES,
  HOME,
  isInside,
  mapLimit,
  normalizeRemote,
  pathExists,
} from './util.mjs'
import { promises as fs } from 'node:fs'
import { listCodexMetas, loadCodexIndex, readCodexSession } from './codex.mjs'
import { listClaudeMetas, readClaudeSession } from './claude.mjs'
import {
  gitCommonDir,
  gitRemote,
  gitWorktreePrune,
  gitWorktreeRemove,
  isWorktreeDirty,
  listWorktrees,
} from './worktrees.mjs'

const CLAUDE_WT_MARKER = `${path.sep}.claude${path.sep}worktrees${path.sep}`
const CODEX_WT_MARKER = `${path.sep}.codex${path.sep}worktrees${path.sep}`

// Reduce a working directory to the worktree/checkout it represents. A cwd that
// is a subdirectory of a worktree collapses to that worktree's root; a cwd from
// a managed (possibly deleted) worktree collapses to that worktree's directory.
export function workspacePathFor(cwd) {
  if (isInside(cwd, CODEX_WORKTREES)) {
    // ~/.codex/worktrees/<id>/<repo>/... -> ~/.codex/worktrees/<id>/<repo>
    const rel = path.relative(CODEX_WORKTREES, cwd).split(path.sep)
    if (rel.length >= 2) return path.join(CODEX_WORKTREES, rel[0], rel[1])
    return path.join(CODEX_WORKTREES, rel[0])
  }
  for (const marker of [CLAUDE_WT_MARKER, CODEX_WT_MARKER]) {
    const idx = cwd.indexOf(marker)
    if (idx !== -1) {
      const seg = cwd.slice(idx + marker.length).split(path.sep)[0]
      return cwd.slice(0, idx + marker.length) + seg
    }
  }
  return cwd
}

function isManagedWorktree(p) {
  return (
    isInside(p, CODEX_WORKTREES) ||
    p.includes(CLAUDE_WT_MARKER) ||
    p.includes(CODEX_WT_MARKER)
  )
}

// The local checkout a worktree path belongs to, or null if it's globally
// managed. Codex-managed worktrees live under ~/.codex/worktrees and have no
// local project parent, so the global-store exclusion must run before the
// in-project ".../.claude/worktrees/<x>" parent derivation.
function localRootFor(cwd) {
  if (isInside(cwd, CODEX_HOME) || isInside(cwd, CLAUDE_HOME) || isInside(cwd, CODEX_WORKTREES)) {
    return null
  }
  for (const marker of [CLAUDE_WT_MARKER, CODEX_WT_MARKER]) {
    const idx = cwd.indexOf(marker)
    if (idx !== -1) return cwd.slice(0, idx)
  }
  // The home directory itself isn't a project — sessions launched from ~ are noise.
  if (path.resolve(cwd) === path.resolve(HOME)) return null
  return cwd
}

let cache = null

export async function loadAllMetas({ refresh = false } = {}) {
  if (cache && !refresh) return cache
  const [codexMetas, codexIndex, claudeMetas] = await Promise.all([
    listCodexMetas(),
    loadCodexIndex(),
    listClaudeMetas(),
  ])
  cache = { codexMetas, codexIndex, claudeMetas }
  return cache
}

export function invalidateCache() {
  cache = null
}

// Welcome-screen list: one entry per discoverable local checkout.
export async function discoverProjects() {
  const { codexMetas, claudeMetas } = await loadAllMetas()
  const groups = new Map()
  const worktreeSets = new Map() // root -> Set of distinct worktree paths that ran sessions

  const seenFor = (root) => {
    let seen = worktreeSets.get(root)
    if (!seen) {
      seen = new Set()
      worktreeSets.set(root, seen)
    }
    return seen
  }
  const attribute = (group, meta) => {
    group.sessions += 1
    group[meta.source] += 1
    if (meta.source === 'codex' && meta.remoteUrl && !group.remote) group.remote = meta.remoteUrl
    if ((meta.startedAt || '') > group.lastUpdated) group.lastUpdated = meta.startedAt || ''
    seenFor(group.path).add(workspacePathFor(meta.cwd))
  }

  // Pass 1: sessions whose working directory maps to a local checkout. Codex
  // sessions that ran in a globally-managed worktree (~/.codex/worktrees) have no
  // local parent here, so collect them for the remote-matched second pass.
  const managed = []
  for (const meta of [...codexMetas, ...claudeMetas]) {
    const root = localRootFor(meta.cwd)
    if (!root) {
      if (meta.source === 'codex' && isInside(meta.cwd, CODEX_WORKTREES)) managed.push(meta)
      continue
    }
    const group = groups.get(root) || {
      path: root,
      name: path.basename(root),
      remote: '',
      sessions: 0,
      codex: 0,
      claude: 0,
      worktrees: 0,
      lastUpdated: '',
    }
    groups.set(root, group)
    attribute(group, meta)
  }

  // Pass 2: attribute Codex-managed-worktree sessions to their local checkout by
  // git remote (the same join the per-project view uses), with a repo-basename
  // fallback, so the home count matches what opening the project shows.
  const byRemote = new Map()
  const byName = new Map()
  for (const group of groups.values()) {
    if (group.remote) byRemote.set(normalizeRemote(group.remote), group)
    byName.set(group.name, group)
  }
  for (const meta of managed) {
    const ws = workspacePathFor(meta.cwd)
    const group =
      (meta.remoteUrl && byRemote.get(normalizeRemote(meta.remoteUrl))) || byName.get(path.basename(ws))
    if (group) attribute(group, meta)
  }

  // Count only worktrees that still exist on disk, so the ⎇ badge lines up with
  // the present-worktree count shown inside a project (deleted worktrees that
  // once ran sessions are not advertised as current activity).
  const candidates = await Promise.all(
    [...groups.values()].map(async (group) => {
      const paths = [...(worktreeSets.get(group.path) || [])]
      const present = await Promise.all(paths.map(pathExists))
      group.worktrees = present.filter(Boolean).length
      return { ...group, exists: await pathExists(group.path) }
    }),
  )
  const checked = candidates
  // Rank by activity, most active first: session volume, then worktrees touched,
  // then recency as the final tiebreaker.
  return checked.sort(
    (a, b) =>
      b.sessions - a.sessions ||
      b.worktrees - a.worktrees ||
      (b.lastUpdated || '').localeCompare(a.lastUpdated || ''),
  )
}

function matchesProject(meta, { root, normRemote, worktreePaths, projectName }) {
  const ws = workspacePathFor(meta.cwd)
  // 1. Lives inside the local checkout or one of its current git worktrees.
  if (isInside(meta.cwd, root)) return ws
  for (const wt of worktreePaths) {
    if (isInside(meta.cwd, wt)) return ws
  }
  // 2. Same git remote (covers deleted/managed/external checkouts).
  if (normRemote && meta.remoteUrl && normalizeRemote(meta.remoteUrl) === normRemote) return ws
  // 3. Managed worktree whose repo folder name matches (fallback when no remote).
  if (isManagedWorktree(ws) && path.basename(ws) === projectName) return ws
  return null
}

export async function buildProjectView(projectRoot) {
  const root = path.resolve(projectRoot)
  const { codexMetas, codexIndex, claudeMetas } = await loadAllMetas()
  const [remote, registered, commonDir] = await Promise.all([
    gitRemote(root),
    listWorktrees(root),
    gitCommonDir(root),
  ])
  // Source worktrees from every location, not just sessions: git's own list,
  // plus a disk scan of the managed worktree stores linked back to this repo by
  // their .git gitdir. This surfaces real worktrees that have no agent session
  // attached — exactly the ones worth reviewing for cleanup.
  const worktrees = await mergeWorktreeSources(root, registered, commonDir)
  const normRemote = normalizeRemote(remote)
  const projectName = path.basename(root)
  const worktreePaths = worktrees.map((w) => path.resolve(w.path))
  const matchCtx = { root, normRemote, worktreePaths, projectName }

  const matched = []
  for (const meta of [...codexMetas, ...claudeMetas]) {
    const ws = matchesProject(meta, matchCtx)
    if (ws) matched.push({ meta, workspacePath: ws })
  }

  // Fully parse only the matched transcripts.
  const sessions = await Promise.all(
    matched.map(async ({ meta, workspacePath }) => {
      const full =
        meta.source === 'codex'
          ? await readCodexSession(meta, codexIndex)
          : await readClaudeSession(meta)
      delete full._records
      return { ...full, workspacePath }
    }),
  )
  sessions.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))

  const assembled = assembleWorkspaces({ root, worktrees, sessions })
  // A workspace is only worth showing if its directory still exists — a deleted
  // worktree referenced only by old/archived transcripts is already cleaned up,
  // and listing it defeats the point of seeing what's actually present.
  const checked = await Promise.all(
    assembled.map(async (ws) => ({ ...ws, exists: await pathExists(ws.path) })),
  )
  const workspaces = checked.filter((ws) => ws.exists)
  const gone = checked.filter((ws) => !ws.exists)
  const goneWithSessions = gone.filter((ws) => ws.attached > 0).length
  const mainBranch = worktrees.find((w) => path.resolve(w.path) === root)?.branch || ''

  return {
    project: { path: root, name: projectName, remote, branch: mainBranch },
    workspaces,
    goneWorktrees: { total: gone.length, withSessions: goneWithSessions },
    sessions,
  }
}

export class WorktreeError extends Error {}
export class WorktreeDirtyError extends WorktreeError {}

async function realpathSafe(p) {
  try {
    return await fs.realpath(p)
  } catch {
    return p
  }
}

// Remove a worktree the user picked from the UI. Validated hard before touching
// the filesystem: the target must be a real worktree of this project, must exist,
// and must never be the main checkout. Git's own remove refuses dirty worktrees;
// we mirror that check ourselves so the orphan path is gated the same way.
export async function removeWorktree(projectRoot, targetPath, { force = false } = {}) {
  // Canonicalize both sides — git worktree list reports realpaths, and a
  // symlinked project root (or macOS /var -> /private/var) would otherwise make
  // the membership check miss and reject a legitimate worktree.
  const root = await realpathSafe(path.resolve(projectRoot))
  const target = await realpathSafe(path.resolve(targetPath))

  if (target === root) throw new WorktreeError('Refusing to remove the main checkout.')
  if (!(await pathExists(target))) throw new WorktreeError('That worktree directory no longer exists.')

  const [registered, commonDir] = await Promise.all([listWorktrees(root), gitCommonDir(root)])
  const merged = await mergeWorktreeSources(root, registered, commonDir)
  let entry = null
  for (const wt of merged) {
    if ((await realpathSafe(path.resolve(wt.path))) === target) {
      entry = wt
      break
    }
  }
  if (!entry) throw new WorktreeError('That path is not a worktree of this project.')

  const dirty = await isWorktreeDirty(target)
  if (dirty === true && !force) {
    throw new WorktreeDirtyError('This worktree has uncommitted or untracked changes.')
  }
  if (dirty === null && !force) {
    // Status couldn't run (e.g. the worktree's git metadata is broken). Don't
    // delete on a guess — surface it as force-able so the user decides.
    throw new WorktreeDirtyError(
      "Could not confirm this worktree is clean — its git metadata may be broken.",
    )
  }

  if (!entry.scanned) {
    // Registered worktree — let git deregister and delete it.
    const result = await gitWorktreeRemove(root, target, force || dirty === true)
    if (!result.ok) throw new WorktreeError(result.error || 'git worktree remove failed.')
  } else {
    // On disk and linked to this repo, but not in git's worktree list. Try git
    // first; if it won't claim it, delete the directory and prune the admin file.
    const result = await gitWorktreeRemove(root, target, true)
    if (!result.ok) {
      await fs.rm(target, { recursive: true, force: true })
      await gitWorktreePrune(root)
    }
  }

  invalidateCache()
  return { removed: target }
}

// Union git's worktree list with a disk scan of the managed worktree stores.
// A directory counts as a worktree of this project when its `.git` gitdir points
// inside the project's shared git dir — true regardless of whether `git worktree
// list` happened to report it.
async function mergeWorktreeSources(root, registered, commonDir) {
  const byPath = new Map()
  for (const wt of registered) byPath.set(path.resolve(wt.path), { ...wt, scanned: false })
  if (!commonDir) return [...byPath.values()]

  const resolvedCommon = path.resolve(commonDir)
  const candidates = await managedWorktreeCandidates(root)
  await mapLimit(candidates, 24, async (dir) => {
    const resolved = path.resolve(dir)
    if (byPath.has(resolved)) return
    const gitdir = await worktreeGitdir(dir)
    if (gitdir && isInside(gitdir, resolvedCommon)) {
      byPath.set(resolved, {
        path: resolved,
        branch: '',
        head: '',
        detached: false,
        bare: false,
        prunable: false,
        scanned: true,
      })
    }
  })
  return [...byPath.values()]
}

async function managedWorktreeCandidates(root) {
  const dirs = []
  const add = async (base, depth) => {
    let entries
    try {
      entries = await fs.readdir(base, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = path.join(base, entry.name)
      dirs.push(full)
      if (depth > 1) await add(full, depth - 1)
    }
  }
  // Codex uses both ~/.codex/worktrees/<name> and ~/.codex/worktrees/<id>/<repo>.
  await add(CODEX_WORKTREES, 2)
  await add(path.join(root, '.claude', 'worktrees'), 1)
  return dirs
}

async function worktreeGitdir(dir) {
  try {
    const content = await fs.readFile(path.join(dir, '.git'), 'utf8')
    const match = content.match(/^gitdir:\s*(.+?)\s*$/m)
    if (!match) return ''
    const target = match[1]
    return path.isAbsolute(target) ? target : path.resolve(dir, target)
  } catch {
    return ''
  }
}

function assembleWorkspaces({ root, worktrees, sessions }) {
  const byPath = new Map()
  const ensure = (p, seed) => {
    const key = path.resolve(p)
    if (!byPath.has(key)) {
      byPath.set(key, {
        path: key,
        branch: '',
        head: '',
        detached: false,
        prunable: false,
        isGitWorktree: false,
        kind: 'external',
        sessionIds: [],
        counts: { codexActive: 0, codexArchived: 0, claude: 0 },
        latest: null,
        ...seed,
      })
    }
    return byPath.get(key)
  }

  for (const wt of worktrees) {
    const resolved = path.resolve(wt.path)
    const seed = {
      branch: wt.branch,
      head: wt.head,
      detached: wt.detached,
      prunable: wt.prunable,
    }
    if (wt.scanned) {
      // Linked on disk (gitdir points into this repo) but not in `git worktree
      // list` — flag it as such; it's a strong cleanup candidate.
      ensure(resolved, { ...seed, isGitWorktree: false, ...kindForOrphan(resolved, root) })
    } else {
      ensure(resolved, {
        ...seed,
        isGitWorktree: true,
        kind: resolved === root ? 'main' : 'git-worktree',
      })
    }
  }

  for (const session of sessions) {
    const ws = ensure(session.workspacePath, kindForOrphan(session.workspacePath, root))
    ws.sessionIds.push(session.id)
    if (session.source === 'codex') {
      if (session.archived) ws.counts.codexArchived += 1
      else ws.counts.codexActive += 1
    } else {
      ws.counts.claude += 1
    }
    if (!ws.latest || (session.updatedAt || '') > (ws.latest.updatedAt || '')) {
      ws.latest = { title: session.title, updatedAt: session.updatedAt, source: session.source, id: session.id }
    }
  }

  return [...byPath.values()].map((ws) => ({ ...ws, ...statusFor(ws) })).sort(sortWorkspaces(root))
}

function kindForOrphan(wsPath, root) {
  if (isInside(wsPath, CODEX_WORKTREES)) return { kind: 'codex-worktree', orphaned: true }
  if (wsPath.includes(CLAUDE_WT_MARKER)) return { kind: 'claude-worktree', orphaned: true }
  if (wsPath.includes(CODEX_WT_MARKER)) return { kind: 'codex-worktree', orphaned: true }
  if (path.resolve(wsPath) === path.resolve(root)) return { kind: 'main' }
  return { kind: 'external', orphaned: true }
}

function statusFor(ws) {
  const { codexActive, codexArchived, claude } = ws.counts
  let codexStatus = null
  if (codexActive && codexArchived) codexStatus = 'active + archived history'
  else if (codexActive) codexStatus = 'active'
  else if (codexArchived) codexStatus = 'archived'
  const claudeStatus = claude ? 'active' : null
  const attached = codexActive + codexArchived + claude
  return {
    codexStatus,
    claudeStatus,
    attached,
    orphaned: ws.isGitWorktree ? false : ws.orphaned ?? attached > 0,
  }
}

function sortWorkspaces(root) {
  return (a, b) => {
    if (a.kind === 'main') return -1
    if (b.kind === 'main') return 1
    if (a.isGitWorktree !== b.isGitWorktree) return a.isGitWorktree ? -1 : 1
    return (b.latest?.updatedAt || '').localeCompare(a.latest?.updatedAt || '')
  }
}
