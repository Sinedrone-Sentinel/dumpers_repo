/**
 * Resource Tracker Q0 catalog — mirrors src/config/extraResources.ts + isNoQualityResource().
 * Used by fetch-commodity-dfp-bases.mjs so DFP commodity entries match tracker dropdown items.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const SALVAGE_KEYS = new Set([
  'rmc',
  'construction_material',
  'construction_material_pebbles',
  'construction_material_rubble',
  'construction_material_salvage',
  'compboard',
  'scrap',
  'waste',
  'inert_materials',
])

const HARVEST_KEYS = new Set(['yormandi_eye', 'yormandi_tongue'])

/** Parse EXTRA_CATALOG_RESOURCES from extraResources.ts */
export function parseExtraCatalog(extraResourcesPath) {
  const tsSource = fs.readFileSync(extraResourcesPath, 'utf8')
  const entries = []
  const re = /\{\s*resourceKey:\s*'([^']+)',\s*label:\s*(['"])([\s\S]*?)\2\s*\}/g
  let match
  while ((match = re.exec(tsSource)) !== null) {
    entries.push({ resourceKey: match[1], label: match[3] })
  }
  return entries
}

/** Q0-only Resource Tracker extras (same scope as isNoQualityResource in dfp.ts). */
export function getResourceTrackerQ0Catalog(repoRoot) {
  const extraResourcesPath = path.join(repoRoot, 'src/config/extraResources.ts')
  const catalog = parseExtraCatalog(extraResourcesPath)
  return catalog
    .filter(({ resourceKey }) => !HARVEST_KEYS.has(resourceKey))
    .map(({ resourceKey, label }) => ({
      internalName: resourceKey,
      displayName: label,
      category: SALVAGE_KEYS.has(resourceKey) ? 'salvage' : 'commodity',
    }))
}

export function resolveRepoRoot(fromDir = path.dirname(fileURLToPath(import.meta.url))) {
  const base = path.basename(fromDir)
  if (base === 'lib') return path.resolve(fromDir, '..', '..')
  if (base === 'scripts') return path.resolve(fromDir, '..')
  return fromDir
}
