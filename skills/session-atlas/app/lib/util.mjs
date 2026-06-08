import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const HOME = os.homedir()
export const CODEX_HOME = process.env.CODEX_HOME
  ? path.resolve(process.env.CODEX_HOME)
  : path.join(HOME, '.codex')
export const CLAUDE_HOME = process.env.CLAUDE_HOME
  ? path.resolve(process.env.CLAUDE_HOME)
  : path.join(HOME, '.claude')

export const CODEX_SESSIONS = path.join(CODEX_HOME, 'sessions')
export const CODEX_ARCHIVED = path.join(CODEX_HOME, 'archived_sessions')
export const CODEX_INDEX = path.join(CODEX_HOME, 'session_index.jsonl')
export const CODEX_WORKTREES = path.join(CODEX_HOME, 'worktrees')
export const CLAUDE_PROJECTS = path.join(CLAUDE_HOME, 'projects')

// Read just the first line of a (potentially large) file without loading it all.
export async function readFirstLine(filePath, maxBytes = 65536) {
  let handle
  try {
    handle = await fs.open(filePath, 'r')
    const buffer = Buffer.alloc(maxBytes)
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0)
    const slice = buffer.subarray(0, bytesRead).toString('utf8')
    const newline = slice.indexOf('\n')
    return newline === -1 ? slice : slice.slice(0, newline)
  } catch {
    return null
  } finally {
    if (handle) await handle.close()
  }
}

// Parse only the complete JSONL records within the first `maxBytes` of a file.
// Used to learn a transcript's cwd/branch cheaply without loading huge files.
export async function readHeadRecords(filePath, maxBytes = 65536) {
  let handle
  try {
    handle = await fs.open(filePath, 'r')
    const buffer = Buffer.alloc(maxBytes)
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0)
    const text = buffer.subarray(0, bytesRead).toString('utf8')
    const lines = text.split('\n')
    // Drop the last fragment unless the read ended exactly on a newline.
    if (bytesRead === maxBytes) lines.pop()
    const records = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        records.push(JSON.parse(trimmed))
      } catch {
        // partial trailing record — ignore
      }
    }
    return records
  } catch {
    return []
  } finally {
    if (handle) await handle.close()
  }
}

export async function readJsonl(filePath) {
  let contents
  try {
    contents = await fs.readFile(filePath, 'utf8')
  } catch {
    return []
  }
  const records = []
  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      records.push(JSON.parse(trimmed))
    } catch {
      // skip malformed lines — transcripts are append-only and may be truncated mid-write
    }
  }
  return records
}

export async function walkFiles(dir, predicate) {
  const out = []
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(full, predicate)))
    } else if (entry.isFile() && (!predicate || predicate(entry.name))) {
      out.push(full)
    }
  }
  return out
}

export async function fileMtimeMs(filePath) {
  try {
    return (await fs.stat(filePath)).mtimeMs
  } catch {
    return 0
  }
}

export async function pathExists(target) {
  try {
    await fs.access(target)
    return true
  } catch {
    return false
  }
}

// Run async work with a bounded number in flight to avoid exhausting file handles.
export async function mapLimit(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

// Normalize a git remote URL to host/owner/repo so https and ssh forms compare equal.
export function normalizeRemote(url) {
  if (!url || typeof url !== 'string') return ''
  let value = url.trim().toLowerCase()
  value = value.replace(/\.git$/, '')
  value = value.replace(/^git\+/, '')
  const ssh = value.match(/^[a-z0-9._-]+@([^:]+):(.+)$/)
  if (ssh) return `${ssh[1]}/${ssh[2]}`.replace(/\/+/g, '/')
  value = value.replace(/^[a-z]+:\/\//, '')
  value = value.replace(/^[^@]+@/, '')
  return value.replace(/\/+/g, '/')
}

// Is `child` the same as `parent` or nested inside it?
export function isInside(child, parent) {
  if (!child || !parent) return false
  const rel = path.relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

export function uuidFromCodexFilename(name) {
  const match = name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
  return match ? match[1] : null
}

// rollout-2026-03-18T10-42-36-<uuid>.jsonl -> { year, month, day } for archive/unarchive path math.
export function dateFromRolloutName(name) {
  const match = name.match(/rollout-(\d{4})-(\d{2})-(\d{2})T/)
  if (!match) return null
  return { year: match[1], month: match[2], day: match[3] }
}

export function clamp(text, max = 400) {
  if (typeof text !== 'string') return ''
  const collapsed = text.replace(/\s+/g, ' ').trim()
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed
}
