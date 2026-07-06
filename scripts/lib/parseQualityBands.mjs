/**
 * Parse crafting quality bands from full DCB record folders (replaces StarBreaker query files).
 */

import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const QUANTIZATION_DIR = 'libs/foundry/records/crafting/qualityquantization'
const DISTRIBUTION_DIR = 'libs/foundry/records/crafting/qualitydistribution'

/** Preserves query-file key order for stable game-quality-bands.json output. */
const QUANTIZATION_KEY_ORDER = [
  'carinite', 'taranite', 'titanium', 'lindinium', 'copper', 'janalite', 'jaclium', 'agricium',
  'savrilium', 'borase', 'torite', 'glacosite', 'dolivine', 'iron', 'ouratite', 'tin', 'silicon',
  'bexalite', 'corundum', 'aslarite', 'gold', 'aluminum', 'stileron', 'beradom', 'quartz',
  'saldynium', 'hadanite', 'hephaestanite', 'beryl', 'aphorite', 'laranite', 'tungsten', 'rawice',
  'sadaryx', 'quantainium', 'riccite', 'feynmaline',
]

/** Preserves last-wins semantics previously implied by query file record order. */
const DISTRIBUTION_RECORD_ORDER = [
  'CraftingQualityDistributionRecord.CommonShipMineable_QualityDistribution_Default',
  'CraftingQualityDistributionRecord.GroundMineable_QualityDistribution_Default',
  'CraftingQualityDistributionRecord.Creature_QualityDistribution_Default',
  'CraftingQualityDistributionRecord.Gatherable_QualityDistribution_Default',
  'CraftingQualityDistributionRecord.FPSMineable_QualityDistribution_Default',
  'CraftingQualityDistributionRecord.UncommonShipMineable_QualityDistribution_Default',
  'CraftingQualityDistributionRecord.LegendaryShipMineable_QualityDistribution_Default',
  'CraftingQualityDistributionRecord.EpicShipMineable_QualityDistribution_Default',
  'CraftingQualityDistributionRecord.RareShipMineable_QualityDistribution_Default',
  'CraftingQualityDistributionRecord.FPSMineable_QualityDistribution_Carinite',
]

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return null
  }
}

function walkJsonFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) walkJsonFiles(fullPath, acc)
    else if (entry.name.endsWith('.json')) acc.push(fullPath)
  }
  return acc
}

function parseQuantizationRecord(record) {
  const match = record._RecordName_?.match(/Quantization_(\w+)$/)
  if (!match) return null

  const resourceName = match[1].toLowerCase()
  if (resourceName === 'template') return null

  const quantization = record._RecordValue_?.qualityQuantization
  if (!quantization?.bands) return null

  const bandValues = quantization.bands.map((b) => b.mappedValue)

  return {
    key: resourceName,
    value: {
      name: match[1],
      bands: quantization.bands.map((b) => ({
        start: b.start,
        end: b.end,
        mappedValue: b.mappedValue,
      })),
      thresholds: bandValues,
    },
  }
}

function parseDistributionRecord(record) {
  if (record._RecordValue_?._Type_ !== 'CraftingQualityDistributionRecord') return null

  const match = record._RecordName_?.match(/QualityDistribution_(\w+)$/)
  if (!match) return null

  const typeName = match[1].toLowerCase()
  const dist = record._RecordValue_?.qualityDistribution
  if (!dist) return null

  return {
    key: typeName,
    value: {
      name: match[1],
      type: dist._Type_,
      min: dist.min,
      max: dist.max,
      mean: dist.mean,
      stddev: dist.stddev,
    },
  }
}

export function parseQualityBands(extractedDataRoot) {
  console.log('\n  Parsing quality quantization bands...')

  const bandsByKey = {}
  const quantDir = join(extractedDataRoot, QUANTIZATION_DIR)
  const quantFiles = walkJsonFiles(quantDir)

  if (quantFiles.length === 0) {
    console.log(`  Quality quantization path not found: ${QUANTIZATION_DIR}`)
    return { bands: {}, distribution: {} }
  }

  for (const file of quantFiles) {
    const record = readJson(file)
    if (!record) continue
    const parsed = parseQuantizationRecord(record)
    if (parsed) bandsByKey[parsed.key] = parsed.value
  }

  const bands = {}
  const knownBandKeys = new Set(QUANTIZATION_KEY_ORDER)
  for (const key of QUANTIZATION_KEY_ORDER) {
    if (bandsByKey[key]) bands[key] = bandsByKey[key]
  }
  for (const key of Object.keys(bandsByKey).sort()) {
    if (!knownBandKeys.has(key)) bands[key] = bandsByKey[key]
  }

  console.log(`  Parsed ${Object.keys(bands).length} resource quality bands`)

  const distribution = {}
  const distDir = join(extractedDataRoot, DISTRIBUTION_DIR)
  const distByRecordName = new Map()

  for (const file of walkJsonFiles(distDir)) {
    const record = readJson(file)
    if (!record?._RecordName_) continue
    distByRecordName.set(record._RecordName_, record)
  }

  for (const recordName of DISTRIBUTION_RECORD_ORDER) {
    const record = distByRecordName.get(recordName)
    if (!record) continue
    const parsed = parseDistributionRecord(record)
    if (parsed) distribution[parsed.key] = parsed.value
  }

  console.log(`  Parsed ${Object.keys(distribution).length} quality distributions`)

  return { bands, distribution }
}
