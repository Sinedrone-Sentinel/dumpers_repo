/**
 * Reconcile oreLocations with parsed spawn profiles (authoritative HPP links).
 * Adds missing spawn sites and optionally prunes compendium-only sites that
 * contradict HPP when the ore has per-location spawn data.
 */

import { REDUNDANT_SUBSITE_GUIDE_LOCATIONS } from './miningLocationAliases.mjs'
import { normalizeMineableLabel } from './miningOreNames.mjs'

const BROAD_GUIDE_LOCATIONS = new Set([
  'All Moons/Planets/Caves',
  'All Pyro Planets',
  'Pyro Asteroid Clusters',
  'Found in All Stanton Deposits (Rare)',
  'QV Breaker Stations (Nyx)',
])

function assignOreRarityFromTiers(ore, rarityTiers) {
  for (const [rarity, rows] of Object.entries(rarityTiers ?? {})) {
    if (rows.some((row) => row.name === ore)) return rarity
  }
  return 'common'
}

function ensureLocationOre(locationOres, guideLoc, ore, rarity) {
  if (!locationOres[guideLoc]) locationOres[guideLoc] = []
  const existing = locationOres[guideLoc].find((entry) => entry.name === ore)
  if (existing) {
    if (rarity === 'handMineable') existing.rarity = 'handMineable'
  } else {
    locationOres[guideLoc].push({ name: ore, rarity })
  }
}

function ensureLocationMineable(locationMineables, guideLoc, ore, spawnKey) {
  if (!locationMineables[guideLoc]) {
    locationMineables[guideLoc] = {
      shipMineables: [],
      groundVehicleMineables: [],
      handMineables: [],
      harvestables: [],
      creatures: [],
      spawnKey,
    }
  } else if (!locationMineables[guideLoc].spawnKey && spawnKey) {
    locationMineables[guideLoc].spawnKey = spawnKey
  }
  const list = locationMineables[guideLoc].shipMineables
  const canonical = normalizeMineableLabel(ore)
  if (!list.some((label) => normalizeMineableLabel(label).toLowerCase() === canonical.toLowerCase())) {
    list.push(canonical)
  }
}

/**
 * @param {object} params
 * @param {Record<string, string[]>} params.oreLocations
 * @param {Record<string, { name: string, rarity: string }[]>} params.locationOres
 * @param {Record<string, object>} [params.locationMineables]
 * @param {Record<string, object>} params.spawnOres - parseMiningSpawns().ores
 * @param {Record<string, object[]>} params.rarityTiers
 * @param {(ore: string) => string} [params.assignOreRarity]
 * @param {boolean} [params.pruneUnsupportedCompendiumSites=true]
 * @returns {{ added: number, pruned: number }}
 */
export function mergeSpawnOreLocations({
  oreLocations,
  locationOres,
  locationMineables = null,
  spawnOres,
  rarityTiers,
  assignOreRarity = (ore) => assignOreRarityFromTiers(ore, rarityTiers),
  pruneUnsupportedCompendiumSites = true,
}) {
  let added = 0
  let pruned = 0

  for (const [ore, profile] of Object.entries(spawnOres ?? {})) {
    const spawnGuideSites = new Set()
    for (const loc of Object.values(profile.locations ?? {})) {
      if (loc.guideName) spawnGuideSites.add(loc.guideName)
    }
    if (spawnGuideSites.size === 0) continue

    if (!oreLocations[ore]) oreLocations[ore] = []
    const rarity = assignOreRarity(ore)

    for (const guideLoc of spawnGuideSites) {
      if (REDUNDANT_SUBSITE_GUIDE_LOCATIONS.has(guideLoc)) continue
      if (!oreLocations[ore].includes(guideLoc)) {
        oreLocations[ore].push(guideLoc)
        added++
      }
      ensureLocationOre(locationOres, guideLoc, ore, rarity)
      if (locationMineables) {
        const spawnKey = Object.values(profile.locations ?? {}).find(
          (loc) => loc.guideName === guideLoc
        )?.spawnKey
        ensureLocationMineable(locationMineables, guideLoc, ore, spawnKey)
      }
    }

    if (!pruneUnsupportedCompendiumSites) continue

    const before = oreLocations[ore].length
    oreLocations[ore] = oreLocations[ore].filter((guideLoc) => {
      if (BROAD_GUIDE_LOCATIONS.has(guideLoc)) return true
      if (REDUNDANT_SUBSITE_GUIDE_LOCATIONS.has(guideLoc)) return false
      return spawnGuideSites.has(guideLoc)
    })
    pruned += before - oreLocations[ore].length

    for (const [guideLoc, rows] of Object.entries(locationOres)) {
      const idx = rows.findIndex((entry) => entry.name === ore)
      if (idx === -1) continue
      const keep =
        BROAD_GUIDE_LOCATIONS.has(guideLoc) ||
        (!REDUNDANT_SUBSITE_GUIDE_LOCATIONS.has(guideLoc) && spawnGuideSites.has(guideLoc))
      if (!keep) {
        rows.splice(idx, 1)
      }
    }
  }

  for (const [ore, locations] of Object.entries(oreLocations)) {
    oreLocations[ore] = [...new Set(locations)].filter(
      (loc) => !REDUNDANT_SUBSITE_GUIDE_LOCATIONS.has(loc)
    )
  }

  return { added, pruned }
}

/**
 * Rebuild rarityTiers from oreLocations after merge/prune.
 */
export function rebuildRarityTiers(oreLocations, rarityTiers, rarityOrder, assignOreRarity) {
  const byRarity = Object.fromEntries(rarityOrder.map((r) => [r, []]))
  for (const [ore, locations] of Object.entries(oreLocations)) {
    const assignedRarity = assignOreRarity(ore)
    byRarity[assignedRarity].push({ name: ore, locations: [...locations] })
  }
  return byRarity
}
