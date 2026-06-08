import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

async function git(cwd, args) {
  try {
    const { stdout } = await run('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 })
    return stdout
  } catch {
    return ''
  }
}

// Like git() but reports success/failure and stderr, so callers can surface the
// real reason a command refused (e.g. "contains modified or untracked files").
async function gitRaw(args, cwd) {
  try {
    const { stdout } = await run('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 })
    return { ok: true, stdout, stderr: '' }
  } catch (error) {
    return { ok: false, stdout: error?.stdout || '', stderr: (error?.stderr || error?.message || '').trim() }
  }
}

// true = has uncommitted/untracked changes, false = clean, null = couldn't tell.
export async function isWorktreeDirty(dir) {
  const result = await gitRaw(['-C', dir, 'status', '--porcelain'], dir)
  if (!result.ok) return null
  return result.stdout.trim().length > 0
}

export async function gitWorktreeRemove(root, target, force) {
  const args = ['-C', root, 'worktree', 'remove']
  if (force) args.push('--force')
  args.push(target)
  const result = await gitRaw(args, root)
  return { ok: result.ok, error: result.stderr }
}

export async function gitWorktreePrune(root) {
  await gitRaw(['-C', root, 'worktree', 'prune'], root)
}

export async function gitRemote(projectRoot) {
  const out = await git(projectRoot, ['remote', 'get-url', 'origin'])
  return out.trim()
}

export async function gitToplevel(dir) {
  const out = await git(dir, ['rev-parse', '--show-toplevel'])
  return out.trim()
}

// Absolute path to the shared .git dir for a checkout. All worktrees of the same
// clone resolve to the same common dir, which is how we link a worktree found on
// disk back to the project that owns it. `--git-common-dir` may be relative.
export async function gitCommonDir(dir) {
  const out = await git(dir, ['rev-parse', '--git-common-dir'])
  const trimmed = out.trim()
  if (!trimmed) return ''
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(dir, trimmed)
}

// Parse `git worktree list --porcelain` into structured workspaces.
export async function listWorktrees(projectRoot) {
  const out = await git(projectRoot, ['worktree', 'list', '--porcelain'])
  if (!out) return []
  const worktrees = []
  let current = null
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) worktrees.push(current)
      current = { path: line.slice('worktree '.length), branch: '', head: '', detached: false, bare: false, prunable: false }
    } else if (!current) {
      continue
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length)
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length).replace('refs/heads/', '')
    } else if (line === 'detached') {
      current.detached = true
    } else if (line === 'bare') {
      current.bare = true
    } else if (line.startsWith('prunable')) {
      current.prunable = true
    }
  }
  if (current) worktrees.push(current)
  return worktrees
}
