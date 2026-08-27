import { writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')

function sameNameSet(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
  const left = [...a].map((n) => String(n).toLowerCase()).sort()
  const right = [...b].map((n) => String(n).toLowerCase()).sort()
  return left.every((name, i) => name === right[i])
}

/**
 * Build display-name → internalName lookup (+ contract disambiguation map).
 */
export function buildBlueprintNameLookup(blueprints, contractData, missionBlueprints) {
  const byInternalName = {}
  const displayGroups = new Map()

  for (const bp of blueprints) {
    const internalName = (bp.internalName || '').toLowerCase().trim()
    if (!internalName) continue
    const blueprintName = bp.blueprintName || internalName
    byInternalName[internalName] = {
      blueprintName,
      categoryName: bp.categoryName || null,
    }
    const key = blueprintName.toLowerCase().trim()
    if (!displayGroups.has(key)) displayGroups.set(key, [])
    displayGroups.get(key).push({
      internalName,
      blueprintName,
      categoryName: bp.categoryName || null,
    })
  }

  const byDisplayName = {}
  for (const [key, entries] of displayGroups) {
    if (entries.length === 1) {
      byDisplayName[key] = {
        internalName: entries[0].internalName,
        blueprintName: entries[0].blueprintName,
      }
    } else {
      byDisplayName[key] = {
        ambiguous: true,
        displayName: entries[0].blueprintName,
        candidates: entries,
      }
    }
  }

  const byContractDefinitionId = {}
  const contracts = contractData?.contracts || []
  for (const contract of contracts) {
    const internalNames = new Set()
    for (const pool of contract.blueprintPools || []) {
      const items = missionBlueprints[pool.key] || []
      for (const item of items) {
        const name = (item.name || '').toLowerCase()
        if (name) internalNames.add(name)
      }
    }
    if (internalNames.size === 0) continue
    const names = [...internalNames]
    const keys = [contract.id, contract.debugName, contract.displayTitle, contract.title]
    for (const id of keys.filter(Boolean)) {
      const key = String(id).trim().toLowerCase()
      if (!key) continue
      const existing = byContractDefinitionId[key]
      if (existing && !sameNameSet(existing, names)) {
        // Display-title collision with a different pool — drop the ambiguous title key.
        if (id === contract.id || id === contract.debugName) {
          byContractDefinitionId[key] = names
        } else {
          delete byContractDefinitionId[key]
        }
        continue
      }
      byContractDefinitionId[key] = names
    }
  }

  const ambiguousCount = Object.values(byDisplayName).filter((e) => e.ambiguous).length

  return {
    _source: 'Generated from game-blueprints.json + contract data',
    _extracted: new Date().toISOString(),
    stats: {
      internalNames: Object.keys(byInternalName).length,
      displayNames: Object.keys(byDisplayName).length,
      ambiguousDisplayNames: ambiguousCount,
      contractDefinitions: Object.keys(byContractDefinitionId).length,
    },
    byInternalName,
    byDisplayName,
    byContractDefinitionId,
  }
}

const CANONICAL_LOOKUP = 'src/data/blueprint-name-lookup.json'

const LOOKUP_COPY_TARGETS = [
  'scripts/bp-dumper-py/lookup.json',
  'scripts/bp-dumper-go/lookup.json',
  'supabase/functions/log-watcher-webhook/lookup.json',
]

const DUMPER_VERSION_SOURCE = 'scripts/bp-dumper/version.json'

const DUMPER_VERSION_COPY_TARGETS = [
  'scripts/bp-dumper-py/dumper-version.json',
  'supabase/functions/log-watcher-webhook/dumper-version.json',
]

export function copyBlueprintLookupTargets(rootDir = repoRoot) {
  const source = join(rootDir, CANONICAL_LOOKUP)
  if (!existsSync(source)) {
    throw new Error(`Missing canonical lookup: ${source}`)
  }
  for (const rel of LOOKUP_COPY_TARGETS) {
    const dest = join(rootDir, rel)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(source, dest)
  }
}

export function copyDumperVersionTargets(rootDir = repoRoot) {
  const source = join(rootDir, DUMPER_VERSION_SOURCE)
  if (!existsSync(source)) {
    throw new Error(`Missing dumper version file: ${source}`)
  }
  for (const rel of DUMPER_VERSION_COPY_TARGETS) {
    const dest = join(rootDir, rel)
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(source, dest)
  }
}

export function saveBlueprintNameLookup(lookup, rootDir = repoRoot) {
  const json = `${JSON.stringify(lookup, null, 2)}\n`
  const dest = join(rootDir, CANONICAL_LOOKUP)
  mkdirSync(dirname(dest), { recursive: true })
  writeFileSync(dest, json, 'utf8')
  copyBlueprintLookupTargets(rootDir)
  console.log(
    `  Saved ${CANONICAL_LOOKUP} (${lookup.stats.internalNames} internal, ${lookup.stats.ambiguousDisplayNames} ambiguous display names)`
  )
}
