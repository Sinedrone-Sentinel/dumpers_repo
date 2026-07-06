/**
 * Merge mineable locations from HPP provider presets (ship, FPS, ground-vehicle).
 * Compendium / localization desc often under-report per-body spawn coverage.
 */

import {
  hppRecordToSpawnKey,
  resolveAliasForSpawnKey,
  SPAWN_CODE_GUIDE_NAMES,
} from './miningLocationAliases.mjs'
import {
  HPP_MINEABLE_GROUPS,
  HPP_SKIP_BASENAMES,
  oreFromHppMineablePreset,
} from './hppMineablePresets.mjs'
import { normalizeMineableLabel, preferredGuideNameForSpawnKey } from './miningOreNames.mjs'
import {
  harvestablePresetBasename,
  loadHppProviderPresets,
} from './hppProviderPresets.mjs'

function guideLocationForHpp(hppKey, locationAliases) {
  const spawnKey = hppRecordToSpawnKey(hppKey)
  const resolved = resolveAliasForSpawnKey(spawnKey, locationAliases)
  const guideLoc = preferredGuideNameForSpawnKey(
    spawnKey,
    resolved.guideName ?? SPAWN_CODE_GUIDE_NAMES[spawnKey] ?? spawnKey
  )
  return { spawnKey, guideLoc, hppKey }
}

function ensureLocationMineables(locationMineables, guideLoc, spawnKey) {
  if (!locationMineables[guideLoc]) {
    locationMineables[guideLoc] = {
      shipMineables: [],
      groundVehicleMineables: [],
      handMineables: [],
      harvestables: [],
      creatures: [],
      spawnKey,
    }
    return
  }
  if (!locationMineables[guideLoc].spawnKey) {
    locationMineables[guideLoc].spawnKey = spawnKey
  }
}

function mergeOreAtSite({
  ore,
  guideLoc,
  spawnKey,
  mineableField,
  oreLocations,
  locationOres,
  locationMineables,
  assignOreRarity,
}) {
  if (!oreLocations[ore]) oreLocations[ore] = []
  if (!oreLocations[ore].includes(guideLoc)) {
    oreLocations[ore].push(guideLoc)
  }

  const rarity = assignOreRarity(ore)
  if (!locationOres[guideLoc]) locationOres[guideLoc] = []
  const existing = locationOres[guideLoc].find((entry) => entry.name === ore)
  if (existing) {
    if (rarity === 'handMineable') existing.rarity = 'handMineable'
  } else {
    locationOres[guideLoc].push({ name: ore, rarity })
  }

  ensureLocationMineables(locationMineables, guideLoc, spawnKey)
  const list = locationMineables[guideLoc][mineableField]
  const canonical = normalizeMineableLabel(ore)
  if (!list.some((label) => normalizeMineableLabel(label).toLowerCase() === canonical.toLowerCase())) {
    list.push(canonical)
  }
}

/**
 * Collect ore×site links from HPP mineable groups (for audits).
 * @returns {Array<{ ore, guideLoc, spawnKey, hppKey, groupName, mineableField }>}
 */
export function collectHppMineableSiteLinks({ extractedDataRoot, locationAliases, hppPresets = null }) {
  const presets = hppPresets ?? loadHppProviderPresets(extractedDataRoot)
  if (presets.length === 0) return []

  const links = []
  const seen = new Set()

  for (const preset of presets) {
    if (HPP_SKIP_BASENAMES.has(preset.fileBase)) continue

    const { spawnKey, guideLoc } = guideLocationForHpp(preset.hppKey, locationAliases)

    for (const group of preset.recordValue.harvestableGroups ?? []) {
      const mineableField = HPP_MINEABLE_GROUPS[group.groupName]
      if (!mineableField) continue

      for (const h of group.harvestables ?? []) {
        const presetBasename = harvestablePresetBasename(h.harvestable)
        const ore = oreFromHppMineablePreset(presetBasename)
        if (!ore) continue

        const dedupeKey = `${group.groupName}|${ore}|${guideLoc}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)

        links.push({
          ore,
          guideLoc,
          spawnKey,
          hppKey: preset.hppKey,
          groupName: group.groupName,
          mineableField,
        })
      }
    }
  }

  return links
}

/**
 * @returns {number} count of ore×site merges applied
 */
export function mergeHppMineableLocations({
  extractedDataRoot,
  locationAliases,
  oreLocations,
  locationOres,
  locationMineables,
  assignOreRarity,
  hppPresets = null,
}) {
  const links = collectHppMineableSiteLinks({
    extractedDataRoot,
    locationAliases,
    hppPresets,
  })
  let mergeCount = 0

  for (const link of links) {
    mergeOreAtSite({
      ore: link.ore,
      guideLoc: link.guideLoc,
      spawnKey: link.spawnKey,
      mineableField: link.mineableField,
      oreLocations,
      locationOres,
      locationMineables,
      assignOreRarity,
    })
    mergeCount++
  }

  return mergeCount
}

/**
 * @deprecated Use mergeHppMineableLocations
 */
export function mergeGroundVehicleGemLocationsFromHpp(ctx) {
  return mergeHppMineableLocations(ctx)
}

export { loadHppProviderPresets } from './hppProviderPresets.mjs'
