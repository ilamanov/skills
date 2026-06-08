// Claude Code transcript scanning. Transcripts live under ~/.claude/projects,
// one folder per encoded working directory. The folder encoding changed across
// versions (both "/.codex" -> "--codex" and a literal-dot form appear on disk),
// so membership is decided by the `cwd` recorded inside the records, never by
// decoding the folder name. Claude has no first-party archive state, so every
// transcript is reported as active.

import path from 'node:path'
import { promises as fs } from 'node:fs'
import {
  CLAUDE_PROJECTS,
  fileMtimeMs,
  mapLimit,
  readHeadRecords,
  readJsonl,
  walkFiles,
} from './util.mjs'
import { summarize, textFromContent, titleFromRequest } from './extract.mjs'

const isJsonl = (name) => name.endsWith('.jsonl')

// First pass: one cheap record read per transcript to learn its cwd + branch.
export async function listClaudeMetas() {
  let dirs
  try {
    dirs = await fs.readdir(CLAUDE_PROJECTS, { withFileTypes: true })
  } catch {
    return []
  }
  const files = []
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue
    const inDir = await walkFiles(path.join(CLAUDE_PROJECTS, dir.name), isJsonl)
    files.push(...inDir)
  }
  const metas = await mapLimit(files, 24, async (file) => {
    // The cwd/branch live in early records, so a bounded head read is enough —
    // the full transcript is only parsed later for matched sessions.
    const records = await readHeadRecords(file)
    if (!records.length) return null
    let cwd = ''
    let branch = ''
    let sessionId = ''
    let startedAt = ''
    for (const record of records) {
      if (!cwd && record?.cwd) cwd = record.cwd
      if (!branch && record?.gitBranch) branch = record.gitBranch
      if (!sessionId && record?.sessionId) sessionId = record.sessionId
      if (!startedAt && record?.timestamp) startedAt = record.timestamp
      if (cwd && sessionId) break
    }
    if (!cwd) return null
    return {
      source: 'claude',
      id: sessionId || path.basename(file, '.jsonl'),
      cwd,
      remoteUrl: '',
      branch,
      startedAt,
      transcriptPath: file,
      archived: false,
    }
  })
  return metas.filter(Boolean)
}

export async function readClaudeSession(meta) {
  const records = await readJsonl(meta.transcriptPath)
  const turns = []
  let newestTs = meta.startedAt || ''
  let summaryTitle = ''
  for (const record of records) {
    if (record?.timestamp && record.timestamp > newestTs) newestTs = record.timestamp
    if (record?.type === 'summary' && record.summary && !summaryTitle) {
      summaryTitle = record.summary
    }
    if (record?.type === 'user' && !record.isMeta) {
      turns.push({ role: 'user', text: textFromContent(record.message?.content) })
    } else if (record?.type === 'assistant') {
      turns.push({ role: 'assistant', text: textFromContent(record.message?.content) })
    }
  }
  const summary = summarize(turns)
  const title = summaryTitle || titleFromRequest(summary.initialRequest)
  const mtime = await fileMtimeMs(meta.transcriptPath)
  const result = {
    ...meta,
    title,
    updatedAt: newestTs || new Date(mtime).toISOString(),
    ...summary,
  }
  delete result._records
  return result
}
