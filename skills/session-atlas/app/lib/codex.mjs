// Codex transcript scanning. Transcripts live globally under ~/.codex, keyed by
// nothing but a date path; the working directory they ran in is recorded inside
// each file's first `session_meta` record. Archive state is purely a function of
// which directory the transcript currently sits in.

import path from 'node:path'
import {
  CODEX_ARCHIVED,
  CODEX_INDEX,
  CODEX_SESSIONS,
  fileMtimeMs,
  mapLimit,
  readFirstLine,
  readJsonl,
  uuidFromCodexFilename,
  walkFiles,
} from './util.mjs'
import { summarize, textFromContent, titleFromRequest } from './extract.mjs'

const isJsonl = (name) => name.endsWith('.jsonl')

// Lightweight first-pass record: enough to decide project membership and archive
// status without parsing the whole transcript.
export async function listCodexMetas() {
  const active = await walkFiles(CODEX_SESSIONS, isJsonl)
  const archived = await walkFiles(CODEX_ARCHIVED, isJsonl)
  const all = [
    ...active.map((file) => ({ file, archived: false })),
    ...archived.map((file) => ({ file, archived: true })),
  ]
  const metas = await mapLimit(all, 24, async ({ file, archived }) => {
    const firstLine = await readFirstLine(file)
    if (!firstLine) return null
    let record
    try {
      record = JSON.parse(firstLine)
    } catch {
      return null
    }
    const payload = record?.payload || {}
    if (record?.type !== 'session_meta' || !payload?.cwd) return null
    return {
      source: 'codex',
      id: payload.id || uuidFromCodexFilename(path.basename(file)),
      cwd: payload.cwd,
      remoteUrl: payload.git?.repository_url || '',
      branch: payload.git?.branch || '',
      startedAt: payload.timestamp || record.timestamp || '',
      transcriptPath: file,
      archived,
    }
  })
  return metas.filter(Boolean)
}

// Title + updated_at index, keyed by session id. Only non-archived threads are
// reliably present, which is exactly why index membership tracks archive state.
export async function loadCodexIndex() {
  const records = await readJsonl(CODEX_INDEX)
  const map = new Map()
  for (const record of records) {
    if (record?.id) {
      map.set(record.id, {
        title: record.thread_name || '',
        updatedAt: record.updated_at || '',
      })
    }
  }
  return map
}

// Full parse for a matched transcript: derive the request/outcome summary.
export async function readCodexSession(meta, index) {
  const records = await readJsonl(meta.transcriptPath)
  const turns = []
  let newestTs = meta.startedAt || ''
  for (const record of records) {
    if (record?.timestamp && record.timestamp > newestTs) newestTs = record.timestamp
    if (record?.type !== 'response_item') continue
    const payload = record.payload || {}
    if (payload.type !== 'message') continue
    const role = payload.role
    if (role !== 'user' && role !== 'assistant') continue // 'developer' = injected
    turns.push({ role, text: textFromContent(payload.content) })
  }
  const summary = summarize(turns)
  const indexed = index.get(meta.id) || {}
  const title = indexed.title || titleFromRequest(summary.initialRequest)
  const mtime = await fileMtimeMs(meta.transcriptPath)
  return {
    ...meta,
    title,
    updatedAt: indexed.updatedAt || newestTs || new Date(mtime).toISOString(),
    ...summary,
    inIndex: index.has(meta.id),
  }
}
