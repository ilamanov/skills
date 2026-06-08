// Shared logic for pulling human-meaningful text out of a transcript: the first
// real request, the last real request, and the final assistant outcome. Both
// Codex and Claude inject setup/context messages styled as "user" turns; those
// must be skipped so the summary reflects what the person actually asked for.

import { clamp } from './util.mjs'

// Prefixes/markers that signal an injected context message rather than a real
// user prompt. Matched after trimming leading whitespace.
const INJECTED_PREFIXES = [
  '# AGENTS.md',
  '<INSTRUCTIONS>',
  '<permissions',
  '<environment_context>',
  '<app-context>',
  '<user_instructions>',
  '<system-reminder>',
  '<command-name>',
  '<command-message>',
  '<command-args>',
  '<local-command-stdout>',
  '<local-command-stderr>',
  'Caveat: The messages below',
  '# Codex desktop context',
]

export function isInjectedText(text) {
  if (!text) return true
  const trimmed = text.trimStart()
  if (!trimmed) return true
  return INJECTED_PREFIXES.some((prefix) => trimmed.startsWith(prefix))
}

// Pull plain text out of a message `content` field that may be a string or an
// array of typed parts. Only narrative text counts — tool calls/results don't.
export function textFromContent(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const part of content) {
    if (!part || typeof part !== 'object') continue
    const type = part.type
    if (type === 'text' || type === 'input_text' || type === 'output_text') {
      if (typeof part.text === 'string') parts.push(part.text)
    }
  }
  return parts.join('\n').trim()
}

// Given ordered { role, text } turns, derive the summary fields.
export function summarize(turns) {
  const userTurns = turns.filter((t) => t.role === 'user' && t.text && !isInjectedText(t.text))
  const assistantTurns = turns.filter((t) => t.role === 'assistant' && t.text.trim())
  const initial = userTurns[0]?.text || ''
  const last = userTurns[userTurns.length - 1]?.text || ''
  const outcome = assistantTurns[assistantTurns.length - 1]?.text || ''
  return {
    initialRequest: clamp(initial, 600),
    lastRequest: last && last !== initial ? clamp(last, 600) : '',
    outcome: clamp(outcome, 800),
    userTurns: userTurns.length,
  }
}

// Fall back to a readable title from the first request when no thread title
// exists. Automation/scheduled wrappers carry a name= attribute worth surfacing
// instead of the raw XML-ish opener.
export function titleFromRequest(text) {
  if (!text) return 'Untitled session'
  const scheduled = text.match(/^<scheduled-task[^>]*\bname="([^"]+)"/)
  if (scheduled) return `Scheduled task: ${scheduled[1]}`
  const automation = text.match(/^(?:<automation[^>]*\bname="([^"]+)"|Automation:\s*([^\n]+?)(?:\s+Automation ID:|$))/)
  if (automation) return `Automation: ${(automation[1] || automation[2] || '').trim()}`
  return clamp(text, 80) || 'Untitled session'
}
