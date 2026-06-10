// Codex worktree snapshots. Before Codex deletes a managed worktree it records a
// git commit of the work and keeps it reachable via refs/codex/snapshots/<id> in
// the repo's shared .git. Commits whose subject starts with "Codex worktree
// snapshot:" captured *uncommitted* work — those are the recoverable ones worth
// surfacing. The rest just point at commits already in history.
//
// This reads undocumented Codex internals, so it is strictly best-effort: if the
// refs aren't there (no Codex, different version), it returns nothing.

import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { mapLimit, pathExists } from './util.mjs'
import { invalidateCache } from './projects.mjs'

const run = promisify(execFile)
const SNAPSHOT_SUBJECT = 'Codex worktree snapshot:'

async function git(root, args) {
  try {
    const { stdout } = await run('git', args, { cwd: root, maxBuffer: 32 * 1024 * 1024 })
    return { ok: true, stdout }
  } catch (error) {
    return { ok: false, stdout: error?.stdout || '', stderr: (error?.stderr || error?.message || '').trim() }
  }
}

export async function listSnapshots(projectRoot) {
  const root = path.resolve(projectRoot)
  const res = await git(root, [
    'for-each-ref',
    '--format=%(refname:lstrip=3)\t%(objectname)\t%(authordate:iso-strict)\t%(contents:subject)',
    'refs/codex/snapshots',
  ])
  const empty = { dirty: [], clean: [], counts: { dirty: 0, clean: 0, total: 0 } }
  if (!res.ok || !res.stdout.trim()) return empty

  const dirty = []
  const clean = []
  for (const line of res.stdout.split('\n')) {
    if (!line.trim()) continue
    const [id, sha, date, subject = ''] = line.split('\t')
    if (subject.startsWith(SNAPSHOT_SUBJECT)) {
      dirty.push({ id, sha, date, type: subject.slice(SNAPSHOT_SUBJECT.length).trim() || 'cleanup' })
    } else {
      clean.push({ id, sha, date, subject })
    }
  }

  // Enrich the recoverable ones with base ref + diffstat (bounded git fan-out).
  await mapLimit(dirty, 8, async (snap) => {
    const parentRes = await git(root, ['show', '-s', '--format=%P', snap.sha])
    const base = parentRes.ok ? parentRes.stdout.trim().split(/\s+/)[0] : ''
    snap.base = base
    if (base) {
      const nameRes = await git(root, ['name-rev', '--name-only', '--exclude=refs/codex/*', base])
      snap.baseRef = nameRes.ok ? nameRes.stdout.trim().replace(/\^0$/, '') : ''
      const statRes = await git(root, ['diff', '--shortstat', base, snap.sha])
      snap.stat = statRes.ok ? parseShortstat(statRes.stdout) : null
    }
    snap.restored = await pathExists(restorePath(root, snap.sha))
  })

  dirty.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  clean.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return { dirty, clean, counts: { dirty: dirty.length, clean: clean.length, total: dirty.length + clean.length } }
}

function parseShortstat(text) {
  const files = /(\d+) files? changed/.exec(text)
  const ins = /(\d+) insertions?/.exec(text)
  const del = /(\d+) deletions?/.exec(text)
  return {
    files: Number(files?.[1] || 0),
    insertions: Number(ins?.[1] || 0),
    deletions: Number(del?.[1] || 0),
  }
}

function restorePath(root, sha) {
  return `${root}-restore-${sha.slice(0, 8)}`
}

export class SnapshotError extends Error {}

// Restore = materialize the snapshot as a fresh git worktree on a codex-restore/
// branch, beside the repo. Non-destructive: it only adds a worktree + branch, and
// the result shows up in the Worktrees panel (removable from there).
export async function restoreSnapshot(projectRoot, id) {
  const root = path.resolve(projectRoot)
  if (!/^[0-9a-f]{6,64}$/i.test(id)) throw new SnapshotError('Invalid snapshot id.')

  const ref = `refs/codex/snapshots/${id}`
  const resolved = await git(root, ['rev-parse', '--verify', `${ref}^{commit}`])
  if (!resolved.ok) throw new SnapshotError('Snapshot ref not found in this repo.')
  const sha = resolved.stdout.trim()

  const dir = restorePath(root, sha)
  if (await pathExists(dir)) throw new SnapshotError(`Already restored at ${dir}`)

  const branch = `codex-restore/${sha.slice(0, 8)}`
  const branchExists = (await git(root, ['rev-parse', '--verify', `refs/heads/${branch}`])).ok
  const args = branchExists
    ? ['worktree', 'add', dir, branch]
    : ['worktree', 'add', dir, '-b', branch, sha]

  const add = await git(root, args)
  if (!add.ok) throw new SnapshotError(add.stderr || 'git worktree add failed.')

  invalidateCache()
  return { path: dir, branch, sha }
}
