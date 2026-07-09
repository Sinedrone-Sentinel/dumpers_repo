/**
 * Parse mining spawn / cluster profiles from extracted harvestable + HPP game data.
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { join, basename } from 'path'
import {
  auditAliasCoverage,
  hppRecordToSpawnKey,
  resolveAliasForSpawnKey,
} from './miningLocationAliases.mjs'
import { oreFromHppMineablePreset } from './hppMineablePresets.mjs'
import {
  normalizeCompositionElementName,
} from './miningOreNames.mjs'
import {
  harvestablePresetBasename,
  loadHppProviderPresets,
} from './hppProviderPresets.mjs'
import { applyVerifiedHppSpawnInheritance } from './verifiedHppSpawnInheritance.mjs'

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

function walkJsonFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walkJsonFiles(p, acc)
    else if (entry.name.endsWith('.json')) acc.push(p)
  }
  return acc
}

function resolveRef(ref, extractedDataRoot) {
  if (!ref) return null
  const s = String(ref)
  const idx = s.toLowerCase().indexOf('libs/foundry/records/')
  if (idx === -1) return null
  return join(extractedDataRoot, s.slice(idx).replace(/\//g, '\\'))
}

function normalizeLocationKey(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function depositTypeFromPreset(presetBasename) {
  if (/^mining_asteroid/i.test(presetBasename)) return 'asteroid'
  if (/^mining_(common|uncommon|rare|epic|legendary|surface)/i.test(presetBasename)) return 'surface'
  return null
}

function oreFromPresetBasename(presetBasename) {
  return oreFromHppMineablePreset(presetBasename)
}

function buildClusterRows(clusterPreset, baseSignature) {
  const val = clusterPreset?._RecordValue_
  if (!val) return { maxNodes: 0, rows: [], clusterPresetKey: null, probabilityOfClustering: 0 }

  const key = clusterPreset._RecordName_ || null
  const probabilityOfClustering = val.probabilityOfClustering ?? 100
  const arr = val.clusterParamsArray ?? []
  if (arr.length === 0) return { maxNodes: 0, rows: [], clusterPresetKey: key, probabilityOfClustering }

  const sumRel = arr.reduce((s, x) => s + (x.relativeProbability ?? 0), 0) || 1
  const rows = []
  let maxNodes = 0

  for (const param of arr) {
    const nodes = param.maxSize ?? param.minSize ?? 0
    if (nodes < 2) continue
    maxNodes = Math.max(maxNodes, nodes)
    const sizeShare = (param.relativeProbability ?? 0) / sumRel
    const chancePercent =
      probabilityOfClustering < 100
        ? Math.round(probabilityOfClustering * sizeShare * 100) / 100
        : Math.round(sizeShare * 10000) / 100
    rows.push({
      nodes,
      rs: baseSignature * nodes,
      chancePercent,
      minProximity: param.minProximity,
      maxProximity: param.maxProximity,
    })
  }

  rows.sort((a, b) => a.nodes - b.nodes)
  return { maxNodes, rows, clusterPresetKey: key, probabilityOfClustering }
}

function buildOverallProfile(locations, depositType, baseSignature, locationAliases) {
  const filtered = locations.filter((l) => l.depositType === depositType)
  if (filtered.length === 0) return null

  let maxNodes = 0
  let bestLocation = filtered[0].spawnKey ?? filtered[0].locationName
  let bestLocationSpawnPercent = filtered[0].effectiveSpawnPercent

  for (const loc of filtered) {
    maxNodes = Math.max(maxNodes, loc.maxNodes)
    if (loc.effectiveSpawnPercent > bestLocationSpawnPercent) {
      bestLocation = loc.spawnKey ?? loc.locationName
      bestLocationSpawnPercent = loc.effectiveSpawnPercent
    }
  }

  const baseSig = baseSignature
  const clusterRows = []
  for (let n = 2; n <= maxNodes; n++) {
    let bestChance = 0
    let bestAt = bestLocation
    for (const loc of filtered) {
      const row = loc.clusterRows.find((r) => r.nodes === n)
      if (row && row.chancePercent > bestChance) {
        bestChance = row.chancePercent
        bestAt = loc.spawnKey ?? loc.locationName
      }
    }
    if (bestChance > 0) {
      const bestAtResolved = resolveAliasForSpawnKey(bestAt, locationAliases)
      clusterRows.push({
        nodes: n,
        rs: baseSig * n,
        chancePercent: bestChance,
        bestAtLocation: bestAt,
        bestAtLocationDisplayName: bestAtResolved.displayName,
      })
    }
  }

  const bestResolved = resolveAliasForSpawnKey(bestLocation, locationAliases)

  let scaleRange = null
  let scannerMassRange = null
  for (const loc of filtered) {
    if (loc.scaleRange) {
      if (!scaleRange) {
        scaleRange = { ...loc.scaleRange }
        scannerMassRange = loc.scannerMassRange ? { ...loc.scannerMassRange } : null
      } else {
        scaleRange.min = Math.min(scaleRange.min, loc.scaleRange.min)
        scaleRange.max = Math.max(scaleRange.max, loc.scaleRange.max)
        if (loc.scannerMassRange) {
          if (!scannerMassRange) scannerMassRange = { ...loc.scannerMassRange }
          else {
            scannerMassRange.min = Math.min(scannerMassRange.min, loc.scannerMassRange.min)
            scannerMassRange.max = Math.max(scannerMassRange.max, loc.scannerMassRange.max)
          }
        }
      }
    }
  }

  return {
    maxNodes,
    clusterRows,
    bestLocation,
    bestLocationDisplayName: bestResolved.displayName,
    bestLocationSpawnPercent: Math.round(bestLocationSpawnPercent * 1000) / 1000,
    scaleRange,
    scannerMassRange,
  }
}

function parseCompositionParts(compositionJson, extractedDataRoot) {
  return (compositionJson?._RecordValue_?.compositionArray ?? []).map((part) => {
    const elemPath = part.mineableElement
    const elemFile =
      typeof elemPath === 'string'
        ? resolveRef(elemPath, extractedDataRoot)
        : resolveRef(elemPath?._RecordPath_ || elemPath, extractedDataRoot)
    let elementName = 'Unknown'
    if (elemFile) {
      const elem = readJson(elemFile)
      const rn = elem?._RecordName_ || basename(elemFile, '.json')
      const rawElementName = rn.replace(/^MineableElement\./i, '').replace(/_ore$|_raw$/i, '')
      elementName = normalizeCompositionElementName(rawElementName)
    }
    return {
      elementName,
      minPercentage: part.minPercentage,
      maxPercentage: part.maxPercentage,
      qualityScale: part.qualityScale,
    }
  })
}

function compositionFromJson(compositionJson, extractedDataRoot) {
  if (!compositionJson?._RecordName_) return null
  return {
    recordName: compositionJson._RecordName_,
    depositName: compositionJson._RecordValue_?.depositName,
    parts: parseCompositionParts(compositionJson, extractedDataRoot),
  }
}

function compositionFromEntityClass(entityPath, extractedDataRoot, compositions) {
  const entity = readJson(entityPath)
  const components = entity?._RecordValue_?.Components ?? []
  for (const component of components) {
    if (component._Type_ !== 'MineableParams') continue
    const compositionPath = resolveRef(component.composition, extractedDataRoot)
    if (!compositionPath) return null
    const compositionJson = readJson(compositionPath)
    const recordName = compositionJson?._RecordName_
    if (recordName && compositions.has(recordName)) {
      return compositions.get(recordName)
    }
    return compositionFromJson(compositionJson, extractedDataRoot)
  }
  return null
}

function buildPresetCompositionMap(extractedDataRoot, compositions) {
  const map = new Map()
  const presetDir = join(extractedDataRoot, 'libs/foundry/records/harvestable/harvestablepresets')
  for (const file of walkJsonFiles(presetDir)) {
    const presetBasename = basename(file, '.json')
    if (!/^mining_/i.test(presetBasename)) continue
    const preset = readJson(file)
    const entityPath = resolveRef(preset?._RecordValue_?.entityClass, extractedDataRoot)
    if (!entityPath) continue
    const comp = compositionFromEntityClass(entityPath, extractedDataRoot, compositions)
    if (comp) map.set(presetBasename, comp)
  }
  return map
}

function filledFactorFromEntity(entityPath) {
  const entity = readJson(entityPath)
  const components = entity?._RecordValue_?.Components ?? []
  for (const component of components) {
    if (component._Type_ !== 'MineableParams') continue
    const factor = component.filledFactor
    return typeof factor === 'number' && Number.isFinite(factor) ? factor : 1
  }
  return 1
}

/** Mass coefficient from MiningGlobalParamsShip — converts volume cargo factor to scanner mass. */
const MINING_MASS_COEFFICIENT = 0.2

function loadMiningGlobalShipScannerMassBase(extractedDataRoot) {
  const path = join(extractedDataRoot, 'libs/foundry/records/mining/miningglobalparamsship.json')
  const json = readJson(path)
  const val = json?._RecordValue_
  const defaultVolume = val?.mineableExplosionParams?.defaultVolume ?? 0
  const cSCUPerVolume = val?.cSCUPerVolume ?? 0
  if (!defaultVolume || !cSCUPerVolume) return 0
  return (defaultVolume * cSCUPerVolume) / MINING_MASS_COEFFICIENT
}

function scannerMassFromScale(scale, baseScannerMassAtFullScale, filledFactor = 1) {
  if (!baseScannerMassAtFullScale || !Number.isFinite(scale)) return null
  const mass = baseScannerMassAtFullScale * filledFactor * scale ** 3
  return Math.round(mass)
}

function buildPresetSpawnMetaMap(extractedDataRoot) {
  const map = new Map()
  const baseScannerMassAtFullScale = loadMiningGlobalShipScannerMassBase(extractedDataRoot)
  const presetDir = join(extractedDataRoot, 'libs/foundry/records/harvestable/harvestablepresets')
  for (const file of walkJsonFiles(presetDir)) {
    const presetBasename = basename(file, '.json')
    if (!/^mining_/i.test(presetBasename)) continue
    const preset = readJson(file)
    const transform = preset?._RecordValue_?.transformParams
    const minScale = transform?.minScale
    const maxScale = transform?.maxScale
    if (typeof minScale !== 'number' || typeof maxScale !== 'number') continue

    const entityPath = resolveRef(preset?._RecordValue_?.entityClass, extractedDataRoot)
    const filledFactor = entityPath ? filledFactorFromEntity(entityPath) : 1
    const minScannerMass = scannerMassFromScale(minScale, baseScannerMassAtFullScale, filledFactor)
    const maxScannerMass = scannerMassFromScale(maxScale, baseScannerMassAtFullScale, filledFactor)

    map.set(presetBasename, {
      scaleRange: { min: minScale, max: maxScale },
      scannerMassRange:
        minScannerMass != null && maxScannerMass != null
          ? { min: minScannerMass, max: maxScannerMass }
          : null,
      filledFactor,
    })
  }
  return map
}

function loadCompositions(extractedDataRoot) {
  const compDir = join(extractedDataRoot, 'libs/foundry/records/mining/rockcompositionpresets')
  const map = new Map()
  for (const file of walkJsonFiles(compDir)) {
    const json = readJson(file)
    if (!json?._RecordName_) continue
    const key = json._RecordName_
    const parsed = compositionFromJson(json, extractedDataRoot)
    if (parsed) map.set(key, parsed)
  }
  return map
}

function findCompositionForPreset(presetBasename, presetCompositionMap) {
  return presetCompositionMap.get(presetBasename) ?? null
}

function buildLocationIndex(miningLocations) {
  const allNames = new Set()
  for (const ore of Object.values(miningLocations?.oreLocations ?? {})) {
    for (const loc of ore) allNames.add(loc)
  }
  const byNorm = new Map()
  for (const name of allNames) {
    byNorm.set(normalizeLocationKey(name), name)
  }
  return { allNames, byNorm }
}

function matchGuideLocation(spawnKey, locationIndex, locationAliases) {
  const alias = locationAliases?.[spawnKey]
  if (alias?.guideName) return alias.guideName
  const norm = normalizeLocationKey(spawnKey)
  if (locationIndex.byNorm.has(norm)) return locationIndex.byNorm.get(norm)
  for (const [key, name] of locationIndex.byNorm.entries()) {
    if (key.includes(norm) || norm.includes(key)) return name
  }
  return alias?.displayName ?? spawnKey
}

/**
 * @param {string} extractedDataRoot
 * @param {object} miningLocations - parsed game-mining-locations shape (oreLocations, locationAliases)
 * @param {Record<string, number>} oreSignatures - RS base signatures from parseOreSignatures()
 * @param {import('./hppProviderPresets.mjs').HppProviderPreset[] | null} [hppPresets]
 */
export function parseMiningSpawns(extractedDataRoot, miningLocations = {}, oreSignatures = {}, hppPresets = null) {
  console.log('\n  Parsing mining spawn / cluster profiles...')

  const signatureOres = Object.keys(oreSignatures)
  if (signatureOres.length === 0) {
    console.log('  ⚠ No oreSignatures provided — spawn profiles will be empty')
  }

  const locationAliases = miningLocations.locationAliases ?? {}

  const clusterPresets = new Map()
  const clusterDir = join(extractedDataRoot, 'libs/foundry/records/harvestable/clusteringpresets')
  for (const file of walkJsonFiles(clusterDir)) {
    const json = readJson(file)
    if (json?._RecordName_) clusterPresets.set(json._RecordName_, json)
  }

  const compositions = loadCompositions(extractedDataRoot)
  const presetCompositionMap = buildPresetCompositionMap(extractedDataRoot, compositions)
  const presetSpawnMetaMap = buildPresetSpawnMetaMap(extractedDataRoot)
  const locationIndex = buildLocationIndex(miningLocations)
  const loadedHppPresets = hppPresets ?? loadHppProviderPresets(extractedDataRoot)
  const rawLinks = []
  const audit = {
    unmappedHppLinks: [],
    oresMissingProfile: [],
    unmappedSpawnKeys: [],
    rawDisplayNames: [],
  }
  const seenSpawnKeys = new Set()

  for (const preset of loadedHppPresets) {
    const hppKey = preset.hppKey
    const spawnKey = hppRecordToSpawnKey(hppKey)
    seenSpawnKeys.add(spawnKey)
    const resolved = resolveAliasForSpawnKey(spawnKey, locationAliases)
    const system = preset.system !== 'Unknown' ? preset.system : resolved.system

    for (const group of preset.recordValue.harvestableGroups ?? []) {
      if (group.groupName !== 'SpaceShip_Mineables') continue
      const groupProb = group.groupProbability ?? 0
      const poolSum = (group.harvestables ?? []).reduce((s, h) => s + (h.relativeProbability ?? 0), 0) || 1

      for (const h of group.harvestables ?? []) {
        const harvestPath = resolveRef(h.harvestable?._RecordPath_ || h.harvestable, extractedDataRoot)
        const clusterPath = resolveRef(h.clustering?._RecordPath_ || h.clustering, extractedDataRoot)
        if (!harvestPath || !clusterPath) continue

        const presetBasename = basename(harvestPath, '.json')
        const oreName = oreFromPresetBasename(presetBasename)
        const depositType = depositTypeFromPreset(presetBasename)
        if (!oreName || !depositType || oreSignatures[oreName] == null) continue

        const clusterFile = readJson(clusterPath)
        const clusterKey = clusterFile?._RecordName_
        const clusterPreset = clusterKey ? clusterPresets.get(clusterKey) || clusterFile : clusterFile
        const baseSignature = oreSignatures[oreName]
        const { maxNodes, rows, clusterPresetKey, probabilityOfClustering } = buildClusterRows(
          clusterPreset,
          baseSignature
        )

        const relWeight = h.relativeProbability ?? 0
        const poolSharePercent = Math.round((relWeight / poolSum) * 10000) / 100
        const effectiveSpawnPercent = Math.round(((relWeight / poolSum) * groupProb) * 10000) / 10000

        const comp = findCompositionForPreset(presetBasename, presetCompositionMap)
        const spawnMeta = presetSpawnMetaMap.get(presetBasename)

        rawLinks.push({
          oreName,
          locationName: spawnKey,
          spawnKey,
          displayName: resolved.displayName,
          guideName: resolved.guideName ?? matchGuideLocation(spawnKey, locationIndex, locationAliases),
          hppKey,
          system,
          depositType,
          groupName: group.groupName,
          groupSpawnPercent: groupProb,
          relativeSpawnWeight: relWeight,
          poolSharePercent,
          effectiveSpawnPercent,
          harvestablePreset: presetBasename,
          compositionRecordName: comp?.recordName ?? null,
          compositionParts: comp?.parts ?? [],
          clusterPresetKey,
          probabilityOfClustering,
          maxNodes,
          clusterRows: rows,
          scaleRange: spawnMeta?.scaleRange ?? null,
          scannerMassRange: spawnMeta?.scannerMassRange ?? null,
        })
      }
    }
  }

  const inheritedLinks = applyVerifiedHppSpawnInheritance(rawLinks)
  if (inheritedLinks > 0) {
    console.log(`  Applied ${inheritedLinks} verified cross-template HPP spawn inheritance link(s)`)
  }

  const ores = {}
  for (const oreName of signatureOres) {
    ores[oreName] = {
      oreName,
      baseSignature: oreSignatures[oreName],
      depositTypes: [],
      overallByType: {},
      locations: {},
      harvestablePresets: [],
      compositionRecordIds: [],
      clusterPresetKeys: [],
    }
  }

  for (const link of rawLinks) {
    const ore = ores[link.oreName]
    if (!ore) continue

    if (!ore.depositTypes.includes(link.depositType)) ore.depositTypes.push(link.depositType)
    if (!ore.harvestablePresets.includes(link.harvestablePreset)) {
      ore.harvestablePresets.push(link.harvestablePreset)
    }
    if (link.compositionRecordName && !ore.compositionRecordIds.includes(link.compositionRecordName)) {
      ore.compositionRecordIds.push(link.compositionRecordName)
    }
    if (link.clusterPresetKey && !ore.clusterPresetKeys.includes(link.clusterPresetKey)) {
      ore.clusterPresetKeys.push(link.clusterPresetKey)
    }

    const locKey = `${link.locationName}|${link.depositType}`
    const existing = ore.locations[locKey]
    if (!existing || link.effectiveSpawnPercent > existing.effectiveSpawnPercent) {
      ore.locations[locKey] = {
        locationName: link.spawnKey,
        spawnKey: link.spawnKey,
        displayName: link.displayName,
        guideName: link.guideName,
        hppKey: link.hppKey,
        system: link.system,
        depositType: link.depositType,
        groupName: link.groupName,
        groupSpawnPercent: link.groupSpawnPercent,
        relativeSpawnWeight: link.relativeSpawnWeight,
        poolSharePercent: link.poolSharePercent,
        effectiveSpawnPercent: link.effectiveSpawnPercent,
        harvestablePreset: link.harvestablePreset,
        compositionRecordName: link.compositionRecordName,
        compositionParts: link.compositionParts,
        clusterPresetKey: link.clusterPresetKey,
        probabilityOfClustering: link.probabilityOfClustering,
        maxNodes: link.maxNodes,
        clusterRows: link.clusterRows,
        scaleRange: link.scaleRange ?? null,
        scannerMassRange: link.scannerMassRange ?? null,
      }
    }
  }

  for (const ore of Object.values(ores)) {
    ore.depositTypes.sort()
    const locList = Object.values(ore.locations)
    if (ore.depositTypes.includes('surface')) {
      ore.overallByType.surface = buildOverallProfile(
        locList,
        'surface',
        ore.baseSignature,
        locationAliases
      )
    }
    if (ore.depositTypes.includes('asteroid')) {
      ore.overallByType.asteroid = buildOverallProfile(
        locList,
        'asteroid',
        ore.baseSignature,
        locationAliases
      )
    }
    if (locList.length === 0) audit.oresMissingProfile.push(ore.oreName)
  }

  const oreProfiles = Object.values(ores).filter((o) => o.depositTypes.length > 0)

  const aliasAudit = auditAliasCoverage(seenSpawnKeys, locationAliases)
  audit.unmappedSpawnKeys = aliasAudit.unmapped
  audit.rawDisplayNames = aliasAudit.rawDisplayNames

  console.log(`  Parsed ${rawLinks.length} HPP spawn links for ${oreProfiles.length} signature ores`)
  if (audit.unmappedSpawnKeys.length) {
    console.log(`  ⚠ ${audit.unmappedSpawnKeys.length} spawn keys missing locationAliases entries`)
  }
  if (audit.oresMissingProfile.length) {
    console.log(`  ⚠ ${audit.oresMissingProfile.length} signature ores with no HPP links`)
  }

  return {
    clusterPresets: Object.fromEntries(
      [...clusterPresets.entries()].map(([k, v]) => [
        k,
        {
          probabilityOfClustering: v._RecordValue_?.probabilityOfClustering,
          sizes: (v._RecordValue_?.clusterParamsArray ?? []).map((p) => ({
            min: p.minSize,
            max: p.maxSize,
            relativeProbability: p.relativeProbability,
          })),
        },
      ])
    ),
    ores: Object.fromEntries(oreProfiles.map((o) => [o.oreName, o])),
    audit,
    summary: {
      signatureOres: signatureOres.length,
      oresWithProfiles: oreProfiles.length,
      totalSpawnLinks: rawLinks.length,
      totalLocationProfiles: oreProfiles.reduce((s, o) => s + Object.keys(o.locations).length, 0),
    },
  }
}
