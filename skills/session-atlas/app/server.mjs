#!/usr/bin/env node

import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { promises as fs } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

import {
  buildProjectView,
  discoverProjects,
  invalidateCache,
  removeWorktree,
  WorktreeDirtyError,
  WorktreeError,
} from './lib/projects.mjs'
import {
  archiveCodexSession,
  unarchiveCodexSession,
  deleteClaudeSession,
  ArchiveError,
  ClaudeDeleteError,
} from './lib/archive.mjs'
import { listSnapshots, restoreSnapshot, SnapshotError } from './lib/snapshots.mjs'

const DEFAULT_PORT = 6310
const MAX_PORT = 6320
const HOST = '127.0.0.1'

const skillRoot = fileURLToPath(new URL('./', import.meta.url))
const uiRoot = path.join(skillRoot, 'ui')
const port = await choosePort()
const app = new Hono()

const vendorFiles = new Map([
  ['/vendor/htm.module.js', path.join(skillRoot, 'node_modules/htm/dist/htm.module.js')],
  ['/vendor/preact.module.js', path.join(skillRoot, 'node_modules/preact/dist/preact.module.js')],
  [
    '/vendor/preact-hooks.module.js',
    path.join(skillRoot, 'node_modules/preact/hooks/dist/hooks.module.js'),
  ],
])

app.use('*', async (c, next) => {
  const origin = c.req.header('origin')
  const allowed = new Set([`http://${HOST}:${port}`, `http://localhost:${port}`])
  if (origin && !allowed.has(origin)) return c.text('forbidden origin', 403)
  await next()
})

app.get('/api/projects', async (c) => {
  if (c.req.query('refresh') === '1') invalidateCache()
  return c.json({ projects: await discoverProjects() })
})

app.get('/api/project', async (c) => {
  const projectPath = c.req.query('path')
  if (!projectPath) return c.json({ error: 'missing ?path' }, 400)
  const resolved = path.resolve(projectPath)
  try {
    const info = await fs.stat(resolved)
    if (!info.isDirectory()) return c.json({ error: 'path is not a directory' }, 400)
  } catch {
    return c.json({ error: `path does not exist: ${resolved}` }, 404)
  }
  if (c.req.query('refresh') === '1') invalidateCache()
  return c.json(await buildProjectView(resolved))
})

app.post('/api/archive', (c) => mutateArchive(c, archiveCodexSession))
app.post('/api/unarchive', (c) => mutateArchive(c, unarchiveCodexSession))

async function mutateArchive(c, action) {
  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  if (!body || typeof body.id !== 'string') {
    return c.json({ error: 'expected body shape: { id: string }' }, 400)
  }
  if (body.source && body.source !== 'codex') {
    return c.json({ error: 'only Codex sessions can be archived' }, 400)
  }
  try {
    return c.json({ ok: true, result: await action(body.id) })
  } catch (error) {
    if (error instanceof ArchiveError) return c.json({ error: error.message }, 409)
    throw error
  }
}

app.get('/api/snapshots', async (c) => {
  const projectPath = c.req.query('path')
  if (!projectPath) return c.json({ error: 'missing ?path' }, 400)
  return c.json(await listSnapshots(path.resolve(projectPath)))
})

app.post('/api/snapshot/restore', async (c) => {
  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  if (!body || typeof body.project !== 'string' || typeof body.id !== 'string') {
    return c.json({ error: 'expected body shape: { project, id }' }, 400)
  }
  try {
    return c.json({ ok: true, result: await restoreSnapshot(body.project, body.id) })
  } catch (error) {
    if (error instanceof SnapshotError) return c.json({ error: error.message }, 409)
    throw error
  }
})

app.post('/api/session/delete', async (c) => {
  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  if (!body || typeof body.id !== 'string') {
    return c.json({ error: 'expected body shape: { id, source }' }, 400)
  }
  if (body.source !== 'claude') {
    return c.json({ error: 'only Claude sessions can be deleted; archive Codex sessions instead' }, 400)
  }
  try {
    return c.json({ ok: true, result: await deleteClaudeSession(body.id) })
  } catch (error) {
    if (error instanceof ClaudeDeleteError) return c.json({ error: error.message }, 409)
    throw error
  }
})

app.post('/api/worktree/remove', async (c) => {
  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400)
  }
  if (!body || typeof body.project !== 'string' || typeof body.path !== 'string') {
    return c.json({ error: 'expected body shape: { project, path, force? }' }, 400)
  }
  try {
    const result = await removeWorktree(body.project, body.path, { force: !!body.force })
    return c.json({ ok: true, result })
  } catch (error) {
    if (error instanceof WorktreeDirtyError) return c.json({ error: error.message, dirty: true }, 409)
    if (error instanceof WorktreeError) return c.json({ error: error.message }, 409)
    throw error
  }
})

app.get('/vendor/*', (c) => serveVendorFile(c))
app.get('/src/*', (c) => serveUiFile(c))
app.get('/styles/*', (c) => serveUiFile(c))
app.get('/favicon.svg', (c) => serveUiFile(c))
app.get('/', (c) => serveUiFile(c, 'index.html'))
app.get('/index.html', (c) => serveUiFile(c, 'index.html'))
app.get('*', (c) => serveUiFile(c, 'index.html'))

serve({ fetch: app.fetch, hostname: HOST, port }, () => {
  const url = `http://${HOST}:${port}`
  console.log(`Session Atlas running at ${url}`)
  console.log('Scanning ~/.codex and ~/.claude — pick a project in the UI.')
  openBrowser(url)
})

async function serveVendorFile(c) {
  const filePath = vendorFiles.get(new URL(c.req.url).pathname)
  if (!filePath) return c.text('not found', 404)
  return serveFile(c, filePath)
}

async function serveUiFile(c, forcedPath) {
  const urlPath = forcedPath || decodeURIComponent(new URL(c.req.url).pathname.slice(1))
  const filePath = resolveUnderRoot(uiRoot, urlPath)
  if (!filePath) return c.text('not found', 404)
  return serveFile(c, filePath)
}

async function serveFile(c, filePath) {
  try {
    const info = await fs.stat(filePath)
    if (!info.isFile()) return c.text('not found', 404)
    const contents = await fs.readFile(filePath)
    return new Response(contents, {
      headers: { 'Cache-Control': 'no-store', 'Content-Type': contentType(filePath) },
    })
  } catch (error) {
    if (error?.code === 'ENOENT') return c.text('not found', 404)
    throw error
  }
}

function resolveUnderRoot(root, rel) {
  const abs = path.resolve(root, rel)
  const relative = path.relative(root, abs)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null
  return abs
}

function contentType(filePath) {
  const ext = path.extname(filePath)
  if (ext === '.css') return 'text/css; charset=utf-8'
  if (ext === '.html') return 'text/html; charset=utf-8'
  if (ext === '.js' || ext === '.mjs') return 'text/javascript; charset=utf-8'
  if (ext === '.json') return 'application/json; charset=utf-8'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.woff2') return 'font/woff2'
  if (ext === '.woff') return 'font/woff'
  return 'application/octet-stream'
}

async function choosePort() {
  const override = process.env.SESSION_ATLAS_PORT
  if (override) {
    const parsed = Number.parseInt(override, 10)
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      console.error('SESSION_ATLAS_PORT must be an integer between 1 and 65535.')
      process.exit(1)
    }
    if (!(await isPortAvailable(parsed))) {
      console.error(`Port ${parsed} is busy.`)
      process.exit(1)
    }
    return parsed
  }
  for (let candidate = DEFAULT_PORT; candidate <= MAX_PORT; candidate += 1) {
    if (await isPortAvailable(candidate)) return candidate
  }
  console.error(`All candidate ports busy (${DEFAULT_PORT}-${MAX_PORT}). Set SESSION_ATLAS_PORT.`)
  process.exit(1)
}

function isPortAvailable(candidate) {
  return new Promise((resolve) => {
    const tester = createServer()
    tester.once('error', () => resolve(false))
    tester.once('listening', () => tester.close(() => resolve(true)))
    tester.listen(candidate, HOST)
  })
}

function openBrowser(url) {
  if (process.env.SESSION_ATLAS_NO_OPEN === '1') return
  const platform = process.platform
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'cmd' : 'xdg-open'
  const args = platform === 'win32' ? ['/c', 'start', '', url] : [url]
  const child = spawn(command, args, { detached: true, stdio: 'ignore' })
  child.on('error', () => undefined)
  child.unref()
}
