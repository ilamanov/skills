// Codex archive/unarchive. Codex's own behaviour is: archived transcripts live
// in ~/.codex/archived_sessions and are absent from session_index.jsonl (active
// sessions are present in it). We mirror that exactly — move the file and keep
// the index in sync — so the desktop app stays consistent with what we do here.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  CLAUDE_HOME,
  CLAUDE_PROJECTS,
  CODEX_ARCHIVED,
  CODEX_INDEX,
  CODEX_SESSIONS,
  dateFromRolloutName,
  isInside,
  pathExists,
  readFirstLine,
  readJsonl,
} from './util.mjs'
import { loadAllMetas, invalidateCache } from './projects.mjs'

async function findCodexMeta(id) {
  const { codexMetas } = await loadAllMetas()
  return codexMetas.find((m) => m.id === id) || null
}

async function moveFile(from, to) {
  await fs.mkdir(path.dirname(to), { recursive: true })
  try {
    await fs.rename(from, to)
  } catch (error) {
    if (error?.code === 'EXDEV') {
      await fs.copyFile(from, to)
      await fs.unlink(from)
    } else {
      throw error
    }
  }
}

async function removeFromIndex(id) {
  let contents
  try {
    contents = await fs.readFile(CODEX_INDEX, 'utf8')
  } catch {
    return
  }
  const kept = contents
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim()
      if (!trimmed) return false
      try {
        return JSON.parse(trimmed)?.id !== id
      } catch {
        return true
      }
    })
  await fs.writeFile(CODEX_INDEX, kept.length ? `${kept.join('\n')}\n` : '', 'utf8')
}

async function addToIndex(id, transcriptPath) {
  // Skip if already present.
  let contents = ''
  try {
    contents = await fs.readFile(CODEX_INDEX, 'utf8')
  } catch {
    contents = ''
  }
  if (contents.includes(`"${id}"`)) return
  const meta = JSON.parse((await readFirstLine(transcriptPath)) || '{}')
  let updatedAt = meta?.payload?.timestamp || meta?.timestamp || ''
  let threadName = ''
  for (const record of await readJsonl(transcriptPath)) {
    if (record?.timestamp && record.timestamp > updatedAt) updatedAt = record.timestamp
  }
  const entry = JSON.stringify({ id, thread_name: threadName, updated_at: updatedAt })
  const prefix = contents && !contents.endsWith('\n') ? '\n' : ''
  await fs.appendFile(CODEX_INDEX, `${prefix}${entry}\n`, 'utf8')
}

export async function archiveCodexSession(id) {
  const meta = await findCodexMeta(id)
  if (!meta) throw new ArchiveError(`No Codex session with id ${id}`)
  if (meta.archived) throw new ArchiveError('Session is already archived')
  if (!isInside(meta.transcriptPath, CODEX_SESSIONS)) {
    throw new ArchiveError('Transcript is not in the active sessions directory')
  }
  const dest = path.join(CODEX_ARCHIVED, path.basename(meta.transcriptPath))
  await moveFile(meta.transcriptPath, dest)
  await removeFromIndex(id)
  invalidateCache()
  return { id, archived: true, transcriptPath: dest }
}

export async function unarchiveCodexSession(id) {
  const meta = await findCodexMeta(id)
  if (!meta) throw new ArchiveError(`No Codex session with id ${id}`)
  if (!meta.archived) throw new ArchiveError('Session is not archived')
  const name = path.basename(meta.transcriptPath)
  const date = dateFromRolloutName(name)
  const destDir = date
    ? path.join(CODEX_SESSIONS, date.year, date.month, date.day)
    : CODEX_SESSIONS
  const dest = path.join(destDir, name)
  await moveFile(meta.transcriptPath, dest)
  await addToIndex(id, dest)
  invalidateCache()
  return { id, archived: false, transcriptPath: dest }
}

export class ArchiveError extends Error {}

export class ClaudeDeleteError extends Error {}

// Claude Code keeps a registry of currently-running sessions, one JSON per pid,
// under ~/.claude/sessions. We use it to refuse deleting a live session whose
// transcript is still being appended to.
async function runningClaudeSessionIds() {
  const dir = path.join(CLAUDE_HOME, 'sessions')
  const ids = new Set()
  let entries
  try {
    entries = await fs.readdir(dir)
  } catch {
    return ids
  }
  await Promise.all(
    entries
      .filter((name) => name.endsWith('.json'))
      .map(async (name) => {
        try {
          const record = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'))
          if (record?.sessionId) ids.add(record.sessionId)
        } catch {
          // ignore unreadable/partial registry files
        }
      }),
  )
  return ids
}

// Claude has no archive state in its on-disk store, so the only cleanup it
// supports is a hard delete: remove the transcript and its per-session sidecar
// directory. Project memory and plugin folders are shared and left untouched.
// This is irreversible — there is no backup of transcripts.
export async function deleteClaudeSession(id) {
  const { claudeMetas } = await loadAllMetas()
  const meta = claudeMetas.find((m) => m.id === id)
  if (!meta) throw new ClaudeDeleteError(`No Claude session with id ${id}`)
  if (!isInside(meta.transcriptPath, CLAUDE_PROJECTS)) {
    throw new ClaudeDeleteError('Transcript is not under the Claude projects store')
  }
  if ((await runningClaudeSessionIds()).has(id)) {
    throw new ClaudeDeleteError('This session is currently running — stop it before deleting.')
  }

  await fs.rm(meta.transcriptPath, { force: true })
  // Sidecar dir is named after the transcript file (per-session journals/aux).
  const sidecar = path.join(
    path.dirname(meta.transcriptPath),
    path.basename(meta.transcriptPath, '.jsonl'),
  )
  if (await pathExists(sidecar)) {
    await fs.rm(sidecar, { recursive: true, force: true })
  }

  invalidateCache()
  return { id, deleted: meta.transcriptPath }
}
