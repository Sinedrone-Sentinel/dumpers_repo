#!/usr/bin/env node
/**
 * Normalize ore spellings in generated mining JSON (no re-extraction required).
 * Merges alias duplicates (Aluminium/Alumium → Aluminum, Tarantite → Taranite, etc.)
 *
 * Run: node scripts/normalize-mining-ore-data.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import {
  buildDefaultOreMasterList,
  consolidateMiningLocationData,
  resolveCanonicalOreName,
} from './lib/miningOreCanonical.mjs'
import { normalizeCompositionElementName } from './lib/miningOreNames.mjs'
import { rebuildRarityTiers } from './lib/mergeSpawnOreLocations.mjs'
import { assignOreRarity } from './lib/miningOreRarity.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA = join(__dirname, '..', 'src', 'data')
const masterList = buildDefaultOreMasterList()

function readJson(name) {
  return JSON.parse(readFileSync(join(DATA, name), 'utf-8'))
}

function writeJson(name, data) {
  writeFileSync(join(DATA, name), `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
}

function normalizeLocations() {
  const data = readJson('game-mining-locations.json')
  const consolidated = consolidateMiningLocationData(
    {
      oreLocations: data.oreLocations,
      locationOres: data.locationOres,
      locationMineables: data.locationMineables,
      handMineableHabitats: data.handMineableHabitats ?? {},
    },
    masterList
  )

  data.oreLocations = consolidated.oreLocations
  data.locationOres = consolidated.locationOres
  data.locationMineables = consolidated.locationMineables
  data.handMineableHabitats = consolidated.handMineableHabitats
  data.rarityTiers = rebuildRarityTiers(
    data.oreLocations,
    data.rarityTiers,
    data.rarityOrder,
    assignOreRarity
  )
  data.summary = {
    ...data.summary,
    totalOres: Object.keys(data.oreLocations).length,
    totalLocations: Object.keys(data.locationOres).length,
    locationsWithDetails: Object.keys(data.locationMineables).length,
  }

  writeJson('game-mining-locations.json', data)
  console.log(`  game-mining-locations.json: ${data.summary.totalOres} ores`)
}

function normalizeSpawns() {
  const data = readJson('game-mining-spawns.json')
  const ores = data.ores ?? {}
  const merged = {}

  for (const [oreKey, profile] of Object.entries(ores)) {
    const canonical = resolveCanonicalOreName(oreKey, masterList)
    const existing = merged[canonical] ?? {
      oreName: canonical,
      baseSignature: profile.baseSignature,
      locations: {},
      harvestablePresets: [],
      compositionRecordIds: [],
      clusterPresetKeys: [],
    }

    if (!existing.baseSignature && profile.baseSignature) {
      existing.baseSignature = profile.baseSignature
    }

    for (const [locKey, loc] of Object.entries(profile.locations ?? {})) {
      const parts = (loc.compositionParts ?? []).map((part) => ({
        ...part,
        elementName: normalizeCompositionElementName(part.elementName),
      }))
      existing.locations[locKey] = { ...loc, compositionParts: parts }
    }

    for (const preset of profile.harvestablePresets ?? []) {
      if (!existing.harvestablePresets.includes(preset)) existing.harvestablePresets.push(preset)
    }
    for (const id of profile.compositionRecordIds ?? []) {
      if (!existing.compositionRecordIds.includes(id)) existing.compositionRecordIds.push(id)
    }
    for (const key of profile.clusterPresetKeys ?? []) {
      if (!existing.clusterPresetKeys.includes(key)) existing.clusterPresetKeys.push(key)
    }

    merged[canonical] = existing
  }

  data.ores = merged
  if (data.audit?.oresMissingProfile) {
    data.audit.oresMissingProfile = data.audit.oresMissingProfile
      .map((name) => resolveCanonicalOreName(name, masterList))
      .filter((name, idx, arr) => arr.indexOf(name) === idx)
      .filter((name) => !merged[name])
  }
  if (data.summary) {
    data.summary.oresWithProfiles = Object.keys(merged).length
  }

  writeJson('game-mining-spawns.json', data)
  console.log(`  game-mining-spawns.json: ${Object.keys(merged).length} ore profiles`)
}

function normalizeMiningJson() {
  const data = readJson('game-mining.json')
  const sigs = data.oreSignatures ?? {}
  if (sigs.Aluminium != null && sigs.Aluminum == null) {
    sigs.Aluminum = sigs.Aluminium
  }
  delete sigs.Aluminium
  data.oreSignatures = sigs
  writeJson('game-mining.json', data)
  console.log('  game-mining.json: oreSignatures consolidated to Aluminum')
}

console.log('Normalizing mining ore spellings...')
normalizeLocations()
normalizeSpawns()
normalizeMiningJson()
console.log('Done.')
