/**
 * Load web/.env.local into process.env for the live checks.
 *
 * Next reads that file itself; a bare vitest process does not, and the live payout check
 * needs the very addresses the dev server is using. Reading the same file is what keeps
 * the two in step — hard-coding them here is how a check ends up passing against a fork
 * that no longer exists.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const path = fileURLToPath(new URL('../.env.local', import.meta.url))
let raw = ''
try {
  raw = readFileSync(path, 'utf8')
} catch {
  throw new Error(`web/.env.local not found. Run scripts/local-fork.sh from the repo root first.`)
}

for (const line of raw.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eq = trimmed.indexOf('=')
  if (eq < 1) continue
  const key = trimmed.slice(0, eq).trim()
  const value = trimmed.slice(eq + 1).trim()
  if (!(key in process.env)) process.env[key] = value
}
