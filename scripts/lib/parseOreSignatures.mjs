/**
 * Parse ship-mining RS base signatures from mineable rock entity definitions.
 *
 * Source: extracted-data/libs/foundry/records/entities/mineable/mineablerock_*.json
 * Field: SSCSignatureSystemParams → radarProperties.baseSignatureParams.signatures[4]
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, basename } from 'path'
import { SHIP_ORE_SLUG_TO_NAME } from './miningOreNames.mjs'

/** Index in the 8-slot signatures array that holds the mining scanner RS value. */
export const RS_SIGNATURE_ARRAY_INDEX = 4

/** Canonical ship-mining rock templates: mineablerock_{asteroid|surface}{tier}_{ore}.json */
const SHIP_ROCK_FILENAME =
  /^mineablerock_(asteroid|surface)(legendary|epic|rare|uncommon|common)_(.+)\.json$/i

const CANONICAL_ORE_NAMES = [...new Set(Object.values(SHIP_ORE_SLUG_TO_NAME))].sort()

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

export function extractRsSignatureFromEntity(json) {
  for (const component of json?._RecordValue_?.Components ?? []) {
    if (component._Type_ !== 'SSCSignatureSystemParams') continue
    const signatures = component.radarProperties?.baseSignatureParams?.signatures ?? []
    const value = signatures[RS_SIGNATURE_ARRAY_INDEX]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.round(value)
    }
  }
  return null
}

function oreFromShipRockFilename(filename) {
  const match = filename.match(SHIP_ROCK_FILENAME)
  if (!match) return null
  const slug = match[3]
    .replace(/_rcd_(large|small)$/i, '')
    .replace(/_rcd$/i, '')
    .toLowerCase()
  return SHIP_ORE_SLUG_TO_NAME[slug] ?? null
}

/**
 * @param {string} extractedDataRoot
 * @returns {{
 *   oreSignatures: Record<string, number>
 *   sources: Record<string, { signature: number, entityFiles: string[], depositTypes: string[] }>
 *   audit: { conflicts: string[], missingOres: string[], templateFiles: number }
 * }}
 */
export function parseOreSignatures(extractedDataRoot) {
  const mineableDir = join(extractedDataRoot, 'libs/foundry/records/entities/mineable')
  if (!existsSync(mineableDir)) {
    return {
      oreSignatures: {},
      sources: {},
      audit: { conflicts: ['entities/mineable directory missing'], missingOres: CANONICAL_ORE_NAMES, templateFiles: 0 },
    }
  }

  /** @type {Map<string, { signature: number, entityFiles: Set<string>, depositTypes: Set<string> }>} */
  const byOre = new Map()
  let templateFiles = 0

  for (const file of readdirSync(mineableDir)) {
    if (!file.endsWith('.json')) continue
    const oreName = oreFromShipRockFilename(file)
    if (!oreName) continue

    const json = readJson(join(mineableDir, file))
    const signature = extractRsSignatureFromEntity(json)
    if (signature == null) continue

    templateFiles += 1
    const depositMatch = file.match(SHIP_ROCK_FILENAME)
    const depositType = depositMatch?.[1]?.toLowerCase() ?? 'unknown'

    const existing = byOre.get(oreName) ?? {
      signature: signature,
      entityFiles: new Set(),
      depositTypes: new Set(),
    }

    if (existing.signature !== signature) {
      existing.conflict = `${oreName}: ${existing.signature} vs ${signature} in ${file}`
    }

    existing.entityFiles.add(file)
    existing.depositTypes.add(depositType)
    byOre.set(oreName, existing)
  }

  const oreSignatures = {}
  const sources = {}
  const conflicts = []

  for (const [oreName, entry] of byOre.entries()) {
    oreSignatures[oreName] = entry.signature
    sources[oreName] = {
      signature: entry.signature,
      entityFiles: [...entry.entityFiles].sort(),
      depositTypes: [...entry.depositTypes].sort(),
    }
    if (entry.conflict) conflicts.push(entry.conflict)
  }

  if (oreSignatures.Aluminium != null && oreSignatures.Aluminum == null) {
    oreSignatures.Aluminum = oreSignatures.Aluminium
  }

  const missingOres = CANONICAL_ORE_NAMES.filter((name) => oreSignatures[name] == null)

  return {
    oreSignatures,
    sources,
    audit: { conflicts, missingOres, templateFiles },
  }
}
