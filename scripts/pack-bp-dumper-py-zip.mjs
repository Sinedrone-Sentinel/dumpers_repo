#!/usr/bin/env node
/**
 * Pack scripts/bp-dumper-py (+ lookup.json) into a member-downloadable zip for GitHub Releases.
 *
 * Usage: node scripts/pack-bp-dumper-py-zip.mjs [outDir]
 * Default outDir: scripts/installer/output
 */
import AdmZip from 'adm-zip'
import { existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { copyBlueprintLookupTargets } from './lib/blueprintNameLookup.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PY_DIR = join(ROOT, 'scripts', 'bp-dumper-py')
const ZIP_BASENAME = 'BPDumper-python-scripts'
const ZIP_FILENAME = `${ZIP_BASENAME}.zip`

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

console.log(`Wrote ${zipPath}`)
console.log(`Includes: ${BUNDLE_FILES.join(', ')}`)