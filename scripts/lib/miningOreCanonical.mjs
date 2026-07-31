/**
 * Resolve raw localization ore labels to canonical compendium spellings.
 * Desc / asteroid / surface mineable lines are matched against the compendium
 * master list — not trusted at face value.
 */

import aliasData from '../../src/data/mining-ore-aliases.json' with { type: 'json' }
import { GROUND_VEHICLE_GEMS, HAND_MINEABLE_ORES, stripMineableLabel } from './miningOreConsts.mjs'
import { recordSpellingCorrection } from './spellingCorrections.mjs'

/** @type {Record<string, string>} */
export const ORE_SPELLING_ALIASES = { ...aliasData.aliases }

/** Ship-mining rarity tiers — duplicated here to avoid circular imports with miningOreRarity. */
const ORE_RARITY_TIER_LIST = {
  legendary: ['Quantainium', 'Savrilium', 'Stileron'],
  epic: ['Lindinium', 'Ouratite', 'Riccite'],
  rare: ['Beryl', 'Bexalite', 'Laranite', 'Agricium', 'Borase', 'Hephaestanite', 'Gold', 'Aslarite'],
  uncommon: ['Corundum', 'Quartz', 'Titanium', 'Tungsten', 'Diamond', 'Taranite'],
  common: ['Aluminum', 'Copper', 'Iron', 'Silicon', 'Tin'],
  handMineable: ['Aphorite', 'Dolivine', 'Hadanite', 'Janalite', 'Glacosite', 'Feynmaline', 'Sadaryx'],
}

function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

/** Default master ore names (rarity tiers + hand / ground gems). */
export function buildDefaultOreMasterList() {
  const master = new Set()
  for (const ores of Object.values(ORE_RARITY_TIER_LIST)) {
    for (const ore of ores) master.add(ore)
  }
  for (const ore of HAND_MINEABLE_ORES) master.add(ore)
  for (const ore of GROUND_VEHICLE_GEMS) master.add(ore)
  return master
}

/**
 * Parse compendium lines and return canonical ore names for the master list.
 * @param {string} compendiumText
 * @returns {string[]}
 */
export function parseCompendiumOreNames(compendiumText) {
  if (!compendiumText) return []
  const names = []
  const lines = compendiumText.split('\\n')
  for (const line of lines) {
    const match = line.match(/^([A-Za-z]+)\s*-\s*(.+)$/i)
    if (match) names.push(match[1].trim())
  }
  return names
}

/**
 * @param {string} rawName
 * @param {Set<string> | string[] | null} [masterList]
 * @returns {string}
 */
export function resolveCanonicalOreName(rawName, masterList = null) {
  const label = stripMineableLabel(rawName)
  if (!label) return label

  if (ORE_SPELLING_ALIASES[label]) {
    const canonical = ORE_SPELLING_ALIASES[label]
    if (canonical !== label) {
      recordSpellingCorrection(label, canonical, 'Ore / localization alias')
    }
    return canonical
  }

  const master =
    masterList == null
      ? buildDefaultOreMasterList()
      : masterList instanceof Set
        ? masterList
        : new Set(masterList)

  const lower = label.toLowerCase()
  for (const canonical of master) {
    if (canonical.toLowerCase() === lower) return canonical
  }

  let best = null
  let bestDist = Infinity
  for (const canonical of master) {
    const dist = levenshtein(lower, canonical.toLowerCase())
    if (dist < bestDist) {
      bestDist = dist
      best = canonical
    } else if (dist === bestDist) {
      best = null
    }
  }

  if (best != null && bestDist > 0 && bestDist <= 2 && label.length >= 4) {
    recordSpellingCorrection(label, best, 'Ore / fuzzy match')
    return best
  }

  return label
}

/**
 * Build master list: default tiers + compendium entries (resolved iteratively).
 * @param {string[]} compendiumRawNames
 */
export function buildOreMasterList(compendiumRawNames = []) {
  const master = buildDefaultOreMasterList()
  for (const raw of compendiumRawNames) {
    const canonical = resolveCanonicalOreName(raw, master)
    master.add(canonical)
  }
  return master
}

function mergeLocationArrays(target, source) {
  const seen = new Set(target.map((v) => v.toLowerCase()))
  for (const item of source) {
    const key = item.toLowerCase()
    if (!seen.has(key)) {
      target.push(item)
      seen.add(key)
    }
  }
}

/**
 * Merge oreLocations keys that resolve to the same canonical name.
 * @param {Record<string, string[]>} oreLocations
 * @param {Set<string>} masterList
 */
export function consolidateOreLocations(oreLocations, masterList) {
  const merged = {}
  for (const [ore, locations] of Object.entries(oreLocations ?? {})) {
    const canonical = resolveCanonicalOreName(ore, masterList)
    if (!merged[canonical]) merged[canonical] = []
    mergeLocationArrays(merged[canonical], locations)
  }
  for (const ore of Object.keys(merged)) {
    merged[ore] = [...new Set(merged[ore])]
  }
  return merged
}

/**
 * @param {Record<string, { name: string, rarity: string }[]>} locationOres
 * @param {Set<string>} masterList
 */
export function consolidateLocationOres(locationOres, masterList) {
  const out = {}
  for (const [guideLoc, rows] of Object.entries(locationOres ?? {})) {
    const byCanonical = new Map()
    for (const row of rows) {
      const canonical = resolveCanonicalOreName(row.name, masterList)
      const existing = byCanonical.get(canonical)
      if (!existing) {
        byCanonical.set(canonical, { name: canonical, rarity: row.rarity })
      } else if (row.rarity === 'handMineable') {
        existing.rarity = 'handMineable'
      }
    }
    out[guideLoc] = [...byCanonical.values()]
  }
  return out
}

/**
 * @param {Record<string, object>} locationMineables
 * @param {Set<string>} masterList
 */
export function consolidateLocationMineables(locationMineables, masterList) {
  const out = {}
  for (const [guideLoc, mineables] of Object.entries(locationMineables ?? {})) {
    const dedupeList = (list) => {
      const seen = new Set()
      const result = []
      for (const raw of list ?? []) {
        const canonical = resolveCanonicalOreName(raw, masterList)
        const key = canonical.toLowerCase()
        if (!seen.has(key)) {
          seen.add(key)
          result.push(canonical)
        }
      }
      return result
    }
    out[guideLoc] = {
      ...mineables,
      shipMineables: dedupeList(mineables.shipMineables),
      groundVehicleMineables: dedupeList(mineables.groundVehicleMineables),
      handMineables: dedupeList(mineables.handMineables),
    }
  }
  return out
}

/**
 * @param {Record<string, Record<string, string>>} handMineableHabitats
 * @param {Set<string>} masterList
 */
export function consolidateHandMineableHabitats(handMineableHabitats, masterList) {
  const out = {}
  for (const [rawOre, byLoc] of Object.entries(handMineableHabitats ?? {})) {
    const ore = resolveCanonicalOreName(rawOre, masterList)
    if (!out[ore]) out[ore] = {}
    for (const [loc, habitat] of Object.entries(byLoc)) {
      out[ore][loc] = habitat
    }
  }
  return out
}

/**
 * Full pass over parsed mining-locations shape.
 * @param {object} miningLocations
 * @param {Set<string>} [masterList]
 */
export function consolidateMiningLocationData(miningLocations, masterList = buildDefaultOreMasterList()) {
  return {
    ...miningLocations,
    oreLocations: consolidateOreLocations(miningLocations.oreLocations, masterList),
    locationOres: consolidateLocationOres(miningLocations.locationOres, masterList),
    locationMineables: consolidateLocationMineables(miningLocations.locationMineables, masterList),
    handMineableHabitats: consolidateHandMineableHabitats(
      miningLocations.handMineableHabitats,
      masterList
    ),
  }
}
