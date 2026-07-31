#!/usr/bin/env node
/**
 * Push extracted-data/whats-new-pending.jsonl to Supabase, then wipe the file.
 * Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env
 *
 * Usage: npm run push-whats-new
 */
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { pushWhatsNewToDatabase, readPendingWhatsNew } from './lib/writeWhatsNewDigest.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const pending = readPendingWhatsNew(ROOT)
console.log(`Pending What's New lines: ${pending.length}`)

const result = await pushWhatsNewToDatabase({ projectRoot: ROOT })
if (result.skipped && result.reason) {
  console.warn(result.reason)
  process.exit(1)
}
if (!result.ok) {
  console.error('Push failed:', result.error)
  process.exit(1)
}
if (result.empty) {
  console.log('Nothing to push.')
  process.exit(0)
}
console.log(`✓ Ingested What's New — inserted ${result.inserted}, skipped ${result.skipped} (already in DB for this version)`)
if (result.wiped) console.log('  Pending file wiped.')
