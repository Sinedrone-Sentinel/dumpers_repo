#!/usr/bin/env node
/**
 * Pack scripts/bp-dumper-py (+ lookup.json) into a member-downloadable zip for GitHub Releases.
 *
 * Usage: node scripts/pack-bp-dumper-py-zip.mjs [outDir]
 * Default outDir: scripts/installer/output
 *
 * Hard requirement: lookup.json must be present and non-trivial (blueprint name map).
 */
import AdmZip from 'adm-zip'
import { existsSync, mkdirSync, statSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { copyBlueprintLookupTargets } from './lib/blueprintNameLookup.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PY_DIR = join(ROOT, 'scripts', 'bp-dumper-py')
const ZIP_BASENAME = 'BPDumper-python-scripts'
const ZIP_FILENAME = `${ZIP_BASENAME}.zip`
/** Reject empty / stub lookup copies (canonical file is ~1MB+). */
const MIN_LOOKUP_BYTES = 50_000

const BUNDLE_FILES = [
  'dumper.py',
  '_version.py',
  '_min_game_version.py',
  'lookup.json',
  'requirements.txt',
  'README.md',
  'dumper.bat',
  'dumper.sh',
  'LICENSE',
]

const outDir = process.argv[2]
  ? join(process.cwd(), process.argv[2])
  : join(ROOT, 'scripts', 'installer', 'output')

copyBlueprintLookupTargets(ROOT)

const lookupPath = join(PY_DIR, 'lookup.json')
if (!existsSync(lookupPath)) {
  throw new Error(`Missing ${lookupPath} after copy-blueprint-lookup`)
}
const lookupSize = statSync(lookupPath).size
if (lookupSize < MIN_LOOKUP_BYTES) {
  throw new Error(
    `lookup.json is too small (${lookupSize} bytes). Expected >= ${MIN_LOOKUP_BYTES}. Aborting zip.`,
  )
}

mkdirSync(outDir, { recursive: true })

const zip = new AdmZip()
const folderPrefix = `${ZIP_BASENAME}/`

for (const name of BUNDLE_FILES) {
  const src = join(PY_DIR, name)
  if (!existsSync(src)) {
    throw new Error(`Missing ${src} (run: npm run copy-blueprint-lookup)`)
  }
  zip.addLocalFile(src, folderPrefix)
}

const zipPath = join(outDir, ZIP_FILENAME)
zip.writeZip(zipPath)

// Verify the zip we just wrote actually contains lookup.json
const verify = new AdmZip(zipPath)
const lookupEntry = verify.getEntries().find((e) => e.entryName.endsWith('/lookup.json') || e.entryName === 'lookup.json')
if (!lookupEntry || lookupEntry.header.size < MIN_LOOKUP_BYTES) {
  throw new Error('Packed zip is missing a valid lookup.json — refusing to publish a broken bundle')
}

console.log(`Wrote ${zipPath}`)
console.log(`lookup.json: ${lookupSize} bytes (in zip as ${lookupEntry.entryName})`)
console.log(`Includes: ${BUNDLE_FILES.join(', ')}`)
