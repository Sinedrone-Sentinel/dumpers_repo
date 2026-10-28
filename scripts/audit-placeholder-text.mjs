/**
 * Fail when a CIG localization placeholder ("<= PLACEHOLDER =>", @LOC_PLACEHOLDER,
 * "Placeholder text") is left in member-facing game data.
 *
 * Every src/data JSON is scanned. game-reputation.json keeps raw scope dumps for
 * the parser; only its factionStandings reach the site, so only that part is checked.
 *
 * Usage: node scripts/audit-placeholder-text.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findPlaceholderLeaks } from './lib/placeholderText.mjs'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data')

const SCOPED_FILES = {
  'game-reputation.json': (json) => ({ factionStandings: json.factionStandings }),
}

const leaks = []
for (const file of readdirSync(dataDir).filter((f) => f.endsWith('.json')).sort()) {
  let json
  try {
    json = JSON.parse(readFileSync(join(dataDir, file), 'utf8'))
  } catch {
    continue
  }
  const scoped = SCOPED_FILES[file] ? SCOPED_FILES[file](json) : json
  for (const leak of findPlaceholderLeaks(scoped)) leaks.push({ file, ...leak })
}

if (leaks.length) {
  console.error(`Placeholder text audit failed (${leaks.length})`)
  for (const leak of leaks.slice(0, 40)) {
    console.error(`  ${leak.file} ${leak.path}: ${leak.value}`)
  }
  if (leaks.length > 40) console.error(`  … +${leaks.length - 40} more`)
  console.error('\nFix the parser so it falls back to a real name, then re-parse.')
  process.exit(1)
}

console.log('Placeholder text audit passed')
