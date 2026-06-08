import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const appRoot = fileURLToPath(new URL('../', import.meta.url))
const roots = ['server.mjs', 'lib', 'checks', 'ui/src']
const failures = []

for (const root of roots) {
  const full = path.join(appRoot, root)
  for (const file of await collect(full)) {
    try {
      await run('node', ['--check', file])
    } catch (error) {
      failures.push(`${path.relative(appRoot, file)}: ${error.stderr || error.message}`)
    }
  }
}

if (failures.length) {
  console.error(`Syntax errors:\n${failures.join('\n')}`)
  process.exit(1)
}
console.log('All JS files parse cleanly.')

async function collect(target) {
  let entries
  try {
    entries = await readdir(target, { withFileTypes: true })
  } catch {
    return /\.(mjs|js)$/.test(target) ? [target] : []
  }
  const out = []
  for (const entry of entries) {
    const full = path.join(target, entry.name)
    if (entry.isDirectory()) out.push(...(await collect(full)))
    else if (/\.(mjs|js)$/.test(entry.name)) out.push(full)
  }
  return out
}
