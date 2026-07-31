#!/usr/bin/env node
/**
 * Parse extracted Star Citizen game data and generate app data files.
 * 
 * This script reads JSON files from the extracted-data/ folder (created by
 * extract-game-data.ps1) and generates the JSON data files used by the app.
 * 
 * Run after: .\scripts\extract-game-data.ps1
 * Output: src/data/*.json files
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'
import { extractAllGameLore } from './lib/gameLore.mjs'
import { buildBlueprintNameLookup, saveBlueprintNameLookup } from './lib/blueprintNameLookup.mjs'
import { HATHOR_PAF_OLP_MARKERS } from './lib/hathorPafSites.mjs'
import { parseMiningSpawns } from './lib/parseMiningSpawns.mjs'
import { mergeSpawnOreLocations, rebuildRarityTiers } from './lib/mergeSpawnOreLocations.mjs'
import { parseOreSignatures } from './lib/parseOreSignatures.mjs'
import {
  buildGuideToSpawnKeys,
  buildLocationAliases,
  parseLocationDescKey,
  REDUNDANT_SUBSITE_GUIDE_LOCATIONS,
  SPAWN_CODE_GUIDE_NAMES,
} from './lib/miningLocationAliases.mjs'
import {
  enrichContractStandingFields,
  extractContractReputationPrerequisite,
  resolveScopeDisplayName,
  getPreferredDisplayScopeKey,
} from './lib/reputationStandingResolver.mjs'
import {
  buildOreMasterList,
  parseCompendiumOreNames,
  consolidateMiningLocationData,
} from './lib/miningOreCanonical.mjs'
import {
  isHandMineableOre,
  isHandMineableType,
  normalizeCompendiumOreName,
  normalizeMineableLabel,
  parseHandMineableHabitatRaw,
  preferredGuideNameForSpawnKey,
} from './lib/miningOreNames.mjs'
import { mergeHppMineableLocations } from './lib/mergeHppMineableLocations.mjs'
import { assignOreRarity } from './lib/miningOreRarity.mjs'
import { loadHppProviderPresets } from './lib/hppProviderPresets.mjs'
import {
  buildEntityClassPathIndex,
  buildRecordBasenameIndex,
  extractEntityBaseStats,
  resolveEntityFile,
} from './lib/entityBaseStats.mjs'
import {
  BLUEPRINT_MISSION_TRACKING_EXCLUSIONS,
  REWARD_POOL_TRACKING_EXCLUSIONS,
  REDWIND_BRIDGE,
} from './lib/orphanPoolBridges.mjs'
import { buildReputationStandingCache } from './lib/reputationCache.mjs'
import {
  buildContractRepRewardAmounts,
  buildReputationRewardAmounts,
} from './lib/repRewardCache.mjs'
import { parseQualityBands } from './lib/parseQualityBands.mjs'
import { parseMissionBrokerData } from './lib/parseMissionBroker.mjs'
import { readGameBuildInfo } from './lib/gameBuildVersion.mjs'
import { parseWikeloTrades } from './lib/wikeloTrades.mjs'
import { clearAppliedSpellingCorrections } from './lib/spellingCorrections.mjs'
import { writeWhatsNewDigest } from './lib/writeWhatsNewDigest.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const EXTRACTED_DATA = join(PROJECT_ROOT, 'extracted-data')
const OUTPUT_DIR = join(PROJECT_ROOT, 'src', 'data')

// Expected paths for validation - if these change, game data structure changed
const EXPECTED_PATHS = {
  blueprints: 'libs/foundry/records/crafting/blueprints/crafting',
  blueprintRewards: 'libs/foundry/records/crafting/blueprintrewards',
  mineableElements: 'libs/foundry/records/mining/mineableelements',
  scitems: 'libs/foundry/records/entities/scitem',
  reputation: 'libs/foundry/records/reputation/standings',
  missionBroker: 'libs/foundry/records/missionbroker',
  qualityQuantization: 'libs/foundry/records/crafting/qualityquantization',
  qualityDistribution: 'libs/foundry/records/crafting/qualitydistribution',
  fpsWeapons: 'libs/foundry/records/entities/scitem/weapons/fps_weapons',
  contractGenerators: 'libs/foundry/records/contracts/contractgenerator',
  contractScenarios: 'libs/foundry/records/contracts/contractscenarios',
  missionLocality: 'libs/foundry/records/missiondata/pu_missionlocality',
  reputationRewards: 'libs/foundry/records/reputation/rewards',
  factionReputation: 'libs/foundry/records/factions/factionreputation',
}

/** Present in full DCB extract but not parsed by this app — informational only. */
const OPTIONAL_PATHS = {
  resourceTypes: 'libs/foundry/records/resourcetypedatabase',
  commodities: 'libs/foundry/records/entities/commodities',
}

// Localization path (extracted separately from Data.p4k)
const LOCALIZATION_PATH = 'Data/Localization/english'

// Track validation issues
const validationIssues = []

// ============================================================================
// UTILITIES
// ============================================================================

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch (e) {
    console.warn(`  Warning: Could not read ${filePath}: ${e.message}`)
    return null
  }
}

function findJsonFiles(basePath, pattern = '**/*.json') {
  const fullPath = join(EXTRACTED_DATA, basePath)
  if (!existsSync(fullPath)) {
    validationIssues.push(`Missing expected path: ${basePath}`)
    return []
  }
  
  const files = []
  function walk(dir) {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullEntryPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullEntryPath)
      } else if (entry.name.endsWith('.json')) {
        files.push(fullEntryPath)
      }
    }
  }
  walk(fullPath)
  return files
}

function extractRecordName(json) {
  return json?._RecordName_ || json?.name || 'unknown'
}

function saveJson(filename, data) {
  const outputPath = join(OUTPUT_DIR, filename)
  writeFileSync(outputPath, JSON.stringify(data, null, 2))
  console.log(`  ✓ Saved ${filename}`)
}

/**
 * Resolve a localization key to its display name
 * Keys look like @item_NameCOOL_ACOM_S01_IcePlunge
 */
function resolveLocalization(key, localization) {
  if (!key) return null
  
  // If it's a localization key (starts with @), look it up
  if (key.startsWith('@')) {
    const lookupKey = key.substring(1) // Remove @
    if (localization[lookupKey]) {
      return localization[lookupKey]
    }
    // Try common variations
    const variations = [
      lookupKey,
      lookupKey.toLowerCase(),
      lookupKey.replace(/_/g, ''),
      `item_Name${lookupKey}`,
      `item_name${lookupKey}`
    ]
    for (const v of variations) {
      if (localization[v]) return localization[v]
    }
  }
  
  // Return the key as-is if not a localization key or not found
  return key
}

/**
 * Authoritative crafted-item display name: read the SCItem's own
 * AttachDef.Localization.Name and resolve it via localization. Returns null when
 * the entity record is missing or carries only a placeholder name, so callers can
 * fall back to heuristic name derivation.
 */
function resolveEntityDisplayName(entityClass, entityPathIndex, localization) {
  if (!entityClass) return null
  const entityFile = resolveEntityFile(entityClass, entityPathIndex)
  const entityJson = entityFile ? readJson(entityFile) : null
  const attachComp = (entityJson?._RecordValue_?.Components ?? []).find(
    (comp) => comp?._Type_ === 'SAttachableComponentParams'
  )
  const nameKey = attachComp?.AttachDef?.Localization?.Name
  if (!nameKey || nameKey === '@LOC_PLACEHOLDER' || nameKey === '@LOC_EMPTY' || nameKey === '@LOC_UNINITIALIZED') {
    return null
  }
  const resolved = resolveLocalization(nameKey, localization)
  if (!resolved || resolved.startsWith('@')) return null
  return resolved
}

const FACTION_NAME_OVERRIDES = {
  foxwell: 'Foxwell Enforcement',
  bountyhuntersguild: 'Bounty Hunters Guild',
  bhg: 'Bounty Hunters Guild',
  shubin: 'Shubin Interstellar',
  eckhart: 'Eckhart Security',
  covalex: 'Covalex',
  ftl: 'FTL Courier',
  rayari: 'Rayari Incorporated',
  headhunters: 'Headhunters',
  vaughn: 'Vaughn',
  ninetails: 'Nine Tails',
  bitzero: 'Bit Zeros',
  deadsaint: 'Dead Saints',
  citizensforprosperity: 'Citizens For Prosperity',
  cfp: 'Citizens For Prosperity',
  adagio: 'Adagio Holdings',
  ling: 'Ling Family Hauling',
  northrock: 'Northrock Service Group',
  intersec: 'InterSec Defense Solutions',
  unitedwayfarers: 'United Wayfarers Club',
  hockrowagency: 'Hockrow Agency',
  hockrow: 'Hockrow Agency',
  thecollector: 'Wikelo Emporium',
  wikelo: 'Wikelo Emporium',
  collectorwikelo: 'Wikelo Emporium',
  highpointwildernessspecialists: 'Highpoint Wilderness Specialists',
  highpoint: 'Highpoint Wilderness Specialists',
}

function isUnresolvedDisplayName(name) {
  if (!name || typeof name !== 'string') return true
  const trimmed = name.trim()
  return (
    trimmed.length === 0 ||
    trimmed.startsWith('@') ||
    trimmed.includes('PLACEHOLDER') ||
    trimmed.includes('UNINITIALIZED')
  )
}

function humanizeFactionKey(factionKey) {
  return String(factionKey || '')
    .replace(/^factionreputation[._]/i, '')
    .replace(/^lawful_/i, '')
    .replace(/^unlawful_/i, '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

function inferFactionDisplayName(factionKey, hints = '') {
  const combined = `${factionKey} ${hints}`.toLowerCase()
  for (const [pattern, name] of Object.entries(FACTION_NAME_OVERRIDES)) {
    if (combined.includes(pattern)) return name
  }
  return humanizeFactionKey(factionKey)
}

function resolveFactionDisplayName({ rawName, factionKey, recordName, hints = '' }) {
  if (!isUnresolvedDisplayName(rawName)) return rawName
  const inferred = inferFactionDisplayName(factionKey || recordName || '', hints)
  if (!isUnresolvedDisplayName(inferred)) return inferred
  return humanizeFactionKey(recordName || factionKey || 'Unknown')
}

const NYX_LOCATION_MARKERS = ['levski', 'rockcracker', 'keeger', 'claw salamander']
const STANTON_LOCATION_MARKERS = [
  'asdfacility',
  'onyxfacility',
  'microtech',
  'hurston',
  'crusader',
  'arccorp',
  'delamar',
  'stantonstar',
  ...HATHOR_PAF_OLP_MARKERS,
]

/** BHG bounty at Planetary Alignment Facility sites (Hathor mission line). */
const BHG_PAF_DISPLAY_TITLE = 'Verified Bounty · Hathor · Planetary Alignment Facility'

const BHG_NYX_DIFFICULTY_LABELS = {
  rehire: 'Rehire',
  veryeasy: 'Very Easy',
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  veryhard: 'Very Hard',
  super: 'Super',
}

function inferSystemFromContractSignals(contractSignals) {
  const lower = contractSignals.toLowerCase()

  if (NYX_LOCATION_MARKERS.some((marker) => lower.includes(marker))) {
    return 'Nyx'
  }
  if (STANTON_LOCATION_MARKERS.some((marker) => lower.includes(marker))) {
    return 'Stanton'
  }

  if (lower.includes('pyronyx') || lower.includes('nyx/stanton') || lower.includes('pyro/stanton')) {
    return 'Pyro'
  }

  if (/_stanton(?:_|$|\d|\s)/.test(lower) || /(?:^|_)stanton$/.test(lower)) {
    return 'Stanton'
  }
  if (/_pyro(?:_|$|\d|\s)/.test(lower) || /(?:^|_)pyro$/.test(lower)) {
    return 'Pyro'
  }
  if (/_nyx(?:_|$|\d|\s)/.test(lower) || /(?:^|_)nyx$/.test(lower)) {
    return 'Nyx'
  }
  if (/_nyx\//.test(lower)) {
    return 'Nyx'
  }

  if (lower.includes('vaughn') && /region[a-d]/.test(lower)) {
    return 'Pyro'
  }

  // Stanton-based operators whose contract signals carry no explicit system.
  if (lower.includes('rayari')) return 'Stanton'
  if (lower.includes('superheavy') || lower.includes('soo2') || lower.includes('northrock')) return 'Stanton'

  return null
}

function humanizeContractDebugName(debugName) {
  if (!debugName) return 'Unknown Mission'
  return debugName
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase()
      if (lower === 'bhg') return 'BHG'
      if (lower === 'nyx') return 'Nyx'
      if (lower === 'paf') return 'Planetary Alignment Facility'
      if (lower === 'olp') return 'Orbital Laser Platform'
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

function stripMissionTemplatePlaceholders(title) {
  if (!title) return ''
  return title
    .replace(/~mission\s*\([^)]*\)/gi, '')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/\s*:\s*(\s|$)/g, ': ')
    .replace(/\s+/g, ' ')
    .replace(/\s+at\s*$/i, '')
    .trim()
}

/**
 * Recover a mission's intent from an unresolved `~mission(Namespace|SomeTitle)`
 * token, e.g. `~mission(Contractor|RecoverItemTitle)` -> "Recover Item".
 */
function extractMissionTokenIntent(raw) {
  const match = (raw || '').match(/~mission\s*\(([^)]*)\)/i)
  if (!match) return null
  let inner = match[1].split('|').pop() ?? ''
  inner = inner.replace(/Title.*$/i, '')
  inner = inner.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').trim()
  if (inner.length < 3) return null
  return inner.charAt(0).toUpperCase() + inner.slice(1)
}

/** Normalize missiontype/pu/*.json basename → mobiGlas MissionType label. */
function formatMissionTypeLabel(rawSlug) {
  if (!rawSlug) return null
  let catName = String(rawSlug).replace(/_/g, ' ')
  catName = catName
    // MissionType.BountyHunter → "Bounty Hunter" (NOT the BHG contractor faction)
    .replace(/bountyhunter/i, 'Bounty Hunter')
    .replace(/shipmining/i, 'Ship Mining')
    .replace(/groundmining/i, 'Ground Vehicle Mining')
    .replace(/fpsmining/i, 'Hand Mining')
    .replace(/hauling interstellar/i, 'Hauling Interstellar')
    .replace(/hauling local/i, 'Hauling Local')
    .replace(/hauling planetary/i, 'Hauling Planetary')
    .replace(/hauling solar/i, 'Hauling Solar')
    .replace(/combat support/i, 'Combat Support')
    .replace(/search.?rescue/i, 'Search & Rescue')
    .replace(/security escort/i, 'Security Escort')
    .replace(/cargo recovery/i, 'Cargo Recovery')
    .replace(/wikelo smallitems/i, 'Wikelo Small Items')
    .replace(/wikelo ships/i, 'Wikelo Ships')
  if (!/[A-Z]/.test(catName)) {
    catName = catName.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }
  return catName
}

function extractMissionTypeSlugFromPath(filePath) {
  if (!filePath) return null
  const match = String(filePath).match(/missiontype\/pu\/([^/\\]+)\.json$/i)
  return match ? match[1] : null
}

/**
 * Resolve mobiGlas MissionType category (Bounty Hunter, Mercenary, …).
 *
 * Source of truth: missionTypeOverride / missiontype/pu/*.json only.
 * Never use title/description/localization text — contractors like Bounty Hunters
 * Guild offer multiple MissionTypes (e.g. Bounty Hunter), and text is unreliable.
 * Bounty Hunters Guild is the faction/contractor, not a MissionType label.
 */
function resolveMissionMenuCategory({
  missionTypeFile,
  generatorFile = '',
  generatorDebugName = '',
  generatorType = '',
  templatePath = '',
  debugName = '',
  poolKeys = '',
}) {
  const fromOverride = extractMissionTypeSlugFromPath(missionTypeFile)
  if (fromOverride) return formatMissionTypeLabel(fromOverride)

  const fromTemplate = extractMissionTypeSlugFromPath(templatePath)
  if (fromTemplate) return formatMissionTypeLabel(fromTemplate)

  // Structural fallbacks only (paths / record filenames) — never mission copy.
  const blob = [generatorFile, generatorDebugName, generatorType, poolKeys, debugName, templatePath]
    .join(' ')
    .toLowerCase()
    .replace(/\\/g, '/')

  const embeddedType = blob.match(/missiontype\/pu\/([a-z0-9_]+)/i)
  if (embeddedType) return formatMissionTypeLabel(embeddedType[1])

  // Generator folder careers (not contractor names like bountyhunterguild).
  if (blob.includes('shipmining') || blob.includes('ship_mining')) return 'Ship Mining'
  if (blob.includes('groundmining') || blob.includes('ground_mining')) return 'Ground Vehicle Mining'
  if (blob.includes('fpsmining') || blob.includes('handmin')) return 'Hand Mining'
  if (blob.includes('hauling_interstellar') || blob.includes('hauling interstellar')) {
    return 'Hauling Interstellar'
  }
  if (blob.includes('hauling')) return 'Hauling'
  if (blob.includes('/investigation') || blob.includes('missiontype/pu/investigation')) {
    return 'Investigation'
  }
  if (blob.includes('salvage')) return 'Salvage'
  if (blob.includes('collection') || blob.includes('missiontype/pu/collection')) return 'Collection'
  // BHG generators live under mercenary_guild/ but use MissionType.BountyHunter —
  // never infer Mercenary from that folder alone.
  const underBhgContractor =
    blob.includes('bountyhunterguild') || blob.includes('bountyhuntersguild')
  if (
    !underBhgContractor &&
    (blob.includes('mercenary_guild') ||
      blob.includes('/mercenary/') ||
      blob.includes('missiontype/pu/mercenary'))
  ) {
    return 'Mercenary'
  }

  return null
}

function resolveContractDisplayTitle({ title, titleKey, debugName, localization, category, system }) {
  const debugLower = (debugName || '').toLowerCase()
  const titleLower = (title || '').toLowerCase()

  const nyxBhgMatch = debugName?.match(/^BountyHuntersGuild_Bounty_Nyx_(.+)$/i)
  if (nyxBhgMatch) {
    const suffix = nyxBhgMatch[1]
    const suffixLower = suffix.toLowerCase()
    const diffLabel =
      BHG_NYX_DIFFICULTY_LABELS[suffixLower] ||
      humanizeContractDebugName(suffix)

    const locCandidates = [
      debugName,
      `bhg_bounty_nyx_${suffixLower}`,
      `BountyHuntersGuild_Bounty_Nyx_${suffix}`,
      titleKey?.startsWith('@') ? titleKey.slice(1) : titleKey,
    ].filter(Boolean)

    for (const key of locCandidates) {
      const loc = localization[key]
      if (loc && !loc.includes('~mission') && !isUnresolvedDisplayName(loc)) {
        return loc.trim()
      }
    }
    return `Nyx Bounty · ${diffLabel}`
  }

  if (debugLower.includes('asdfacilitydelv')) {
    if (debugLower.includes('researchwing')) return 'Verified Bounty · ASD Research Wing'
    if (debugLower.includes('engineeringwing')) return 'Verified Bounty · ASD Engineering Wing'
    return 'Verified Bounty · ASD Facility'
  }

  // Only BHG Rockcracker bounties use the Verified Bounty title — Vaughn/HH/CFP
  // share the Rockcracker location under Unverified (or other) contractors.
  const isBhgRockcracker =
    (debugLower.includes('bhg_') || debugLower.includes('bountyhuntersguild')) &&
    (debugLower.includes('rockcracker') || titleLower.includes('qv breaker station'))
  if (isBhgRockcracker) {
    if (titleLower.includes('high-risk')) return 'High-Risk Bounty · QV Breaker Station'
    return 'Verified Bounty · QV Breaker Station'
  }

  if (debugLower.includes('bountyhuntersguild_paf') || (debugLower.includes('_paf_') && debugLower.includes('bounty'))) {
    return BHG_PAF_DISPLAY_TITLE
  }

  if (title?.includes('~mission')) {
    const cleaned = stripMissionTemplatePlaceholders(title).replace(/:\s*$/, '').trim()
    if (cleaned.length >= 3 && !/^verified bounty:?$/i.test(cleaned) && !cleaned.includes('~mission')) {
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
    }
    // Nothing usable survived stripping (pure token) — recover intent, then
    // fall back to localization / humanized debugName below.
    const tokenIntent = extractMissionTokenIntent(title)
    if (tokenIntent) return tokenIntent
  }

  if (!title || title === debugName || isUnresolvedDisplayName(title)) {
    if (titleKey?.startsWith('@')) {
      const loc = localization[titleKey.slice(1)]
      if (loc && !loc.includes('~mission') && !isUnresolvedDisplayName(loc)) {
        return loc.trim()
      }
    }
    return humanizeContractDebugName(debugName)
  }

  return title.trim()
}

/**
 * Resolve item internal filename to display name using localization
 * Examples:
 *   harvestable_mineral_1h_sadaryx -> "Sadaryx" (via items_commodities_sadaryx)
 *   harvestable_ore_1h_saldyniumore -> "Saldynium" (via items_commodities_saldynium)
 *   harvestable_trophy_1h_yormandi_eye -> "Yormandi Eye" (via items_commodities_yormandi or fallback)
 */
function resolveItemDisplayName(itemName, localization) {
  if (!itemName || !localization) return null

  // Extract the material name from the filename
  // Patterns: harvestable_mineral_1h_<name>, harvestable_ore_1h_<name>ore, harvestable_trophy_1h_<name>
  let baseName = itemName
    .replace(/^harvestable_(mineral|ore|trophy)_\d+h_/i, '')
    .replace(/ore$/i, '')  // Remove trailing "ore" from saldyniumore -> saldynium
    .replace(/_/g, ' ')    // yormandi_eye -> yormandi eye

  // Try common localization patterns
  const keysToTry = [
    `items_commodities_${baseName.replace(/ /g, '')}`,  // yormandi eye -> items_commodities_yormandieye
    `items_commodities_${baseName.split(' ')[0]}`,      // Try just first word: yormandi
    `item_Name${baseName}`,
    `item_Name_${itemName}`,
  ]

  for (const key of keysToTry) {
    if (localization[key]) {
      return localization[key]
    }
    // Try lowercase
    if (localization[key.toLowerCase()]) {
      return localization[key.toLowerCase()]
    }
  }

  // Fallback: Title case the base name
  return baseName
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Extract manufacturer code from file path and resolve to display name
 * Path looks like: file://./../../../libs/foundry/records/scitemmanufacturer/scitemmanufacturer.acom.json
 */
function resolveManufacturer(manufacturerPath, localization) {
  if (!manufacturerPath) return { code: null, name: null }
  
  // Extract code from path
  const match = manufacturerPath.match(/scitemmanufacturer\.(\w+)\.json/i)
  if (!match) return { code: null, name: manufacturerPath }
  
  const code = match[1].toUpperCase()
  
  // Look up in localization
  const nameKey = `manufacturer_Name${code}`
  const displayName = localization[nameKey] || code
  
  return {
    code: code,
    name: displayName
  }
}

/**
 * Build a manufacturer lookup map from localization
 */
function buildManufacturerMap(localization) {
  const manufacturers = {}
  
  for (const [key, value] of Object.entries(localization)) {
    const match = key.match(/^manufacturer_Name(\w+)$/i)
    if (match) {
      const code = match[1].toUpperCase()
      manufacturers[code] = {
        code: code,
        name: value,
        descKey: `manufacturer_Desc${match[1]}`
      }
    }
  }
  
  console.log(`  Built manufacturer lookup with ${Object.keys(manufacturers).length} entries`)
  return manufacturers
}

// ============================================================================
// LOCALIZATION PARSING (for lore/descriptions)
// ============================================================================

function parseLocalization() {
  console.log('\n[0/7] Parsing localization files for lore descriptions...')
  
  const locPath = join(EXTRACTED_DATA, LOCALIZATION_PATH)
  const globalIniPath = join(locPath, 'global.ini')
  
  if (!existsSync(globalIniPath)) {
    console.log('  Localization files not found - run extract-game-data.ps1 to extract them')
    console.log('  Skipping lore extraction...')
    return {}
  }
  
  const content = readFileSync(globalIniPath, 'utf-8')
  const lines = content.split('\n')
  
  const localization = {}
  let descCount = 0
  
  for (const line of lines) {
    if (!line.includes('=')) continue
    
    const eqIndex = line.indexOf('=')
    const key = line.substring(0, eqIndex).trim()
    const value = line.substring(eqIndex + 1).trim()
    
    // Store all localization, but track description keys specifically
    localization[key] = value
    
    // Also store without trailing tags like ,P ,M etc (platform/variant tags)
    if (key.includes(',')) {
      const baseKey = key.split(',')[0]
      if (!localization[baseKey]) {
        localization[baseKey] = value
      }
    }
    
    if (key.includes('_desc') || key.includes('_Desc') || key.includes('Description')) {
      descCount++
    }
  }
  
  console.log(`  Loaded ${Object.keys(localization).length} localization strings`)
  console.log(`  Found ${descCount} description entries`)
  
  // Build a case-insensitive lookup map (lowercase key -> original value)
  // This allows us to find "item_Name_RADR_CHCO_S00_BroadSpecGo" even if we search for lowercase
  const locLowerMap = {}
  for (const [key, value] of Object.entries(localization)) {
    locLowerMap[key.toLowerCase()] = value
  }
  localization._lowerMap = locLowerMap
  
  return localization
}

function extractResourceLore(localization) {
  console.log('  Extracting game lore (commodities + item descriptions)...')
  const lore = extractAllGameLore(localization)

  const commodityCount = Object.values(lore).filter((entry) => entry.kind === 'commodity').length
  const itemCount = Object.values(lore).filter((entry) => entry.kind === 'item').length
  console.log(`  Extracted ${Object.keys(lore).length} lore descriptions (${commodityCount} commodities, ${itemCount} items)`)

  const spotCheckKeys = [
    'hephaestanite',
    'torite',
    'distilled_spirits',
    'osoian_hides',
    'rmc',
    'hydrogen_fuel',
    'quantum_fuel',
  ]
  const missing = spotCheckKeys.filter((key) => !lore[key])
  if (missing.length > 0) {
    console.warn(`  ⚠ Missing expected commodity lore keys: ${missing.join(', ')}`)
  }

  return lore
}

// ============================================================================
// MINING LOCATION PARSING (from localization)
// ============================================================================

function parseMiningLocations(localization, hppPresets = null) {
  console.log('\n  Parsing mining locations from localization...')

  const compendiumKey = 'Journal_General_Mining_Compendium_Content'
  const compendiumText = localization[compendiumKey] ?? ''
  const oreMasterList = buildOreMasterList(parseCompendiumOreNames(compendiumText))
  console.log(`  Ore master list: ${oreMasterList.size} canonical names (compendium + tiers)`)
  
  const oreLocations = {}      // ore -> locations[]
  const locationOres = {}      // location -> ores[]
  const locationMineables = {} // location -> { shipMineables, handMineables, groundVehicleMineables, harvestables }
  /** ore -> guide location -> surface | caves | both (from per-body localization desc) */
  const handMineableHabitats = {}

  function recordHandMineableHabitat(rawItem, guideLoc) {
    const ore = normalizeMineableLabel(rawItem, oreMasterList)
    if (!isHandMineableOre(ore)) return
    if (!handMineableHabitats[ore]) handMineableHabitats[ore] = {}
    handMineableHabitats[ore][guideLoc] = parseHandMineableHabitatRaw(rawItem)
  }
  
  function mergeHandMineableSiteLocations() {
    for (const [guideLoc, mineables] of Object.entries(locationMineables)) {
      const oreLabels = [
        ...(mineables.handMineables ?? []),
        ...(mineables.groundVehicleMineables ?? []),
      ]
      for (const rawLabel of oreLabels) {
        const ore = normalizeMineableLabel(rawLabel, oreMasterList)
        if (!isHandMineableType(ore)) continue

        if (!oreLocations[ore]) oreLocations[ore] = []
        if (!oreLocations[ore].includes(guideLoc)) {
          oreLocations[ore].push(guideLoc)
        }

        if (!locationOres[guideLoc]) locationOres[guideLoc] = []
        const existing = locationOres[guideLoc].find((entry) => entry.name === ore)
        if (existing) {
          if (existing.rarity !== 'handMineable') existing.rarity = 'handMineable'
        } else {
          locationOres[guideLoc].push({ name: ore, rarity: 'handMineable' })
        }
      }
    }
  }

  function mergeShipMineableSiteLocations() {
    mergeMineableSiteLocations(['shipMineables'])
  }

  function mergeMineableSiteLocations(fieldNames) {
    for (const [guideLoc, mineables] of Object.entries(locationMineables)) {
      const oreLabels = fieldNames.flatMap((field) => mineables[field] ?? [])
      for (const rawLabel of oreLabels) {
        const ore = normalizeMineableLabel(rawLabel, oreMasterList)
        if (!oreLocations[ore]) oreLocations[ore] = []
        if (!oreLocations[ore].includes(guideLoc)) {
          oreLocations[ore].push(guideLoc)
        }

        if (!locationOres[guideLoc]) locationOres[guideLoc] = []
        const existing = locationOres[guideLoc].find((entry) => entry.name === ore)
        const rarity = assignOreRarity(ore)
        if (existing) {
          if (rarity === 'handMineable') existing.rarity = 'handMineable'
        } else {
          locationOres[guideLoc].push({ name: ore, rarity })
        }
      }
    }
  }
  
  // Parse the Mining Compendium for comprehensive ore-location mappings
  if (compendiumText) {
    const compendium = compendiumText
    
    // Parse lines like: "Agricium - ARC-L3, Cellin, CRU-L5, Daymar..."
    const lines = compendium.split('\\n')
    for (const line of lines) {
      const match = line.match(/^([A-Za-z]+)\s*-\s*(.+)$/i)
      if (match) {
        const ore = normalizeCompendiumOreName(match[1].trim(), oreMasterList)
        const locations = match[2]
          .split(',')
          .map(l => l.trim())
          .filter(l => l.length > 0 && !REDUNDANT_SUBSITE_GUIDE_LOCATIONS.has(l))
        
        if (!oreLocations[ore]) {
          oreLocations[ore] = []
        }
        oreLocations[ore].push(...locations)
        
        // Build reverse mapping
        for (const loc of locations) {
          if (!locationOres[loc]) {
            locationOres[loc] = []
          }
          const rarity = assignOreRarity(ore)
          const existing = locationOres[loc].find((entry) => entry.name === ore)
          if (existing) {
            if (rarity === 'handMineable') existing.rarity = 'handMineable'
          } else {
            locationOres[loc].push({ name: ore, rarity })
          }
        }
      }
    }
    
    console.log(`  Parsed ${Object.keys(oreLocations).length} ores from compendium`)
  }
  
  // Parse location descriptions for structured mineable data
  // Keys like: Pyro1_desc, Stanton1b_Desc, Pyro5c_Adir_desc, etc.
  let locDescCount = 0
  for (const [key, value] of Object.entries(localization)) {
    if (key === '_lowerMap') continue
    if (!/_desc$/i.test(key)) continue
    if (!value.includes('Potential')) continue

    const parsed = parseLocationDescKey(key)
    if (!parsed) continue

    const mineableKey = preferredGuideNameForSpawnKey(
      parsed.spawnKey,
      parsed.guideName ?? SPAWN_CODE_GUIDE_NAMES[parsed.spawnKey] ?? parsed.spawnKey
    )

    const mineables = {
      shipMineables: [],
      groundVehicleMineables: [],
      handMineables: [],
      harvestables: [],
      creatures: []
    }
    
    // Parse sections
    const sections = value.split(/\\n\\n|\\n(?=Potential)/)
    let currentSection = null
    
    for (const section of sections) {
      if (section.includes('Potential Ship Mineable')) {
        currentSection = 'shipMineables'
      } else if (section.includes('Potential Ground Vehicle Mineable')) {
        currentSection = 'groundVehicleMineables'
      } else if (/Hand Mineables/i.test(section)) {
        currentSection = 'handMineables'
      } else if (section.includes('Potential Harvestable')) {
        currentSection = 'harvestables'
      } else if (section.includes('Potential Creature')) {
        currentSection = 'creatures'
      }
      
      if (currentSection) {
        // Extract items from section (line by line after the header)
        const items = section.split('\\n')
          .filter(line => !line.includes('Potential') && line.trim().length > 0)
          .map(line => line.trim().replace(/^\s*-\s*/, ''))
          .filter(item => item.length > 0 && !item.includes(':'))
        
        for (const item of items) {
          if (currentSection === 'handMineables') {
            recordHandMineableHabitat(item, mineableKey)
          }
          mineables[currentSection].push(normalizeMineableLabel(item, oreMasterList))
        }
      }
    }
    
    // Only save if we found mineable data
    const hasData = Object.values(mineables).some(arr => arr.length > 0)
    if (hasData) {
      locationMineables[mineableKey] = {
        ...mineables,
        spawnKey: parsed.spawnKey,
      }
      locDescCount++
    }
  }
  
  console.log(`  Parsed ${locDescCount} locations with mineable details`)
  const habitatEntryCount = Object.values(handMineableHabitats).reduce(
    (n, byLoc) => n + Object.keys(byLoc).length,
    0
  )
  console.log(`  Recorded ${habitatEntryCount} hand-mineable habitat entries (per body)`)

  mergeHandMineableSiteLocations()
  mergeShipMineableSiteLocations()

  const locationAliases = buildLocationAliases(localization, EXTRACTED_DATA)
  console.log(`  Built ${Object.keys(locationAliases).length} location alias entries`)
  const guideToSpawnKeys = buildGuideToSpawnKeys(locationAliases)
  console.log(`  Built ${Object.keys(guideToSpawnKeys).length} guide→spawn key mappings`)

  const hppMineableMerges = mergeHppMineableLocations({
    extractedDataRoot: EXTRACTED_DATA,
    locationAliases,
    oreLocations,
    locationOres,
    locationMineables,
    assignOreRarity,
    hppPresets,
  })
  console.log(`  Merged ${hppMineableMerges} HPP mineable site entries (ship, FPS, ground-vehicle)`)

  const {
    oreLocations: consolidatedOreLocations,
    locationOres: consolidatedLocationOres,
    locationMineables: consolidatedLocationMineables,
    handMineableHabitats: consolidatedHandMineableHabitats,
  } = consolidateMiningLocationData(
    {
      oreLocations,
      locationOres,
      locationMineables,
      handMineableHabitats,
    },
    oreMasterList
  )

  // Build rarity-organized structure
  const byRarity = {
    legendary: [],
    epic: [],
    rare: [],
    uncommon: [],
    common: [],
    handMineable: []
  }
  
  for (const [ore, locations] of Object.entries(consolidatedOreLocations)) {
    const assignedRarity = assignOreRarity(ore)
    const cleaned = [...new Set(locations)].filter((loc) => !REDUNDANT_SUBSITE_GUIDE_LOCATIONS.has(loc))

    byRarity[assignedRarity].push({
      name: ore,
      locations: cleaned,
    })
  }

  for (const loc of REDUNDANT_SUBSITE_GUIDE_LOCATIONS) {
    delete consolidatedLocationOres[loc]
  }
  
  return {
    oreLocations: Object.fromEntries(
      Object.entries(consolidatedOreLocations).map(([ore, locations]) => [
        ore,
        [...new Set(locations)].filter((loc) => !REDUNDANT_SUBSITE_GUIDE_LOCATIONS.has(loc)),
      ])
    ),
    locationOres: consolidatedLocationOres,
    locationMineables: consolidatedLocationMineables,
    handMineableHabitats: consolidatedHandMineableHabitats,
    redundantSubsiteGuideLocations: [...REDUNDANT_SUBSITE_GUIDE_LOCATIONS],
    locationAliases,
    guideToSpawnKeys,
    rarityTiers: byRarity,
    rarityOrder: ['legendary', 'epic', 'rare', 'uncommon', 'common', 'handMineable']
  }
}

// ============================================================================
// ORDNANCE PARSING (from localization)
// ============================================================================

function parseOrdnance(localization) {
  console.log('\n  Parsing ordnance from localization...')
  
  const guidanceMap = {
    'CS': 'Cross-Section',
    'EM': 'Electromagnetic',
    'IR': 'Infrared'
  }
  
  const ordnance = []
  const seen = new Set()
  
  for (const [key, value] of Object.entries(localization)) {
    // Match patterns like:
    // GMISL_S01_CS_FSKI_Spark (gimbal missile)
    // MISL_S01_CS_FSKI_Spark (non-gimbal missile)
    // TORP_S05_CS_BEHR_Name (torpedo)
    const missileMatch = key.match(/^item_Name(G?MISL)_S(\d+)_(\w+)_(\w+)_(\w+?)(_short)?$/i)
    const torpMatch = key.match(/^item_Name(TORP)_S(\d+)_(\w+)_(\w+)_(\w+?)(_short)?$/i)
    
    const match = missileMatch || torpMatch
    if (!match) continue
    
    const [, typePrefix, sizeStr, guidance, manufacturer, name, isShort] = match
    
    // Skip _short variants (duplicates)
    if (isShort) continue
    
    const internalId = key.replace('item_Name', '')
    if (seen.has(internalId)) continue
    seen.add(internalId)
    
    const size = parseInt(sizeStr, 10)
    const isGimbal = typePrefix.toUpperCase() === 'GMISL'
    const isTorpedo = typePrefix.toUpperCase() === 'TORP'
    
    ordnance.push({
      internalId,
      displayName: value,
      guidance: guidanceMap[guidance.toUpperCase()] || guidance,
      guidanceCode: guidance.toUpperCase(),
      size,
      isGimbal,
      isTorpedo,
      type: isTorpedo ? 'Torpedo' : 'Missile',
      manufacturer: manufacturer.toUpperCase(),
      fullLabel: `[${guidance.toUpperCase()}${size}] ${value.replace(' Missile', '').replace(' Torpedo', '')}`
    })
  }
  
  // Sort by size, then guidance, then name
  ordnance.sort((a, b) => {
    if (a.size !== b.size) return a.size - b.size
    if (a.guidanceCode !== b.guidanceCode) return a.guidanceCode.localeCompare(b.guidanceCode)
    return a.displayName.localeCompare(b.displayName)
  })
  
  console.log(`  Parsed ${ordnance.length} ordnance items`)
  
  // Build grouped views
  const ordnanceByGuidance = {}
  const ordnanceBySize = {}
  
  for (const o of ordnance) {
    if (!ordnanceByGuidance[o.guidance]) ordnanceByGuidance[o.guidance] = []
    ordnanceByGuidance[o.guidance].push(o)
    
    if (!ordnanceBySize[o.size]) ordnanceBySize[o.size] = []
    ordnanceBySize[o.size].push(o)
  }
  
  return {
    ordnance,
    ordnanceByGuidance,
    ordnanceBySize,
    metadata: {
      guidanceCodes: guidanceMap,
      sizeRanges: {
        missile: [...new Set(ordnance.filter(o => !o.isTorpedo).map(o => o.size))].sort((a, b) => a - b),
        torpedo: [...new Set(ordnance.filter(o => o.isTorpedo).map(o => o.size))].sort((a, b) => a - b)
      }
    }
  }
}

// Quality band parsing: scripts/lib/parseQualityBands.mjs

// ============================================================================
// FPS WEAPON PARSING
// ============================================================================

function parseFpsWeapons(localization = {}) {
  console.log('\n  Parsing FPS weapons...')
  
  const weaponPath = join(EXTRACTED_DATA, EXPECTED_PATHS.fpsWeapons)
  if (!existsSync(weaponPath)) {
    console.log('  FPS weapons path not found')
    return []
  }
  
  const files = readdirSync(weaponPath).filter(f => f.endsWith('.json') && !f.includes('template'))
  const weapons = []
  
  for (const file of files) {
    // Skip variant/skin files
    if (file.includes('_black') || file.includes('_green') || file.includes('_store') || 
        file.includes('_reward') || file.includes('_edition') || file.includes('_camo')) {
      continue
    }
    
    const filePath = join(weaponPath, file)
    const content = readFileSync(filePath, 'utf-8')
    const json = JSON.parse(content)
    
    if (!json?._RecordValue_?.Components) continue
    
    const recordName = json._RecordName_ || file.replace('.json', '')
    
    let attachParams = null
    let weaponParams = null
    
    for (const comp of json._RecordValue_.Components) {
      if (!comp) continue
      if (comp._Type_ === 'SAttachableComponentParams') {
        attachParams = comp
      }
      if (comp._Type_ === 'SWeaponAIDataParams') {
        weaponParams = comp
      }
    }
    
    if (!attachParams) continue
    
    // Extract stats from content via regex (faster than deep traversal)
    const fireRateMatch = content.match(/"fireRate":\s*(\d+)/)
    const idealRangeMatch = content.match(/"idealCombatRange":\s*([\d.]+)/)
    const maxRangeMatch = content.match(/"maxFiringRange":\s*([\d.]+)/)
    const damageMultMatch = content.match(/"damageMultiplier":\s*([\d.]+)/)
    
    const def = attachParams.AttachDef || {}
    const rawDisplayName = def.Localization?.Name || recordName
    
    weapons.push({
      id: json._RecordId_,
      name: recordName.replace('EntityClassDefinition.', ''),
      displayName: resolveLocalization(rawDisplayName, localization) || rawDisplayName,
      type: def.SubType || 'Unknown',
      size: def.Size || 0,
      fireRate: fireRateMatch ? parseInt(fireRateMatch[1]) : 0,
      idealCombatRange: idealRangeMatch ? parseFloat(idealRangeMatch[1]) : 0,
      maxFiringRange: maxRangeMatch ? parseFloat(maxRangeMatch[1]) : 0,
      damageMultiplier: damageMultMatch ? parseFloat(damageMultMatch[1]) : 1.0,
      combatRangeCategory: weaponParams?.CombatRangeCategory || 'Unknown',
      tags: def.Tags || ''
    })
  }
  
  console.log(`  Parsed ${weapons.length} FPS weapons`)
  
  return weapons
}

// ============================================================================
// SALVAGE MODULE PARSING
// ============================================================================

function parseSalvageModules(localization = {}) {
  console.log('  Parsing salvage modules...')
  
  const devicePath = join(EXTRACTED_DATA, EXPECTED_PATHS.scitems, 'weapons/devices')
  if (!existsSync(devicePath)) {
    console.log('  Salvage device path not found')
    return []
  }
  
  const files = readdirSync(devicePath).filter(f => 
    f.includes('salvage') && f.endsWith('.json') && !f.includes('template')
  )
  const modules = []
  
  for (const file of files) {
    const filePath = join(devicePath, file)
    const content = readFileSync(filePath, 'utf-8')
    const json = JSON.parse(content)
    
    if (!json?._RecordValue_?.Components) continue
    
    const recordName = json._RecordName_ || file.replace('.json', '')
    
    let attachParams = null
    
    for (const comp of json._RecordValue_.Components) {
      if (!comp) continue
      if (comp._Type_ === 'SAttachableComponentParams') {
        attachParams = comp
      }
    }
    
    if (!attachParams) continue
    
    // Extract salvage-specific stats via regex
    const efficiencyMatch = content.match(/"salvageEfficiency":\s*([\d.]+)/)
    const radiusMatch = content.match(/"salvageRadius":\s*([\d.]+)/)
    const speedMatch = content.match(/"salvageSpeed":\s*([\d.]+)/)
    
    const def = attachParams.AttachDef || {}
    const rawDisplayName = def.Localization?.Name || recordName
    
    modules.push({
      id: json._RecordId_,
      name: recordName.replace('EntityClassDefinition.', ''),
      displayName: resolveLocalization(rawDisplayName, localization) || rawDisplayName,
      size: def.Size || 0,
      salvageEfficiency: efficiencyMatch ? parseFloat(efficiencyMatch[1]) : 0,
      salvageRadius: radiusMatch ? parseFloat(radiusMatch[1]) : 0,
      salvageSpeed: speedMatch ? parseFloat(speedMatch[1]) : 0,
      tags: def.Tags || ''
    })
  }
  
  console.log(`  Parsed ${modules.length} salvage modules`)
  
  return modules
}

// ============================================================================
// DEFAULT STARTER BLUEPRINTS
// ============================================================================

function parseDefaultBlueprintIds() {
  console.log('  Parsing default starter blueprints...')
  const path = join(
    EXTRACTED_DATA,
    'libs/foundry/records/crafting/globalparams/craftingglobalparams.json'
  )
  if (!existsSync(path)) {
    validationIssues.push('Crafting global params file not found')
    return new Set()
  }

  const json = readJson(path)
  const records = json?._RecordValue_?.defaultBlueprintSelection?.blueprintRecords ?? []
  const ids = new Set()

  for (const ref of records) {
    if (typeof ref !== 'string' || /dismantle/i.test(ref)) continue
    const match = ref.match(/bp_craft_([^/\\]+)\.json$/i)
    if (match) ids.add(match[1].toLowerCase())
  }

  console.log(`  Found ${ids.size} default starter blueprints`)
  return ids
}

// ============================================================================
// BLUEPRINT PARSING
// ============================================================================

function parseBlueprintRewards() {
  console.log('\n[1/7] Parsing blueprint rewards (mission → blueprint mappings)...')
  
  const rewardFiles = findJsonFiles(EXPECTED_PATHS.blueprintRewards)
  if (rewardFiles.length === 0) {
    validationIssues.push('No blueprint reward files found')
    return {}
  }
  
  const missionBlueprints = {}
  const blueprintMissions = {}
  
  for (const file of rewardFiles) {
    const json = readJson(file)
    if (!json?._RecordValue_?.blueprintRewards) continue
    
    const recordName = json._RecordName_ || basename(file, '.json')
    const missionKey = recordName
      .replace('BlueprintPoolRecord.', '')
      .replace(/^BP_REWARDS_/i, '')
      .replace(/^BP_MISSIONREWARD_/i, '')
      .toLowerCase()
    
    const blueprints = []
    for (const reward of json._RecordValue_.blueprintRewards) {
      if (reward.blueprintRecord) {
        // Extract blueprint name from path
        const bpPath = reward.blueprintRecord
        const bpName = basename(bpPath, '.json')
          .replace('bp_craft_', '')
          .replace('_scitem', '')
        blueprints.push({
          name: bpName,
          weight: reward.weight || 1.0,
          path: bpPath
        })
        
        // Reverse mapping
        if (!blueprintMissions[bpName]) {
          blueprintMissions[bpName] = []
        }
        blueprintMissions[bpName].push(missionKey)
      }
    }
    
    if (blueprints.length > 0) {
      missionBlueprints[missionKey] = blueprints
    }
  }
  
  console.log(`  Found ${Object.keys(missionBlueprints).length} missions with blueprint rewards`)
  console.log(`  Found ${Object.keys(blueprintMissions).length} unique blueprints`)

  for (const excluded of REWARD_POOL_TRACKING_EXCLUSIONS) {
    delete missionBlueprints[excluded]
  }
  for (const excluded of BLUEPRINT_MISSION_TRACKING_EXCLUSIONS) {
    delete blueprintMissions[excluded]
  }

  return { missionBlueprints, blueprintMissions }
}

/**
 * Build contract-accurate reward missions for a blueprint (not pool-index bleed).
 */
function buildBlueprintRewardMissionsFromContracts(internalName, missionBlueprintsMap, contracts) {
  const bpName = (internalName || '').toLowerCase()
  if (!bpName) return []

  const raw = []

  for (const contract of contracts) {
    for (const poolRef of contract.blueprintPools || []) {
      const poolItems = missionBlueprintsMap[poolRef.key]
      if (!poolItems?.length) continue

      const item = poolItems.find((entry) => (entry.name || '').toLowerCase() === bpName)
      if (!item) continue

      const totalWeight = poolItems.reduce((sum, entry) => sum + (entry.weight || 1), 0)
      const poolChance = poolRef.chance ?? 1
      const dropChance = totalWeight > 0 ? poolChance * ((item.weight || 1) / totalWeight) : 0

      raw.push({
        mission: contract.faction && contract.title ? `${contract.faction}: ${contract.title}` : contract.title,
        chance: dropChance,
        poolChance,
        poolKey: poolRef.key,
        locations: contract.system ? [contract.system] : [],
        system: contract.system || null,
        region: contract.region || null,
        category: contract.category || null,
        repPoints: contract.repPoints || 0,
        minReputation: contract.minStanding?.minReputation ?? null,
        maxReputation: contract.maxStanding?.minReputation ?? null,
        standingName: contract.minStanding?.name ?? null,
        maxStandingName: contract.maxStanding?.name ?? null,
        repCareerLabel: contract.repCareerLabel ?? null,
        repScopeKey: contract.repScopeKey ?? null,
      })
    }
  }

  const grouped = new Map()
  for (const reward of raw) {
    const key = `${reward.mission}|${reward.minReputation ?? 'null'}|${reward.maxReputation ?? 'null'}`
    const existing = grouped.get(key)
    if (!existing) {
      grouped.set(key, { ...reward, locations: [...reward.locations] })
      continue
    }
    for (const loc of reward.locations) {
      if (!existing.locations.includes(loc)) existing.locations.push(loc)
    }
    if (reward.chance > existing.chance) existing.chance = reward.chance
  }

  return [...grouped.values()].sort((a, b) => {
    const repDiff = (a.minReputation ?? 0) - (b.minReputation ?? 0)
    if (repDiff !== 0) return repDiff
    return a.mission.localeCompare(b.mission)
  })
}

/**
 * Parse contract generator files to extract complete mission data:
 * - Mission titles (from localization)
 * - Blueprint reward pools
 * - Reputation requirements (minStanding/maxStanding)
 * - aUEC rewards
 * - Rep points awarded
 */
/** Verified (true) vs Unverified (false) — contractor factionReputation key. */
function resolveContractIsLawful(factionKey, _debugName) {
  const key = String(factionKey || '').toLowerCase()

  if (key.startsWith('unlawful_')) return false
  if (key.startsWith('lawful_')) return true

  return true
}

/** Template basename → canBeShared (from ActiveContractSettings). */
let contractTemplateShareCache = null

function getContractTemplateShareCache() {
  if (contractTemplateShareCache) return contractTemplateShareCache
  contractTemplateShareCache = new Map()
  const templateFiles = findJsonFiles('libs/foundry/records/contracts/contracttemplates')
  for (const file of templateFiles) {
    const json = readJson(file)
    const value = json?._RecordValue_?.contractClass?.additionalParams?.canBeShared
    if (typeof value === 'boolean') {
      contractTemplateShareCache.set(basename(file).toLowerCase(), value)
    }
  }
  return contractTemplateShareCache
}

/** Resolve party-share flag from the contract's template (intros often false). */
function resolveContractCanBeShared(contract) {
  const templateRef = contract?.template
  if (!templateRef || typeof templateRef !== 'string') return null
  const match = templateRef.match(/([^/\\]+\.json)$/i)
  if (!match) return null
  const cached = getContractTemplateShareCache().get(match[1].toLowerCase())
  return typeof cached === 'boolean' ? cached : null
}

/**
 * Mission offer frequency / instance limits from contract generators.
 * Units (confirmed via star-citizen.wiki field mapping):
 * - generationParams.respawnTime / contractLifeTime.instanceLifeTime → minutes
 * - defaultAvailability personal/abandoned cooldown → seconds
 * canBeShared comes from the linked contract template's ActiveContractSettings.
 */
function extractContractFrequency(contract, generator) {
  const genParams = contract?.generationParams || {}
  const life = contract?.contractLifeTime || {}
  const avail = generator?.defaultAvailability || {}

  const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const boolOrNull = (v) => (typeof v === 'boolean' ? v : null)

  return {
    maxInstances: numOrNull(genParams.maxInstances),
    maxInstancesPerPlayer: numOrNull(genParams.maxInstancesPerPlayer),
    respawnTimeMinutes: numOrNull(genParams.respawnTime),
    respawnTimeVariationMinutes: numOrNull(genParams.respawnTimeVariation),
    instanceLifeTimeMinutes: numOrNull(life.instanceLifeTime),
    instanceLifeTimeVariationMinutes: numOrNull(life.instanceLifeTimeVariation),
    hasPersonalCooldown: boolOrNull(avail.hasPersonalCooldown),
    personalCooldownSeconds: numOrNull(avail.personalCooldownTime),
    personalCooldownVariationSeconds: numOrNull(avail.personalCooldownTimeVariation),
    abandonedCooldownSeconds: numOrNull(avail.abandonedCooldownTime),
    abandonedCooldownVariationSeconds: numOrNull(avail.abandonedCooldownTimeVariation),
    onceOnly: boolOrNull(avail.onceOnly),
    canReacceptAfterAbandoning: boolOrNull(avail.canReacceptAfterAbandoning),
    canReacceptAfterFailing: boolOrNull(avail.canReacceptAfterFailing),
    canBeShared: resolveContractCanBeShared(contract),
  }
}

function parseContractGenerators(localization, reputationCaches = {}) {
  console.log('\n[CONTRACT PARSING] Parsing contract generators for mission data...')
  
  const contractFiles = findJsonFiles(EXPECTED_PATHS.contractGenerators)
  if (contractFiles.length === 0) {
    validationIssues.push('No contract generator files found')
    return { contracts: [], missionsByPool: {}, poolsByBlueprint: {}, factionNames: {}, standingDefs: {}, repRewardAmounts: {} }
  }
  
  console.log(`  Found ${contractFiles.length} contract generator files`)
  
  const repRewardAmounts = reputationCaches.repRewardAmounts ?? {}
  if (reputationCaches.repRewardAmounts) {
    console.log(`  Using ${Object.keys(repRewardAmounts).length} cached reputation reward amounts`)
  }

  const standingDefs = reputationCaches.standingDefs ?? {}
  if (reputationCaches.standingDefs) {
    console.log(`  Using ${Object.keys(standingDefs).length} cached standing definitions`)
  }
  // Build faction name cache (+ reverse display-name → canonical key lookup)
  const factionNames = {}
  const factionKeyByName = {}
  const factionFiles = findJsonFiles(EXPECTED_PATHS.factionReputation)
  for (const file of factionFiles) {
    const json = readJson(file)
    if (json?._RecordName_) {
      const key = basename(file, '.json').toLowerCase()
      const displayNameKey = json._RecordValue_?.displayName
      let displayName = displayNameKey
      if (displayNameKey?.startsWith('@')) {
        displayName = localization[displayNameKey.substring(1)] || displayNameKey
      }
      displayName = resolveFactionDisplayName({
        rawName: displayName,
        factionKey: key,
        recordName: json._RecordName_,
      })
      factionNames[key] = displayName || json._RecordName_.replace('FactionReputation.', '')
      const canonicalKey = key.replace(/^factionreputation_/, '')
      if (factionNames[key]) {
        factionKeyByName[factionNames[key].toLowerCase()] = canonicalKey
      }
    }
  }
  console.log(`  Cached ${Object.keys(factionNames).length} faction names`)

  // Locality gates: which system/planet you must be near for the mission to appear
  const missionLocalityCatalog = buildMissionLocalityCatalog(localization)
  
  const contracts = []
  const missionsByPool = {} // Pool key -> array of missions
  const poolsByBlueprint = {} // Blueprint name -> array of pool keys

  // Prerequisite chains: completion tag id -> missions that emit it on success,
  // and blueprint contracts that require completed-contract tags (intro/starter chains).
  const completionTagEmitters = new Map()
  const prereqPending = []

  let totalContracts = 0
  let contractsWithBlueprints = 0
  
  // Faction name inference patterns (for when factionReputation is missing)
  const factionPatterns = FACTION_NAME_OVERRIDES

  const factionKeyPatterns = {
    hockrowagency: 'lawful_hockrowagency',
    hockrow: 'lawful_hockrowagency',
    thecollector: 'wikelo',
    wikelo: 'wikelo',
    collectorwikelo: 'wikelo',
  }
  
  function inferFactionFromPath(filePath, debugName) {
    const combined = (filePath + ' ' + (debugName || '')).toLowerCase()
    for (const [pattern, factionName] of Object.entries(factionPatterns)) {
      if (combined.includes(pattern)) {
        return factionName
      }
    }
    return null
  }

  function inferFactionKeyFromPath(filePath, debugName) {
    const combined = (filePath + ' ' + (debugName || '')).toLowerCase()
    for (const [pattern, key] of Object.entries(factionKeyPatterns)) {
      if (combined.includes(pattern)) {
        return key
      }
    }
    return null
  }

  function resolveContractFaction({
    generatorFactionKey,
    generatorFactionName,
    generatorFile,
    generatorDebugName,
    contractDebugName,
    titleKey,
    templatePath,
    blueprintPoolPaths,
  }) {
    let factionKey = generatorFactionKey
    let factionName = generatorFactionName

    const contractSignals = [
      contractDebugName || '',
      titleKey || '',
      templatePath || '',
      ...(blueprintPoolPaths || []),
    ].join(' ').toLowerCase()

    if (
      contractSignals.includes('bountyhuntersguild') ||
      contractSignals.includes('bhg_')
    ) {
      if (factionName === 'Unknown' || factionName === factionKey || isUnresolvedDisplayName(factionName)) {
        factionKey = 'lawful_bountyhuntersguild'
        factionName = factionNames.factionreputation_lawful_bountyhuntersguild || 'Bounty Hunters Guild'
      }
    } else if (
      contractSignals.includes('hockrow') ||
      contractSignals.includes('hockrow_facilitydelve') ||
      (/\basd[23][a-z]?\b/.test(contractSignals) && contractSignals.includes('hockrow'))
    ) {
      factionKey = 'lawful_hockrowagency'
      factionName = factionNames.factionreputation_lawful_hockrowagency || 'Hockrow Agency'
    } else if (
      contractSignals.includes('thecollector') ||
      contractSignals.includes('collectorwikelo') ||
      contractSignals.includes('@thecollector_')
    ) {
      factionKey = 'wikelo'
      factionName = factionNames.factionreputation_wikelo || 'Wikelo Emporium'
    } else if (
      (factionName === 'Unknown' || factionName === factionKey || isUnresolvedDisplayName(factionName)) &&
      (contractSignals.includes('scenarioprogress') || contractSignals.includes('xenothreat') || contractSignals.includes('clearair'))
    ) {
      // XenoThreat "Clear Air" scenario-progress reward tiers (Orison event) —
      // event content with no faction rep binding, not a real "Unknown" faction.
      factionKey = 'xenothreat'
      factionName = 'XenoThreat'
    } else if (
      (factionName === 'Unknown' || factionName === factionKey || isUnresolvedDisplayName(factionName)) &&
      (contractSignals.includes('ors_cr_') || contractSignals.includes('orison relief') || contractSignals.includes('fabricationorder'))
    ) {
      // Orison Relief fabrication orders — Crusader-run relief effort.
      factionKey = 'crusader_industries'
      factionName = 'Crusader Industries'
    } else if (factionName === 'Unknown' || factionName === factionKey || isUnresolvedDisplayName(factionName)) {
      const inferredName = inferFactionFromPath(generatorFile, `${generatorDebugName || ''} ${contractDebugName || ''}`)
      if (inferredName) {
        factionName = inferredName
        const inferredKey = inferFactionKeyFromPath(generatorFile, `${generatorDebugName || ''} ${contractDebugName || ''}`)
        if (inferredKey) factionKey = inferredKey
      }
    }

    factionName = resolveFactionDisplayName({
      rawName: factionName,
      factionKey: `factionreputation_${factionKey}`,
      hints: `${generatorFile} ${generatorDebugName || ''} ${contractDebugName || ''}`,
    })

    return { factionKey, factionName }
  }

  for (const file of contractFiles) {
    const json = readJson(file)
    if (!json?._RecordValue_?.generators) continue
    
    const generators = json._RecordValue_.generators
    
    for (const generator of generators) {
      // introContracts are starter/invite missions (e.g. Vaughn's "A Chance to Impress",
      // faction initial invites) — no blueprint pools, but they emit the completion tags
      // that unlock gated missions, so they must be indexed as prereq chain sources.
      const generatorContracts = [
        ...(generator.introContracts ?? []),
        ...(generator.contracts ?? []),
      ]
      if (generatorContracts.length === 0) continue
      const introContractSet = new Set(generator.introContracts ?? [])
      // Generator-wide availability gates apply to every contract it offers
      const generatorPrereqDefs = extractTagPrereqDefs(generator.defaultAvailability?.prerequisites)
      const generatorLocalityKey = extractLocalityKey(generator.defaultAvailability?.prerequisites)
      
      // Extract faction from factionReputation path
      let factionKey = 'unknown'
      let factionName = 'Unknown'
      if (generator.factionReputation) {
        const factionMatch = generator.factionReputation.match(/factionreputation_(\w+)\.json/i)
        if (factionMatch) {
          factionKey = factionMatch[1].toLowerCase()
          factionName = factionNames[`factionreputation_${factionKey}`] || factionKey
          if (isUnresolvedDisplayName(factionName)) {
            factionName = resolveFactionDisplayName({
              rawName: factionName,
              factionKey: `factionreputation_${factionKey}`,
              hints: `${file} ${generator.debugName || ''}`,
            })
          }
        }
      }
      
      // If faction is still unknown, try to infer from file path or debugName
      if (factionName === 'Unknown' || factionName === factionKey || isUnresolvedDisplayName(factionName)) {
        const inferredFaction = inferFactionFromPath(file, generator.debugName)
        if (inferredFaction) {
          factionName = inferredFaction
        }
      }
      
      for (const contract of generatorContracts) {
        totalContracts++
        
        const debugName = contract.debugName || ''
        const debugLower = debugName.toLowerCase()
        const templatePath = contract.template || ''

        // Extract title from paramOverrides
        let titleKey = ''
        let title = debugName || 'Unknown Mission'
        if (contract.paramOverrides?.stringParamOverrides) {
          const titleParam = contract.paramOverrides.stringParamOverrides.find(
            p => p.param === 'Title'
          )
          if (titleParam?.value) {
            titleKey = titleParam.value
            if (titleKey.startsWith('@')) {
              title = localization[titleKey.substring(1)] || titleKey
            } else {
              title = titleKey
            }
          }
        }
        if (title === debugName && debugLower.includes('hockrow_facilitydelve_p3mm')) {
          titleKey = '@Hockrow_FacilityDelve_P3M1_title'
          title = localization.Hockrow_FacilityDelve_P3M1_title || title
        }
        
        // Extract blueprint pools from contractResults
        const blueprintPools = []
        if (contract.contractResults?.contractResults) {
          for (const result of contract.contractResults.contractResults) {
            if (!result) continue
            if (result._Type_ === 'BlueprintRewards' && result.blueprintPool) {
              const poolMatch = result.blueprintPool.match(/([^/]+)\.json$/i)
              if (poolMatch) {
                const poolKey = poolMatch[1]
                  .replace(/bp_rewards_/i, '')
                  .replace(/bp_missionreward_/i, '')
                  .toLowerCase()
                blueprintPools.push({
                  key: poolKey,
                  chance: result.chance || 1.0,
                  path: result.blueprintPool
                })
              }
            }
          }
        }

        const resolvedFaction = resolveContractFaction({
          generatorFactionKey: factionKey,
          generatorFactionName: factionName,
          generatorFile: file,
          generatorDebugName: generator.debugName,
          contractDebugName: contract.debugName,
          titleKey,
          templatePath: contract.template,
          blueprintPoolPaths: blueprintPools.map(pool => pool.path),
        })
        factionKey = resolvedFaction.factionKey
        factionName = resolvedFaction.factionName

        // Backfill canonical factionKey when the generator lacks a rep binding
        // but the display name matches a known faction record (e.g. board
        // escort templates offered under Foxwell / Headhunters generators).
        if ((factionKey === 'unknown' || !factionKey) && factionName && factionName !== 'Unknown') {
          const canonicalKey = factionKeyByName[factionName.toLowerCase()]
          if (canonicalKey) factionKey = canonicalKey
        }
        
        // Extract rep effects (gains + cross-faction losses on completion)
        const { repPoints, repEffects } = extractContractRepEffects(
          contract,
          repRewardAmounts,
          factionNames,
          factionKey
        )
        
        // Extract standing requirements (direct fields or ContractPrerequisite_Reputation)
        const repPrereq = extractContractReputationPrerequisite(contract)
        const { minStanding, maxStanding } = extractContractStandingRequirements(
          contract,
          standingDefs,
          localization
        )
        
        // Extract system from contract-specific signals only (not whole generator file paths).
        let system = 'Unknown'
        const poolKeySignals = blueprintPools.map((pool) => pool.key).join(' ')
        const nameToCheck = `${title} ${debugName} ${titleKey} ${templatePath} ${poolKeySignals}`.toLowerCase()

        const inferredSystem = inferSystemFromContractSignals(nameToCheck)
        if (inferredSystem) {
          system = inferredSystem
        }

        if (system === 'Unknown') {
          if (
            factionKey === 'wikelo' ||
            nameToCheck.includes('thecollector') ||
            nameToCheck.includes('collectorwikelo')
          ) {
            system = 'Stanton'
          } else if (nameToCheck.includes('hockrow_facilitydelve') || nameToCheck.includes('asdfacilitydelv')) {
            system = 'Stanton'
          }
        }

        // Locality prerequisite: where the player must BE for the mission to
        // appear in Contracts. Contract-level overrides the generator gate.
        const localityKey = extractLocalityKey(contract.additionalPrerequisites) ?? generatorLocalityKey
        const locality = localityKey ? missionLocalityCatalog[localityKey] ?? null : null

        // Locality is ground truth when name-based system inference failed
        if (system === 'Unknown' && locality?.systems.length === 1) {
          system = locality.systems[0]
        }

        // Extract region from debugName (e.g., RegionA, RegionB, RegionC, RegionD)
        let region = null
        const regionMatch = debugName.match(/Region([A-Z])/i)
        if (regionMatch) {
          region = regionMatch[1].toUpperCase() // Just the letter: A, B, C, D
        }
        // Region locality gate (regiona-regiond) fills in when debugName lacks it
        if (!region && localityKey) {
          const localityRegion = localityKey.match(/^region([a-d])$/)
          if (localityRegion) region = localityRegion[1].toUpperCase()
        }
        
        const missionTypeFile =
          contract.paramOverrides?.missionTypeOverride ||
          contract.missionTypeOverride ||
          generator.contractParams?.missionTypeOverride ||
          null
        const poolKeys = blueprintPools.map((pool) => pool.key).join(' ')
        const category = resolveMissionMenuCategory({
          missionTypeFile,
          generatorFile: file,
          generatorDebugName: generator.debugName || '',
          generatorType: generator._Type_ || '',
          templatePath,
          debugName,
          poolKeys,
        })
        
        // Frequency/Solo for this contract — kept even when there are no BP pools so
        // prerequisite (intro/starter) rows can show Solo without being in `contracts`.
        const frequency = extractContractFrequency(contract, generator)

        // Register completion tags this contract emits on success (prereq chain sources).
        // Intro / starter missions often have NO blueprint pools but still unlock later
        // BP missions — always index them here; do not gate on blueprintPools.length.
        const emittedTagIds = extractContractCompletionTagIds(contract)
        if (emittedTagIds.length > 0) {
          let emitterTitle = resolveContractDisplayTitle({
            title,
            titleKey,
            debugName,
            localization,
            category,
            system,
          })
          // Prereq chips must always be readable — placeholder-only titles fall back to debugName
          if (!emitterTitle || emitterTitle.includes('~mission')) {
            emitterTitle = humanizeContractDebugName(debugName)
          }
          const emitterMeta = {
            debugName: contract.debugName,
            title: emitterTitle,
            faction: factionName,
            factionKey,
            system,
            region,
            category,
            locality,
            isLawful: resolveContractIsLawful(factionKey, contract.debugName),
            hasBlueprints: blueprintPools.length > 0,
            isIntro: introContractSet.has(contract),
            frequency,
          }
          for (const tagId of emittedTagIds) {
            if (!completionTagEmitters.has(tagId)) completionTagEmitters.set(tagId, [])
            completionTagEmitters.get(tagId).push(emitterMeta)
          }
        }

        if (blueprintPools.length > 0) {
          contractsWithBlueprints++

          const displayTitle = resolveContractDisplayTitle({
            title,
            titleKey,
            debugName,
            localization,
            category,
            system,
          })

          const contractData = {
            id: contract.id || contract.debugName,
            debugName: contract.debugName,
            title,
            displayTitle,
            titleKey,
            faction: factionName,
            factionKey,
            system,
            region,
            category,
            blueprintPools,
            minStanding,
            maxStanding,
            repPoints,
            repEffects,
            locality,
            frequency,
            /** true = CIG marked notForRelease — still listed; UI shows an NFR tag. */
            notForRelease: contract.notForRelease === true,
            isLawful: resolveContractIsLawful(factionKey, contract.debugName),
            __minStandingPath: repPrereq?.minStandingPath ?? null,
            __maxStandingPath: repPrereq?.maxStandingPath ?? null,
            __repScopePath: repPrereq?.scopePath ?? null,
          }
          
          contracts.push(contractData)

          // Queue completed-contract-tag prerequisites for post-loop resolution
          const prereqDefs = combineTagPrereqDefs(contract, generatorPrereqDefs)
          if (prereqDefs.length > 0) {
            prereqPending.push({ contractData, prereqDefs })
          }

          // Index by pool
          for (const pool of blueprintPools) {
            if (!missionsByPool[pool.key]) {
              missionsByPool[pool.key] = []
            }
            missionsByPool[pool.key].push({
              title,
              displayTitle,
              titleKey,
              faction: factionName,
              factionKey,
              debugName: contract.debugName,
              isLawful: contractData.isLawful,
              system,
              region,
              category,
              minStanding,
              maxStanding,
              repPoints,
              repEffects,
              locality,
              frequency,
            })
          }
        }
      }
    }
  }
  
  // Resolve prerequisite chains now that every generator's completion tags are indexed
  let prereqResolved = 0
  for (const { contractData, prereqDefs } of prereqPending) {
    const prereqMissions = resolveContractPrereqMissions(prereqDefs, completionTagEmitters, contractData.debugName)
    if (prereqMissions.length > 0) {
      contractData.prereqMissions = prereqMissions
      prereqResolved++
    }
  }

  console.log(`  Parsed ${totalContracts} total contracts`)
  console.log(`  Found ${contractsWithBlueprints} contracts with blueprint rewards`)
  console.log(`  Indexed ${Object.keys(missionsByPool).length} unique blueprint pools`)
  console.log(`  Resolved prerequisite mission chains for ${prereqResolved} of ${prereqPending.length} gated contract(s)`)

  return { contracts, missionsByPool, poolsByBlueprint, factionNames, standingDefs, repRewardAmounts }
}

function resolveStandingFromPath(standingPath, standingDefs, localization) {
  if (!standingPath) return null
  const match = standingPath.match(/([^/\\]+)\.json$/i)
  if (!match) return null

  const standingKey = `sreputationstandingparams.${match[1]}`.toLowerCase()
  const def = standingDefs[standingKey]
  if (def) {
    return { name: def.displayName, minReputation: def.minReputation }
  }

  const rankMatch = match[1].match(/rank(\d+)$/i)
  const rankNum = rankMatch ? rankMatch[1] : '0'
  const locKey = `RepScope_Contractor_Rank${rankNum}`
  const resolvedName = localization[locKey] || localization[`RepStanding_TransportGuild_Rank${rankNum}`] || `Rank ${rankNum}`
  return { name: resolvedName, minReputation: 0 }
}

/** Standing on contract fields, or in additionalPrerequisites (InterSec TSG, etc.). */
function extractContractStandingRequirements(contract, standingDefs, localization) {
  const prereq = extractContractReputationPrerequisite(contract)
  if (!prereq) {
    return { minStanding: null, maxStanding: null }
  }

  let minStanding = resolveStandingFromPath(prereq.minStandingPath, standingDefs, localization)
  let maxStanding = resolveStandingFromPath(prereq.maxStandingPath, standingDefs, localization)

  return { minStanding, maxStanding }
}

function contractTagRecordId(tagRef) {
  if (!tagRef) return null
  if (tagRef._RecordId_) return String(tagRef._RecordId_).toLowerCase()
  const name = tagRef._RecordName_
  if (name) return String(name).replace(/^Tag\./i, '').toLowerCase()
  return null
}

/** Completion tag ids this contract awards on mission success (prereq chain sources). */
function extractContractCompletionTagIds(contract) {
  const results = contract?.contractResults?.contractResults
  if (!Array.isArray(results)) return []

  const tagIds = []
  for (const result of results) {
    if (!result || result._Type_ !== 'ContractResult_CompletionTags') continue
    if (result.missionResults?.[0] !== true) continue
    for (const completion of result.completionTags ?? []) {
      const id = contractTagRecordId(completion?.tag)
      if (id) tagIds.push(id)
    }
  }
  return tagIds
}

/**
 * Completed-contract-tag prerequisites: this mission only appears after the
 * player finishes N missions carrying specific completion tags (intro/starter
 * chains like Rayari_Intro or the rank-0 hauling certifications).
 * Accepts a raw prerequisite array (contract.additionalPrerequisites or
 * generator.defaultAvailability.prerequisites).
 */
function extractTagPrereqDefs(prereqList) {
  const prereqDefs = []
  for (const prereq of prereqList ?? []) {
    if (!prereq || prereq._Type_ !== 'ContractPrerequisite_CompletedContractTags') continue
    const tagIds = (prereq.requiredCompletedContractTags?.tags ?? [])
      .map((tag) => contractTagRecordId(tag))
      .filter(Boolean)
    if (tagIds.length === 0) continue
    prereqDefs.push({ tagIds, requiredCount: prereq.requiredCountValue ?? 1 })
  }
  return prereqDefs
}

/**
 * Mission locality catalog: MissionLocality records gate WHERE a contract is
 * offered ("you must be near Hurston to see this mission"). Each record lists
 * starmap objects (stars = system-wide, planets, moons, Lagrange points).
 * Returns lowercase locality key -> { key, label, systems }.
 */
function buildMissionLocalityCatalog(localization) {
  const catalog = {}
  const localityFiles = findJsonFiles(EXPECTED_PATHS.missionLocality)

  const locName = (token) =>
    localization?.[token] || localization?._lowerMap?.[token.toLowerCase()] || null

  for (const file of localityFiles) {
    const json = readJson(file)
    const locations = json?._RecordValue_?.availableLocations
    if (!Array.isArray(locations)) continue

    const key = basename(file, '.json').toLowerCase()
    const systems = new Set()
    const starNames = []
    const planetNames = []
    let hasMoons = false
    let hasLagrange = false

    for (const ref of locations) {
      const refPath = String(ref || '').toLowerCase()
      const systemMatch = refPath.match(/\/system\/(stanton|pyro|nyx)\//)
      if (systemMatch) {
        systems.add(systemMatch[1].charAt(0).toUpperCase() + systemMatch[1].slice(1))
      }

      // Normalize "starmapobject.stanton2" and "pyro1" style basenames to one token
      const base = basename(refPath, '.json').replace(/^starmapobject\./, '')

      if (/^(stanton|pyro|nyx)_?star$/.test(base)) {
        starNames.push(base)
      } else if (/^(stanton|pyro|nyx)\d+$/.test(base)) {
        const name = locName(base)
        if (name && !planetNames.includes(name)) planetNames.push(name)
      } else if (/^(stanton|pyro|nyx)\d+[a-z]$/.test(base)) {
        hasMoons = true
      } else if (refPath.includes('/lagrange/')) {
        hasLagrange = true
      }
      // Stations / asteroid clusters / clinics are omitted from the label
    }

    const systemList = [...systems]
    let label
    const regionMatch = key.match(/^region([a-d])$/)
    if (regionMatch) {
      const around = planetNames.length > 0 ? ` (near ${planetNames.join(', ')})` : ''
      label = `Pyro region ${regionMatch[1].toUpperCase()}${around}`
      if (systemList.length === 0) systemList.push('Pyro')
    } else if (starNames.length > 0 || planetNames.length === 0) {
      // Star anchors (or nothing more specific) = system-wide availability
      const names = systemList.length > 0 ? systemList : starNames
      label = names.length > 0 ? `Anywhere in ${names.join(' or ')}` : null
    } else {
      // hasMoons/hasLagrange just confirm the gate covers the whole neighborhood
      const suffix = hasMoons || hasLagrange ? ' area' : ''
      label = `${planetNames.join(' / ')}${suffix}`
    }

    if (!label) continue
    catalog[key] = { key, label, systems: systemList }
  }

  console.log(`  Cached ${Object.keys(catalog).length} mission locality records`)
  return catalog
}

/** First ContractPrerequisite_Locality key in a prerequisite list (or null). */
function extractLocalityKey(prereqList) {
  for (const prereq of prereqList ?? []) {
    if (!prereq || prereq._Type_ !== 'ContractPrerequisite_Locality') continue
    const match = String(prereq.localityAvailable ?? '').match(/([^/\\]+)\.json$/i)
    if (match) return match[1].toLowerCase()
  }
  return null
}

/** Contract-level prereqs plus generator-wide defaultAvailability gates, deduped. */
function combineTagPrereqDefs(contract, generatorPrereqDefs) {
  const combined = [...(generatorPrereqDefs ?? []), ...extractTagPrereqDefs(contract?.additionalPrerequisites)]
  const seen = new Set()
  return combined.filter((def) => {
    const key = `${[...def.tagIds].sort().join(',')}#${def.requiredCount}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Resolve required tags to the missions that emit them (deduped by faction + title).
 * Never drops emitters that lack blueprint pools — faction intro/starter missions
 * frequently give no BP but are still the unlock gate for later BP contracts.
 */
function resolveContractPrereqMissions(prereqDefs, completionTagEmitters, ownDebugName) {
  const prereqMissions = []

  for (const def of prereqDefs) {
    const seen = new Set()
    const missions = []
    let totalEmitters = 0

    for (const tagId of def.tagIds) {
      for (const emitter of completionTagEmitters.get(tagId) ?? []) {
        if (emitter.debugName === ownDebugName) continue
        totalEmitters++
        // Dedupe display rows only — hasBlueprints is intentionally NOT a filter.
        const key = `${emitter.faction}|${emitter.title}`
        if (seen.has(key)) continue
        seen.add(key)
        missions.push({
          debugName: emitter.debugName,
          title: emitter.title,
          faction: emitter.faction,
          factionKey: emitter.factionKey,
          system: emitter.system,
          region: emitter.region,
          category: emitter.category,
          locality: emitter.locality ?? null,
          isLawful: emitter.isLawful,
          hasBlueprints: emitter.hasBlueprints,
          isIntro: emitter.isIntro,
          frequency: emitter.frequency ?? null,
        })
      }
    }

    if (missions.length === 0) continue

    // Prefer intro / no-BP starters first so they survive the display cap and read as the unlock path.
    missions.sort((a, b) => {
      if (Boolean(a.isIntro) !== Boolean(b.isIntro)) return a.isIntro ? -1 : 1
      if (Boolean(a.hasBlueprints) !== Boolean(b.hasBlueprints)) {
        return a.hasBlueprints ? 1 : -1
      }
      return String(a.title || '').localeCompare(String(b.title || ''))
    })

    prereqMissions.push({
      requiredCount: def.requiredCount,
      missions: missions.slice(0, 12),
      totalEmitters,
    })
  }

  return prereqMissions
}

/**
 * Reputation effects on mission COMPLETION (missionResults[0] === true).
 * A contract can touch multiple factions — e.g. CFP sabotage missions grant
 * Citizens for Prosperity rep while dropping Head Hunters rep. Amounts from
 * multiple scopes (faction standing + affinity) of the same faction are summed.
 *
 * Returns:
 *   repPoints  — total completion gain for the contract's own faction
 *                (fallback: first faction seen). Abandon/fail penalties
 *                (missionResults[2]) are deliberately excluded.
 *   repEffects — [{ factionKey, faction, amount }] for every faction touched
 *                on completion, own faction first.
 */
function extractContractRepEffects(contract, repRewardAmounts, factionNames, contractFactionKey = null) {
  const empty = { repPoints: 0, repEffects: [] }
  const results = contract?.contractResults?.contractResults
  if (!Array.isArray(results)) return empty

  const byFaction = new Map()

  for (const result of results) {
    if (!result || result._Type_ !== 'ContractResult_LegacyReputation') continue
    // Index 0 = mission completed; index 2 carries abandon/fail penalties.
    if (result.missionResults?.[0] !== true) continue

    const params = result.contractResultReputationAmounts
    const rewardMatch = String(params?.reward ?? '').match(/([^/\\]+)\.json$/i)
    if (!rewardMatch) continue
    const amount = repRewardAmounts[rewardMatch[1].toLowerCase()]
    if (typeof amount !== 'number' || amount === 0) continue

    const factionMatch = String(params?.factionReputation ?? '').match(/factionreputation_([\w]+)\.json$/i)
    const factionKey = factionMatch ? factionMatch[1].toLowerCase() : 'unknown'

    const existing = byFaction.get(factionKey)
    if (existing) {
      existing.amount += amount
    } else {
      byFaction.set(factionKey, {
        factionKey,
        faction:
          factionNames?.[`factionreputation_${factionKey}`]
          || factionNames?.[factionKey]
          || factionKey,
        amount,
      })
    }
  }

  if (byFaction.size === 0) return empty

  const repEffects = [...byFaction.values()].sort((a, b) => {
    if (a.factionKey === contractFactionKey) return -1
    if (b.factionKey === contractFactionKey) return 1
    return b.amount - a.amount
  })

  const own = contractFactionKey ? byFaction.get(contractFactionKey) : null
  const repPoints = own?.amount ?? repEffects[0].amount

  return { repPoints, repEffects }
}

function normalizeBlueprintPoolKeyFromPath(poolPath) {
  if (!poolPath) return null
  const poolMatch = String(poolPath).match(/([^/\\]+)\.json$/i)
  if (!poolMatch) return null
  return poolMatch[1]
    .replace(/^BlueprintPoolRecord\./i, '')
    .replace(/^bp_rewards_/i, '')
    .replace(/^bp_missionreward_/i, '')
    .toLowerCase()
}

function indexContractInMissionsByPool(contract, missionsByPool) {
  for (const pool of contract.blueprintPools || []) {
    if (!missionsByPool[pool.key]) missionsByPool[pool.key] = []
    missionsByPool[pool.key].push({
      title: contract.title,
      displayTitle: contract.displayTitle,
      titleKey: contract.titleKey,
      faction: contract.faction,
      factionKey: contract.factionKey,
      debugName: contract.debugName,
      isLawful: contract.isLawful,
      system: contract.system,
      region: contract.region,
      category: contract.category,
      minStanding: contract.minStanding,
      maxStanding: contract.maxStanding,
      repPoints: contract.repPoints,
      repEffects: contract.repEffects ?? [],
      repCareerLabel: contract.repCareerLabel ?? null,
      repScopeKey: contract.repScopeKey ?? null,
      frequency: contract.frequency ?? null,
    })
  }
}

function enrichContractStandingData(contractData, reputationSystem, localization) {
  console.log('\n[CONTRACT STANDINGS] Resolving scope-aware reputation requirements...')
  let updated = 0

  for (const contract of contractData.contracts) {
    const enriched = enrichContractStandingFields(contract, reputationSystem, localization)
    if (!enriched.minStanding && !enriched.maxStanding) continue

    contract.minStanding = enriched.minStanding
    contract.maxStanding = enriched.maxStanding
    contract.repScopeKey = enriched.repScopeKey
    contract.repCareerLabel = enriched.repCareerLabel
    delete contract.__minStandingPath
    delete contract.__maxStandingPath
    delete contract.__repScopePath
    updated++
  }

  contractData.missionsByPool = {}
  for (const contract of contractData.contracts) {
    indexContractInMissionsByPool(contract, contractData.missionsByPool)
  }

  console.log(`  Updated ${updated} contract(s) with scope-aware standing labels`)
}

/**
 * Resolve scenario-progress faction from a Faction or FactionReputation file URL.
 * Orison Relief points at Faction.Faction_Lawful_CrusaderIndustries (not a reputation file).
 */
function resolveScenarioFaction(factionPath, factionNames, hints = '') {
  const path = String(factionPath || '')

  let keyMatch =
    path.match(/factionreputation_([\w]+)\.json/i) ||
    path.match(/faction_reputation_([\w]+)\.json/i)

  if (!keyMatch) {
    const baseMatch = path.match(/([^/\\]+)\.json$/i)
    if (baseMatch) {
      const factionAbs = join(
        EXTRACTED_DATA,
        'libs/foundry/records/factions',
        `${baseMatch[1]}.json`
      )
      const factionJson = existsSync(factionAbs) ? readJson(factionAbs) : null
      const repRef = factionJson?._RecordValue_?.factionReputationRef
      if (typeof repRef === 'string') {
        keyMatch =
          repRef.match(/factionreputation_([\w]+)\.json/i) ||
          repRef.match(/faction_reputation_([\w]+)\.json/i)
      }
      if (!keyMatch) {
        const stripped = baseMatch[1]
          .replace(/^faction_/i, '')
          .replace(/^lawful_/i, '')
          .replace(/^unlawful_/i, '')
          .replace(/^reputation_/i, '')
        if (stripped) keyMatch = [null, stripped]
      }
    }
  }

  const factionKey = keyMatch?.[1] ? String(keyMatch[1]).toLowerCase() : 'unknown'
  const lookedUp =
    factionNames[`factionreputation_${factionKey}`] ||
    factionNames[factionKey] ||
    null
  const factionName =
    lookedUp ||
    resolveFactionDisplayName({
      rawName: factionKey === 'unknown' ? null : factionKey,
      factionKey: `factionreputation_${factionKey}`,
      hints,
    })

  return { factionKey, factionName }
}

/**
 * Event journal titles for scenario-progress reward tiers (not Contracts-app missions).
 * progressionText is often a UI counter label like "Your Total:" — do not use as the title.
 */
function resolveScenarioEventMeta(scenarioKey, localization) {
  const key = String(scenarioKey || '').toLowerCase()
  if (key.startsWith('ors')) {
    return {
      eventLabel: localization.ORS_JournalTracker_Title || 'Orison Relief',
      system: 'Stanton',
    }
  }
  if (key.startsWith('rox') || key.includes('xenothreat')) {
    return {
      eventLabel: localization.X2_JournalTracker_Title || 'Return of XenoThreat',
      system: 'Stanton',
    }
  }
  return {
    eventLabel: 'Scenario Progress',
    system: null,
  }
}

/**
 * Contract scenario progress (tiered event blueprint pools).
 * These are journal / event contribution milestones — not in-game Contracts titles.
 */
function parseContractScenarios(localization, factionNames) {
  console.log('\n[CONTRACT SCENARIOS] Parsing scenario progress blueprint rewards...')
  const scenarioFiles = findJsonFiles(EXPECTED_PATHS.contractScenarios)
  if (scenarioFiles.length === 0) {
    console.log('  No contract scenario files found')
    return []
  }

  const contracts = []
  let tierCount = 0

  for (const file of scenarioFiles) {
    const json = readJson(file)
    const recordName = json?._RecordName_ || basename(file, '.json')
    const scenarioKey = recordName.replace(/^ScenarioProgress\./i, '')
    const { eventLabel, system } = resolveScenarioEventMeta(scenarioKey, localization)
    const tiers = json?._RecordValue_?.factionRewardTiers || []

    for (const factionTier of tiers) {
      const { factionKey, factionName } = resolveScenarioFaction(
        factionTier.faction || '',
        factionNames,
        `${file} ${scenarioKey}`
      )

      for (const progression of factionTier.tierProgressions || []) {
        for (const tierReward of progression.tierRewards || []) {
          const poolPaths = tierReward.blueprintPool || []
          const blueprintPools = []
          for (const poolPath of poolPaths) {
            const key = normalizeBlueprintPoolKeyFromPath(poolPath)
            if (key) blueprintPools.push({ key, chance: 1, path: poolPath })
          }
          if (blueprintPools.length === 0) continue

          const minPoints = tierReward.minPoints ?? 0
          const debugName = `${scenarioKey}_tier_${minPoints}`
          // Member-facing: event name + points threshold (not a fake Contracts title)
          const title = `${eventLabel} — ${minPoints.toLocaleString()} pts`

          contracts.push({
            id: debugName,
            debugName,
            title,
            displayTitle: title,
            titleKey: '',
            faction: factionName,
            factionKey,
            system: system || 'Unknown',
            region: null,
            category: 'Scenario Progress',
            blueprintPools,
            minStanding: null,
            maxStanding: null,
            scenarioPointsRequired: minPoints,
            scenarioProgressLabel: eventLabel,
            repPoints: 0,
            repEffects: [],
            isLawful: resolveContractIsLawful(factionKey, debugName),
            source: 'contractScenario',
          })
          tierCount++
        }
      }
    }
  }

  console.log(`  Added ${tierCount} scenario tier contracts from ${scenarioFiles.length} file(s)`)
  return contracts
}

/**
 * Red Wind blueprint pool is defined in game data but not attached to hauling contracts.
 */
function parseRedWindBridgedContracts(localization, factionNames, standingDefs, repRewardAmounts) {
  console.log('\n[RED WIND BRIDGE] Attaching redwind pool to Red Wind Linehaul generators...')
  const bridgePath = join(EXTRACTED_DATA, 'libs/foundry/records', REDWIND_BRIDGE.generatorSubpath)
  if (!existsSync(bridgePath)) {
    console.log('  Red Wind generator path not found')
    return []
  }

  const files = readdirSync(bridgePath).filter((name) => name.endsWith('.json'))
  const factionKey = 'lawful_redwindlinehaul'
  const factionName =
    factionNames[`factionreputation_${factionKey}`]
    || factionNames[factionKey]
    || 'Red Wind Linehaul'

  const contracts = []

  const REDWIND_GENERATOR_TITLES = {
    redwind_hauling: 'Red Wind Interstellar Hauling',
    redwind_recovercargo: 'Red Wind Cargo Recovery',
    redwind_recoveritem: 'Red Wind Package Recovery',
  }

  for (const fileName of files) {
    const file = join(bridgePath, fileName)
    const json = readJson(file)
    const generator = json?._RecordValue_?.generators?.[0]
    if (!generator) continue

    const fileStem = basename(fileName, '.json')
    const sampleContract = generator.contracts?.[0]
    let title = REDWIND_GENERATOR_TITLES[fileStem] || generator.debugName || fileStem
    let titleKey = ''
    if (sampleContract?.paramOverrides?.stringParamOverrides) {
      const titleParam = sampleContract.paramOverrides.stringParamOverrides.find((p) => p.param === 'Title')
      if (titleParam?.value) {
        titleKey = titleParam.value
        const localized = titleKey.startsWith('@')
          ? localization[titleKey.slice(1)] || titleKey
          : titleParam.value
        if (localized && !localized.includes('~mission') && !isUnresolvedDisplayName(localized)) {
          title = localized
        }
      }
    }

    const debugName = `bridged_${basename(fileName, '.json')}`
    const nameBlob = `${generator.debugName || ''} ${sampleContract?.debugName || ''} ${title}`.toLowerCase()
    let system = 'Stanton'
    if (nameBlob.includes('nyx')) system = 'Nyx'
    else if (nameBlob.includes('pyro')) system = 'Pyro'

    let category = 'Hauling'
    const missionTypeFile = generator.contractParams?.missionTypeOverride
      || sampleContract?.paramOverrides?.missionTypeOverride
    if (missionTypeFile) {
      const catMatch = missionTypeFile.match(/missiontype\/pu\/([^/\\]+)\.json$/i)
      if (catMatch) {
        category = catMatch[1].replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      }
    }

    const minStanding = sampleContract ? resolveStandingFromPath(sampleContract.minStanding, standingDefs, localization) : null
    const maxStanding = sampleContract ? resolveStandingFromPath(sampleContract.maxStanding, standingDefs, localization) : null
    const { repPoints, repEffects } = sampleContract
      ? extractContractRepEffects(sampleContract, repRewardAmounts, factionNames, factionKey)
      : { repPoints: 0, repEffects: [] }

    contracts.push({
      id: debugName,
      debugName,
      title,
      displayTitle: resolveContractDisplayTitle({
        title,
        titleKey,
        debugName,
        localization,
        category,
        system,
      }),
      titleKey,
      faction: factionName,
      factionKey,
      system,
      region: null,
      category,
      blueprintPools: [{
        key: REDWIND_BRIDGE.poolKey,
        chance: 1,
        path: 'bridged:redwind',
      }],
      minStanding,
      maxStanding,
      repPoints,
      repEffects,
      isLawful: true,
      source: 'orphanPoolBridge',
    })
  }

  console.log(`  Added ${contracts.length} bridged Red Wind contract(s)`)
  return contracts
}

function mergeSupplementalContracts(contractData, localization, factionNames, standingDefs, repRewardAmounts) {
  const scenarioContracts = parseContractScenarios(localization, factionNames)
  const redwindContracts = parseRedWindBridgedContracts(localization, factionNames, standingDefs, repRewardAmounts)
  const supplemental = [...scenarioContracts, ...redwindContracts]

  for (const contract of supplemental) {
    contractData.contracts.push(contract)
    indexContractInMissionsByPool(contract, contractData.missionsByPool)
  }

  if (supplemental.length > 0) {
    console.log(`  Total contracts after scenario/bridge merge: ${contractData.contracts.length}`)
  }

  return contractData
}

/** Prefer canonical base names for *_01_01_01 variants when a shorter in-game key exists. */
function resolveCanonicalBaseBlueprintName(internalName, localization) {
  if (!internalName) return null
  const n = internalName.toLowerCase()

  let m = n.match(/^(\w+)_legacy_armor_(\w+)_(\w+)_01_01_01$/)
  if (m) {
    const key = `item_Name_${m[1]}_legacy_${m[2]}_armor_01_${m[3]}`
    if (localization[key]) return localization[key]
  }

  m = n.match(/^(\w+)_explorer_armor_(\w+)_(\w+)_01_01_01$/)
  if (m) {
    for (const key of [
      `item_Name_${m[1]}_explorer_01_${m[3]}`,
      `item_Name_${m[1]}_explorer_${m[2]}_armor_01_${m[3]}`,
    ]) {
      if (localization[key]) return localization[key]
    }
  }

  m = n.match(/^(\w+)_armor_(\w+)_(\w+)_01_01_01$/)
  if (m) {
    const key = `item_Name_${m[1]}_${m[2]}_armor_01_${m[3]}`
    if (localization[key]) return localization[key]
  }

  return null
}

/** Loc keys for some FPS mags use {base}_{variant}_mag while entity IDs use {base}_mag_{variant}. */
function getMagVariantLocalizationAliases(name) {
  if (!name) return []
  const match = name.toLowerCase().match(/^(.+)_mag_([a-z0-9]+)$/)
  if (!match) return []
  return [`${match[1]}_${match[2]}_mag`]
}

const ARMOR_SLOT_DISPLAY = {
  arms: 'Arms',
  core: 'Core',
  helmet: 'Helmet',
  legs: 'Legs',
  backpack: 'Backpack',
  undersuit: 'Undersuit',
  suit: 'Suit',
}

function detectArmorSlotFromInternalName(internalName, displayName = '') {
  const nameForSlot = (internalName || '').toLowerCase()
  const label = (displayName || '').toLowerCase()
  if (/_helmet(?:_|$)/.test(nameForSlot)) return 'helmet'
  if (/_backpack(?:_|$)/.test(nameForSlot)) return 'backpack'
  if (/_pants(?:_|$)/.test(nameForSlot)) return 'legs'
  if (/_legs(?:_|$)/.test(nameForSlot)) return 'legs'
  if (/_arms(?:_|$)/.test(nameForSlot)) return 'arms'
  if (/_core(?:_|$)|_torso(?:_|$)|_jacket(?:_|$)/.test(nameForSlot)) return 'core'
  if (/_undersuit(?:_|$)/.test(nameForSlot)) return 'undersuit'
  if (/flightsuit(?:_|$)/.test(nameForSlot) && !/_helmet(?:_|$)/.test(nameForSlot)) return 'flight'
  if (/\bflight\b/.test(label) && /\bsuit\b/.test(label)) return 'flight'
  if (/_suit(?:_|$)/.test(nameForSlot)) return 'suit'
  return null
}

function nameImpliesArmorSlot(name) {
  if (!name) return null
  const n = name.toLowerCase()
  if (/\bhelmet\b|\bhelm\b/.test(n)) return 'helmet'
  if (/\bcore\b|\btorso\b|\bjacket\b/.test(n)) return 'core'
  if (/\barms\b/.test(n)) return 'arms'
  if (/\blegs\b|\bpants\b/.test(n)) return 'legs'
  if (/backpack/.test(n)) return 'backpack'
  if (/undersuit/.test(n)) return 'undersuit'
  if (/\bflight\b/.test(n) && /\bsuit\b/.test(n)) return 'flight'
  if (/flightsuit/.test(n)) return 'flight'
  return null
}

function nameMatchesArmorSlot(name, slot) {
  const implied = nameImpliesArmorSlot(name)
  if (!implied) return true
  return implied === slot
}

function lookupLocalizationKey(key, localization) {
  if (!key) return null
  return localization[key] || localization._lowerMap?.[key.toLowerCase()] || null
}

function parseArmorInternalName(internalName) {
  const n = (internalName || '').toLowerCase()
  if (!n) return null

  let m = n.match(/^(\w+)_undersuit_helmet_(\d+)_(\d+)_(\d+)$/)
  if (m) return { mfg: m[1], slot: 'helmet', line: 'undersuit', weight: null, v1: m[2], v2: m[3], v3: m[4] }

  m = n.match(/^(\w+)_undersuit_(\d+)_(\d+)_(\d+)$/)
  if (m) return { mfg: m[1], slot: 'undersuit', line: 'undersuit', weight: null, v1: m[2], v2: m[3], v3: m[4] }

  m = n.match(/^(\w+)_(combat|utility|env|specialist)_(\w+)_(helmet|arms|core|legs|backpack|undersuit)_(\d+)_(\d+)_(\d+)$/)
  if (m) {
    return { mfg: m[1], line: m[2], weight: m[3], slot: m[4], v1: m[5], v2: m[6], v3: m[7] }
  }

  m = n.match(/^(\w+)_legacy_armor_(\w+)_(helmet|arms|core|legs|backpack)_(\d+)_(\d+)_(\d+)$/)
  if (m) return { mfg: m[1], line: 'legacy', weight: m[2], slot: m[3], v1: m[4], v2: m[5], v3: m[6] }

  m = n.match(/^(\w+)_(?:legacy_)?armor_(\w+)_(helmet|arms|core|legs|backpack)_(\d+)_(\d+)_(\d+)$/)
  if (m) return { mfg: m[1], line: 'armor', weight: m[2], slot: m[3], v1: m[4], v2: m[5], v3: m[6] }

  m = n.match(/^(\w+)_env_armor_(\w+)_(helmet|arms|core|legs|backpack)_(\d+)(?:_|$)/)
  if (m) return { mfg: m[1], line: 'env', weight: m[2], slot: m[3], v1: m[4], v2: '01', v3: '01' }

  return null
}

function buildArmorLocalizationKeys(parsed) {
  const { mfg, line, weight, slot, v1, v2, v3 } = parsed
  const MFG = mfg.toUpperCase()
  const keys = []

  const push = (...candidates) => {
    for (const key of candidates) keys.push(key)
  }

  if (line === 'undersuit') {
    if (slot === 'helmet') {
      push(
        `item_Name_${mfg}_undersuit_helmet_${v1}_${v2}_${v3}`,
        `item_Name_${MFG}_undersuit_helmet_${v1}_${v2}_${v3}`,
        `item_Name_${mfg}_undersuit_helmet_0${v1}_0${v2}_0${v3}`,
      )
    } else {
      push(
        `item_Name_${MFG}_Undersuit_Armor_${v1}_${v2}_${v3}`,
        `item_Name_${mfg}_undersuit_${v1}_${v2}_${v3}`,
        `item_Name_${MFG}_undersuit_${v1}_${v2}_${v3}`,
      )
    }
    return keys
  }

  if (line === 'legacy') {
    push(
      `item_Name_${mfg}_legacy_armor_${weight}_${slot}_${v1}_${v2}_${v3}`,
      `item_Name_${MFG}_legacy_armor_${weight}_${slot}_${v1}_${v2}_${v3}`,
      `item_Name_${mfg}_legacy_${weight}_armor_01_${slot}`,
    )
    return keys
  }

  if (line === 'armor') {
    push(
      `item_Name_${mfg}_armor_${weight}_${slot}_${v1}_${v2}_${v3}`,
      `item_Name_${MFG}_armor_${weight}_${slot}_${v1}_${v2}_${v3}`,
      `item_Name_${mfg}_${weight}_armor_${v1}_${slot}`,
      `item_Name_${mfg}_${weight}_armor_0${v1}_${slot}`,
    )
    return keys
  }

  if (line === 'env') {
    push(
      `item_Name_${mfg}_env_${weight}_${slot}_0${v1}`,
      `item_Name_${mfg}_env_${weight}_${slot}_${v1}`,
      `item_Name_${mfg}_env_armor_${weight}_${slot}_0${v1}`,
    )
    return keys
  }

  // combat | utility | env | specialist
  for (const prefix of [`item_Name_${mfg}`, `item_Name_${MFG}`]) {
    push(
      `${prefix}_${line}_${weight}_${slot}_${v1}_${v2}_${v3}`,
      `${prefix}_${line}_${weight}_${slot}_0${v1}_0${v2}_0${v3}`,
    )
  }
  return keys
}

function appendArmorSlotToName(name, slot) {
  const label = ARMOR_SLOT_DISPLAY[slot]
  if (!label || name.toLowerCase().includes(label.toLowerCase())) return name
  return `${name} ${label}`
}

/** Slot-aware armor name resolution — never accept a core name for a helmet key, etc. */
function resolveArmorBlueprintName(internalName, localization) {
  const parsed = parseArmorInternalName(internalName)
  if (!parsed) return null

  for (const key of buildArmorLocalizationKeys(parsed)) {
    const value = lookupLocalizationKey(key, localization)
    if (value && nameMatchesArmorSlot(value, parsed.slot)) return value
  }

  // Short-name + slot suffix (colorway shared across set pieces)
  if (parsed.line === 'specialist' || parsed.line === 'combat' || parsed.line === 'utility') {
    const { mfg, line, weight, v1 } = parsed
    const shortKeys = [
      `item_Name_${mfg}_${line}_${weight}_0${v1}_short`,
      `item_Name_${mfg}_${line}_${weight}_armor_0${v1}_short`,
      `item_Name_${mfg.toUpperCase()}_${line}_${weight}_0${v1}_short`,
    ]
    for (const sk of shortKeys) {
      const base = lookupLocalizationKey(sk, localization)
      if (base) return appendArmorSlotToName(base, parsed.slot)
    }
  }

  // Undersuit helmet: reuse body undersuit name + Helmet
  if (parsed.line === 'undersuit' && parsed.slot === 'helmet') {
    const bodyParsed = { ...parsed, slot: 'undersuit' }
    for (const key of buildArmorLocalizationKeys(bodyParsed)) {
      const value = lookupLocalizationKey(key, localization)
      if (value) return appendArmorSlotToName(value, 'helmet')
    }
  }

  return null
}

function parseBlueprintDefinitions(localization = {}) {
  console.log('\n[2/7] Parsing blueprint definitions (crafting recipes)...')
  
  const blueprintFiles = findJsonFiles(EXPECTED_PATHS.blueprints)
  if (blueprintFiles.length === 0) {
    validationIssues.push('No blueprint definition files found')
    return []
  }
  
  const blueprints = []
  const entityPathIndex = buildEntityClassPathIndex(EXTRACTED_DATA)
  const recordIndex = buildRecordBasenameIndex(EXTRACTED_DATA)
  
  for (const file of blueprintFiles) {
    const json = readJson(file)
    if (!json?._RecordValue_?.blueprint) continue

    const fileBase = basename(file, '.json').toLowerCase()
    if (fileBase.includes('template')) continue // Dev crafting templates, not player blueprints
    
    const bp = json._RecordValue_.blueprint
    const recordName = json._RecordName_ || ''
    
    // Generate file path in the format stored in the database
    // Old format: livefiles\libs\foundry\records\crafting\blueprints\crafting\<path>\<name>.json
    // Extract path from extracted-data/ onward and convert to livefiles prefix
    // ALWAYS lowercase for consistent storage/lookup
    const relativePath = file.replace(/.*extracted-data[\\\/]/i, '').replace(/\//g, '\\').toLowerCase()
    const legacyFilePath = `livefiles\\${relativePath}`
    
    // Extract entity class for the item being crafted
    let entityClass = null
    if (bp.processSpecificData?.entityClass) {
      entityClass = basename(bp.processSpecificData.entityClass, '.json')
    }
    
    // Parse crafting slots from tiers
    // Parse slots in the format expected by the UI
    const slots = []
    if (bp.tiers?.[0]?.recipe?.costs?.mandatoryCost?.options) {
      for (const option of bp.tiers[0].recipe.costs.mandatoryCost.options) {
        if (option.options) {
          let slotDisplayName = option.nameInfo?.displayName || option.nameInfo?.debugName || 'Unknown'
          const slotDebugName = option.nameInfo?.debugName || 'Unknown'
          // Resolve localization key for slot name
          if (slotDisplayName.startsWith('@')) {
            const locKey = slotDisplayName.slice(1)
            slotDisplayName = localization[locKey] || slotDebugName
          }
          
          // Extract modifiers from slot context
          const slotModifiers = []
          const contextModifiers = option.context?.find(c => c && c._Type_ === 'CraftingCostContext_ResultGameplayPropertyModifiers')
          if (contextModifiers?.gameplayPropertyModifiers?.gameplayPropertyModifiers) {
            for (const mod of contextModifiers.gameplayPropertyModifiers.gameplayPropertyModifiers) {
              // Extract property name from record path
              const propPath = mod.gameplayPropertyRecord || ''
              const propMatch = propPath.match(/gpp_([^/]+)\.json$/i)
              const property = propMatch ? propMatch[1] : 'unknown'
              
              // Extract value ranges (both Linear and LinearIntegerAdditive types)
              for (const range of (mod.valueRanges || [])) {
                if (range && range._Type_ === 'CraftingGameplayPropertyModifierValueRange_Linear') {
                  slotModifiers.push({
                    property,
                    startQuality: range.startQuality ?? 0,
                    endQuality: range.endQuality ?? 1000,
                    baseAmount: range.modifierAtStart ?? 1.0,
                    perQuality: ((range.modifierAtEnd ?? 1.0) - (range.modifierAtStart ?? 1.0)) / ((range.endQuality ?? 1000) - (range.startQuality ?? 0))
                  })
                } else if (range && range._Type_ === 'CraftingGameplayPropertyModifierValueRange_LinearIntegerAdditive') {
                  const start = range.additiveModifierAtStart ?? range.modifierAtStart ?? 0
                  const end = range.additiveModifierAtEnd ?? range.modifierAtEnd ?? start
                  slotModifiers.push({
                    property,
                    startQuality: range.startQuality ?? 0,
                    endQuality: range.endQuality ?? 1000,
                    additiveAtStart: start,
                    additiveAtEnd: end,
                    isIntegerAdditive: true,
                  })
                }
              }
            }
          }
          
          const slotOptions = []
          
          for (const slotOption of option.options) {
            if (slotOption._Type_ === 'CraftingCost_Resource' && slotOption.resource) {
              const resourceName = slotOption.resource._RecordName_?.replace('ResourceType.', '') || 'Unknown'
              const quantity = slotOption.quantity?.standardCargoUnits || 0
              
              slotOptions.push({
                type: 'resource',
                resourceName,
                standardCargoUnits: quantity,
                minQuality: slotOption.minQuality || 1,
                modifiers: slotModifiers.length > 0 ? slotModifiers : undefined
              })
            } else if (slotOption._Type_ === 'CraftingCost_Item' && slotOption.entityClass) {
              // Handle item-type slots (e.g., LENSES, REGULATOR, FILTER with weapon_damage modifiers)
              const itemPath = slotOption.entityClass || ''
              const itemMatch = itemPath.match(/([^/\\]+)\.json$/i)
              // itemName is always lowercase for consistent storage/lookup
              const itemName = itemMatch ? itemMatch[1].toLowerCase() : 'unknown'
              // Resolve display name from localization (e.g., "harvestable_mineral_1h_sadaryx" -> "Sadaryx")
              const displayName = resolveItemDisplayName(itemName, localization)

              slotOptions.push({
                type: 'item',
                itemName,
                displayName,
                entityName: displayName,
                itemPath: itemPath.toLowerCase(),
                quantity: slotOption.quantity || 1,
                minQuality: slotOption.minQuality || 1,
                modifiers: slotModifiers.length > 0 ? slotModifiers : undefined
              })
            }
          }
          
          if (slotOptions.length > 0) {
            slots.push({
              slotDisplayName,
              slotDebugName,
              requiredCount: 1,
              options: slotOptions
            })
          }
        }
      }
    }
    
    // Parse craft time
    let craftTimeMinutes = 0
    const craftTime = bp.tiers?.[0]?.recipe?.costs?.craftTime
    if (craftTime) {
      craftTimeMinutes = (craftTime.days || 0) * 1440 +
                         (craftTime.hours || 0) * 60 +
                         (craftTime.minutes || 0) +
                         (craftTime.seconds || 0) / 60
    }
    
    // Extract category
    const category = bp.category?._RecordName_?.replace('BlueprintCategoryRecord.', '') || 'Unknown'
    
    // Generate names
    const fullName = recordName.replace('CraftingBlueprintRecord.', '')
    // internalName is the short form (without BP_CRAFT_ prefix) used for matching
    // ALWAYS lowercase for consistent storage/lookup
    const internalName = fullName
      .replace(/^BP_CRAFT_/i, '')
      .replace(/_scitem$/i, '')
      .toLowerCase()
    
    // Authoritative name FIRST: the crafted item's own SCItem display name
    // (AttachDef.Localization.Name). This is exactly what the game writes to
    // Game.log ("Received Blueprint: X"), so adopting it guarantees BP Dumper's
    // logged name resolves to this blueprint. Heuristic guessing below only runs
    // when the entity record has no usable name (null entityClass, placeholder).
    let blueprintName = resolveEntityDisplayName(entityClass || internalName, entityPathIndex, localization)

    // Slot-aware armor names next — prevents cross-slot localization bleed (core name on helmet, etc.)
    if (!blueprintName) blueprintName = resolveArmorBlueprintName(internalName, localization)
    const namesToTry = [...new Set(
      [internalName, entityClass]
        .filter(Boolean)
        .flatMap(name => [name, ...getMagVariantLocalizationAliases(name)])
    )]
    const locKeyPatterns = []
    
    if (!blueprintName) for (const name of namesToTry) {
      // Try different key formats
      locKeyPatterns.push(
        `item_Name${name}`,                    // item_NamePOWR_ACOM_S01_SunFlare
        `item_Name${name}_SCItem`,             // item_NamePOWR_ACOM_S01_SunFlare_SCItem  
        `item_Name_${name}`,                   // item_Name_Carryable_2H...
        `item_Name${name?.toLowerCase()}`,     // lowercase
        `item_Name_${name?.toLowerCase()}`,    // item_Name_ccc_medium_armor...
        `item_name${name}_SCItem`,             // lowercase item_name prefix
      )
      
      // Handle manufacturer prefixes that need to be UPPERCASE in localization (e.g., gmni -> GMNI)
      if (name) {
        const parts = name.split('_')
        if (parts.length > 1) {
          const upperMfgName = parts[0].toUpperCase() + '_' + parts.slice(1).join('_')
          locKeyPatterns.push(`item_Name${upperMfgName}`)
          locKeyPatterns.push(`item_Name${upperMfgName}_SCItem`)
        }
        // Handle variant suffixes like _blue_gold -> _blue_gold_01
        if (name.includes('_blue_gold') && !name.endsWith('_01')) {
          locKeyPatterns.push(`item_Name${name}_01`)
        }
      }
      
      // Try with uppercase manufacturer prefix (e.g., GRIN_utility_medium_arms)
      if (name) {
        const parts = name.split('_')
        if (parts.length > 1) {
          // Uppercase just the manufacturer prefix
          const upperMfg = parts[0].toUpperCase() + '_' + parts.slice(1).join('_')
          locKeyPatterns.push(`item_Name_${upperMfg}`)
        }
        
        // For BP_ prefixed items (blueprints), try without BP_ prefix
        if (name.toUpperCase().startsWith('BP_')) {
          const withoutBP = name.substring(3) // Remove "BP_"
          locKeyPatterns.push(`item_Name${withoutBP}`)
          // Also try with different casing (LaserScattergun vs LaserScatterGun)
          const fixedCase = withoutBP.replace(/scattergun/i, 'Scattergun')
          locKeyPatterns.push(`item_Name${fixedCase}`)
        }
        
        // Handle common typos in localization (e.g., Idirs vs Idris)
        if (name.includes('Idris')) {
          locKeyPatterns.push(`item_Name${name.replace('Idris', 'Idirs')}`)
        }
        
        // Handle _TEMP suffix items
        if (name.includes('_TEMP')) {
          locKeyPatterns.push(`item_Name${name.replace('_TEMP', '')}`)
          locKeyPatterns.push(`item_Name_${name.replace('_TEMP', '')}`)
        }
        
        // Handle Lite/Lite suffix patterns (RADR_CHCO_S02_BroadSpec_Lite -> RADR_CHCO_S02_BroadSpec)
        if (name.includes('_Lite') || name.includes('Lite')) {
          locKeyPatterns.push(`item_Name_${name.replace(/_?Lite/i, '')}`)
          locKeyPatterns.push(`item_Name${name.replace(/_?Lite/i, '')}`)
        }
        
        // Handle typos like BroudSpec vs BroadSpec
        if (name.includes('Broud')) {
          locKeyPatterns.push(`item_Name_${name.replace('Broud', 'Broad')}`)
        }
        
        // Handle case variations (e.g., ScatterGun vs Scattergun, QuadraCell vs Quadracell)
        const lowerCaseFixed = name.replace(/ScatterGun/g, 'Scattergun').replace(/Quadracell/g, 'QuadraCell')
        if (lowerCaseFixed !== name) {
          locKeyPatterns.push(`item_Name${lowerCaseFixed}`)
          locKeyPatterns.push(`item_Name_${lowerCaseFixed}`)
        }
        
        // Handle QDRV vs QRDV typo in localization + case variations
        if (name.includes('QDRV')) {
          const fixed = name.replace('QDRV', 'QRDV')
          locKeyPatterns.push(`item_Name_${fixed}`)
          // Also handle FoxFire -> Foxfire case
          locKeyPatterns.push(`item_Name_${fixed.replace(/FoxFire/i, 'Foxfire')}`)
          locKeyPatterns.push(`item_Name_${fixed.replace(/LightFire/i, 'Lightfire')}`)
        }
        
        // Handle underscore variations in radar names (SNS_R6x vs SNSR6x)
        if (name.includes('SNS_')) {
          locKeyPatterns.push(`item_Name_${name.replace('SNS_', 'SNS')}`)
        }
        
        // Handle typos like Capstan vs Capston
        if (name.includes('Capstan')) {
          locKeyPatterns.push(`item_Name_${name.replace('Capstan', 'Capston')}`)
        }
        
        // Handle size variations (S00 might be S01 in localization)
        if (name.includes('_S00_')) {
          locKeyPatterns.push(`item_Name_${name.replace('_S00_', '_S01_')}`)
        }
        
        // Handle manufacturer typos (GRNO vs GRNP)
        if (name.includes('GRNO')) {
          locKeyPatterns.push(`item_Name_${name.replace('GRNO', 'GRNP')}`)
        }
        
        // Handle VB80112 vs V80112 radar typo
        if (name.includes('VB80112')) {
          locKeyPatterns.push(`item_Name_${name.replace('VB80112', 'V80112')}`)
        }
        
        // Handle BroudSpec -> BroadSpec but also try without Lite suffix
        if (name.includes('BroudSpec')) {
          const fixed = name.replace('BroudSpec', 'FullSpecMax')
          locKeyPatterns.push(`item_Name_${fixed}`)
        }
      }
    }
    
    for (const key of locKeyPatterns) {
      if (key && localization[key]) {
        blueprintName = localization[key]
        break
      }
      // Try case-insensitive lookup
      if (key && localization._lowerMap?.[key.toLowerCase()]) {
        blueprintName = localization._lowerMap[key.toLowerCase()]
        break
      }
    }

    // Prefer canonical base names over *_01_01_01 variant labels (Woodland, Base, etc.)
    const canonicalBaseName = resolveCanonicalBaseBlueprintName(internalName, localization)
    if (canonicalBaseName) {
      blueprintName = canonicalBaseName
    }
    
    // Special handling for vehicle components with manufacturer prefixes (COOL_, POWR_, QDRV_, SHLD_, RADR_)
    // In-game names are just the product name, e.g., "Broadspec Go" not "ChengCo broadspecgo Radar (S00)"
    if (!blueprintName && internalName) {
      // Helper to format product names like "broadspecgo" -> "Broadspec Go"
      const formatProductName = (rawName) => {
        let name = rawName.toLowerCase()
        
        // Known product name mappings (internal -> display) - using hyphen format like game
        const knownNames = {
          'broadspecgo': 'BroadSpec-Go',
          'broadspeclite': 'Broadspec-Lite',
          'broadspec': 'BroadSpec',
          'broudspec': 'BroadSpec',
          'broadspecmax': 'BroadSpec-Max',
          'broadspec_lite': 'Broadspec-Lite',
          'fullspecgo': 'FullSpec-Go',
          'fullspeclite': 'FullSpec-Lite',
          'fullspec': 'FullSpec',
          'fullspecmax': 'FullSpec-Max',
          'observergo': 'Observer-Go',
          'observerlite': 'Observer-Lite',
          'observer': 'Observer',
          'observermax': 'Observer-Max',
          'surveyorgo': 'Surveyor-Go',
          'surveyorlite': 'Surveyor-Lite',
          'surveyor': 'Surveyor',
          'surveyormax': 'Surveyor-Max',
          'surveyormax_temp': 'Surveyor-Max',
          // Coolers
          'iceplunge': 'Iceplunge',
          'quickcool': 'Quickcool',
          'zerorush': 'Zerorush',
          'absolutezero': 'Absolute Zero',
          'icedive': 'Icedive',
          'thermalcore': 'Thermalcore',
          'cryostar': 'Cryostar',
          'frostbite': 'Frostbite',
          'snowblind': 'Snowblind',
          'blizzard': 'Blizzard',
          'avalanche': 'Avalanche',
          'glacier': 'Glacier',
          'nordictundra': 'Nordic Tundra',
          'polarwind': 'Polar Wind',
          'ultraflow': 'Ultraflow',
          'bracer': 'Bracer',
          'wen': 'Wen',
          'wen_caledonia': 'Wen Caledonia',
          // Shields
          'forcewall': 'Forcewall',
          'shadebloom': 'Shadebloom',
          'shimmer': 'Shimmer',
          'guardian': 'Guardian',
          'bulwark': 'Bulwark',
          'rampart': 'Rampart',
          'mirage': 'Mirage',
          'palisade': 'Palisade',
          'secureshield': 'Secureshield',
          'stopnik': 'Stopnik',
          'sukoran': 'Sukoran',
          'umbrapoise': 'Umbra Poise',
          // Power plants
          'js300': 'JS-300',
          'js400': 'JS-400',
          'regulus': 'Regulus',
          'bolide': 'Bolide',
          'quadracell': 'Quadracell',
          'fierell': 'Fierell',
          'genoa': 'Genoa',
          'slipstream': 'Slipstream',
          'maelstrom': 'Maelstrom',
          // Quantum drives  
          'beacon': 'Beacon',
          'expedition': 'Expedition',
          'yeager': 'Yeager',
          'vk00': 'VK-00',
          'atlas': 'Atlas',
          'voyage': 'Voyage',
          'odyssey': 'Odyssey',
          'crossfield': 'Crossfield',
          'vanguard': 'Vanguard',
          'pontes': 'Pontes',
          'goliath': 'Goliath',
          'v80111': 'V801-11',
          'vb80112': 'V801-12',
          'v80112': 'V801-12',
          // Generic fallback processing for unknown names
        }
        
        // Check for known name
        if (knownNames[name]) {
          return knownNames[name]
        }
        
        // Fallback: split on common suffix boundaries and title case
        // Insert space before common suffixes: Go, Lite, Max, Pro, XL
        name = name.replace(/(go|lite|max|pro|xl)$/i, ' $1')
        // Insert spaces at camelCase boundaries
        name = name.replace(/([a-z])([A-Z])/g, '$1 $2')
        // Clean up and title case
        name = name.replace(/\s+/g, ' ').trim()
        name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        // Fix common abbreviations
        name = name.replace(/\b(Xl|Js|Vk|Em)\b/gi, m => m.toUpperCase())
        return name
      }
      
      // Handle alternate pattern like COOL_S04_CNOU_Pioneer
      const altMatch = internalName.match(/^(COOL|POWR|QDRV|SHLD|RADR)_S(\d+)_(\w+)_(.+)$/i)
      if (altMatch) {
        const [, type, size, mfg, name] = altMatch
        // Try localization first
        const keysToTry = [
          `item_Name${type}_${mfg}_S0${size}_${name}`,
          `item_Name${type.toUpperCase()}_${mfg.toUpperCase()}_S0${size}_${name}`,
        ]
        for (const k of keysToTry) {
          if (localization[k]) { blueprintName = localization[k]; break }
        }
        // Fallback: just use the product name
        if (!blueprintName) {
          blueprintName = formatProductName(name)
        }
      }
      
      const componentMatch = internalName.match(/^(COOL|POWR|QDRV|SHLD|RADR)_(\w+)_S(\d+)_(.+)$/i)
      if (componentMatch) {
        const [, type, mfg, size, name] = componentMatch
        const keysToTry = [
          `item_Name${type}_${mfg}_S0${size}_${name}`,
          `item_Name${type.toUpperCase()}_${mfg.toUpperCase()}_S0${size}_${name}`,
          `item_Name_${type}_${mfg}_S0${size}_${name}`,
          `item_Name_${type.toUpperCase()}_${mfg.toUpperCase()}_S0${size}_${name}`,
          // Try with _SCItem suffix
          `item_Name${type}_${mfg}_S0${size}_${name}_SCItem`,
          `item_name${type}_${mfg}_S0${size}_${name}_SCItem`,
          // Try without size padding
          `item_Name${type}_${mfg}_S${size}_${name}`,
          `item_Name_${type}_${mfg}_S${size}_${name}`,
        ]
        // Handle typos like Idirs vs Idris
        if (name.includes('Idris')) {
          keysToTry.push(`item_Name${type}_${mfg}_S0${size}_${name.replace('Idris', 'Idirs')}`)
        }
        for (const k of keysToTry) {
          if (localization[k]) { blueprintName = localization[k]; break }
        }
        
        // Fallback: just use the product name (like the game does)
        if (!blueprintName) {
          blueprintName = formatProductName(name)
        }
      }
    }
    
    // Special handling for Tractor Beams (wep_tractorbeam_s1_utility_1 -> GRIN_TractorBeam_002_S1_UT1)
    if (!blueprintName && internalName?.toLowerCase().includes('tractorbeam')) {
      const tbMatch = internalName.match(/wep_tractorbeam_s(\d+)_(military|utility)_(\d+)/i)
      if (tbMatch) {
        const [, size, type, variant] = tbMatch
        // Map to GRIN naming: UT1 = Utility 1, UT2 = Utility 2, Military = base
        const typeCode = type.toLowerCase() === 'utility' ? `UT${variant}` : ''
        const keysToTry = [
          `item_NameGRIN_TractorBeam_002_S${size}${typeCode ? '_' + typeCode : ''}`,
          `item_NameGRIN_TractorBeam_003_S${size}${typeCode ? '_' + typeCode : ''}`,
          `item_NameARGO_TractorBeam_S${size}`,
        ]
        for (const k of keysToTry) {
          if (localization[k]) { blueprintName = localization[k]; break }
        }
      }
    }
    
    // Special handling for Mining Lasers
    // Pattern: mining_laser_{mfg}_{model}_s{size} -> item_Mining_MiningLaser_{Manufacturer}_{ModelNum}_S{size}
    if (!blueprintName && internalName?.toLowerCase().startsWith('mining_laser_')) {
      const laserMatch = internalName.match(/mining_laser_(\w+)_(\w+)_s(\d+|v)/i)
      if (laserMatch) {
        const [, mfg, model, size] = laserMatch
        // Map internal manufacturer codes to localization names
        const mfgMap = {
          'grin': 'Greycat',
          'shin': 'Shubin',
          'drak': 'Drake',
          'thrm': 'Thermyte',
          'thcn': 'Thermyte'  // Thermyte Concern
        }
        // Map model names to localization model numbers
        const modelMap = {
          'arbor': 'Default',
          'lancet': '1',
          'hofstede': '1',
          'klein': '2',
          'impact': '1',
          'helix': '2',
          'golem': 'Default'
        }
        const locMfg = mfgMap[mfg.toLowerCase()] || mfg
        const locModel = modelMap[model.toLowerCase()] || 'Default'
        // S0 can be either _S0 or _SV in localization
        const locSize = size.toLowerCase() === 'v' ? 'SV' : `S${size}`
        const altSize = size === '0' ? 'SV' : null  // For S0, also try SV
        
        const keysToTry = [
          `item_Mining_MiningLaser_${locMfg}_${locModel}_${locSize}`,
          `item_Mining_MiningLaser_${locMfg}_Default_${locSize}`,
          `item_Name_Mining_MiningLaser_${locMfg}_${locModel}_${locSize}`,
        ]
        // For S0, also try SV variant
        if (altSize) {
          keysToTry.push(`item_Mining_MiningLaser_${locMfg}_${locModel}_${altSize}`)
          keysToTry.push(`item_Mining_MiningLaser_${locMfg}_Default_${altSize}`)
        }
        for (const k of keysToTry) {
          if (localization[k]) { blueprintName = localization[k]; break }
          // Try case-insensitive
          if (localization._lowerMap?.[k.toLowerCase()]) {
            blueprintName = localization._lowerMap[k.toLowerCase()]
            break
          }
        }
      }
    }
    
    // Special handling for Nozzles (Nozzle_FuelGiver_GRIN_NozzleFast)
    // Localization pattern: Nozzle_FuelGiver_{MFG}_Nozzle{Type}_Name
    // Also try entity class form: item_NameFuel_Nozzle_GRIN_NozzleVerySecure → "Harkin"
    if (!blueprintName && internalName?.toLowerCase().includes('nozzle_fuelgiver')) {
      const nozzleVariantLoc = {
        fast: 'Fast',
        secure: 'Secure',
        veryfast: 'VeryFast',
        verysecure: 'VerySecure',
        standard: 'Standard',
        expensivefast: 'ExpensiveFast',
        expensivesecure: 'ExpensiveSecure',
        mostexpensive: 'MostExpensive',
      }

      const nozzleSources = []
      const recordMatch = fullName?.match(/Nozzle_FuelGiver_(\w+)_Nozzle(\w+)/i)
      if (recordMatch) {
        nozzleSources.push({ mfg: recordMatch[1].toUpperCase(), variant: recordMatch[2] })
      }
      const internalMatch = internalName.match(/nozzle_fuelgiver_(\w+)_nozzle(\w+)/i)
      if (internalMatch) {
        const variantKey = internalMatch[2].toLowerCase()
        nozzleSources.push({
          mfg: internalMatch[1].toUpperCase(),
          variant: nozzleVariantLoc[variantKey] || internalMatch[2],
        })
      }
      if (entityClass) {
        const entityMatch = entityClass.match(/fuel_nozzle_(\w+)_nozzle(\w+)/i)
        if (entityMatch) {
          const variantKey = entityMatch[2].toLowerCase()
          const locVariant = nozzleVariantLoc[variantKey] || entityMatch[2]
          const locClass = `Fuel_Nozzle_${entityMatch[1].toUpperCase()}_Nozzle${locVariant}`
          const entityKeys = [
            `item_Name${locClass}`,
            `item_Name_${locClass}`,
          ]
          for (const k of entityKeys) {
            if (localization[k]) { blueprintName = localization[k]; break }
            if (localization._lowerMap?.[k.toLowerCase()]) {
              blueprintName = localization._lowerMap[k.toLowerCase()]
              break
            }
          }
          if (!blueprintName) {
            nozzleSources.push({ mfg: entityMatch[1].toUpperCase(), variant: locVariant })
          }
        }
      }

      if (!blueprintName) {
        for (const { mfg, variant } of nozzleSources) {
          const keysToTry = [
            `Nozzle_FuelGiver_${mfg}_Nozzle${variant}_Name`,
            `Nozzle_FuelGiver_${mfg}_Nozzle${variant.toLowerCase()}_Name`,
            `item_Name_Nozzle_FuelGiver_${mfg}_Nozzle${variant}`,
            `item_NameFuel_Nozzle_${mfg}_Nozzle${variant}`,
            `item_Name_Fuel_Nozzle_${mfg}_Nozzle${variant}`,
          ]
          for (const k of keysToTry) {
            if (localization[k]) { blueprintName = localization[k]; break }
            if (localization._lowerMap?.[k.toLowerCase()]) {
              blueprintName = localization._lowerMap[k.toLowerCase()]
              break
            }
          }
          if (blueprintName) break
        }
      }

      // Last resort: generic manufacturer + variant label (avoid for reward blueprints when possible)
      if (!blueprintName) {
        const fallbackMatch = internalMatch || recordMatch
        if (fallbackMatch) {
          const mfg = (fallbackMatch[1] || '').toUpperCase()
          const variantKey = (fallbackMatch[2] || '').toLowerCase()
          const mfgNames = { GRIN: 'Greycat', MISC: 'MISC', SHIN: 'Shubin' }
          const variantNames = {
            fast: 'Fast', secure: 'Secure', veryfast: 'Very Fast', verysecure: 'Very Secure',
            standard: 'Standard', expensivefast: 'Premium Fast', expensivesecure: 'Premium Secure',
            mostexpensive: 'Premium',
          }
          blueprintName = `${mfgNames[mfg] || mfg} ${variantNames[variantKey] || fallbackMatch[2]} Nozzle`
        }
      }
    }
    
    // Special handling for Salvage Modifiers - use proper localization keys
    if (!blueprintName && internalName?.toLowerCase().includes('salvage_modifier')) {
      // Map internal names to localization keys (using lowercase for matching)
      const scraperNameMap = {
        'salvage_modifier_scraper_small': 'item_scraper_GRIN_Small_Name',
        'salvage_modifier_scraper_medium': 'item_scraper_GRIN_Standard_Name',
        'salvage_modifier_scraper_large': 'item_scraper_GRIN_Large_Name',
        'salvage_modifier_scraper_salvation_small': 'item_scraper_GRIN_Small_Name',  // Reclaimer variant
        'salvage_modifier_scraper_salvation_medium': 'item_scraper_GRIN_Standard_Name',
        'salvage_modifier_scraper_salvation_large': 'item_scraper_GRIN_Large_Name',  // Reclaimer variant
      }
      const locKey = scraperNameMap[internalName.toLowerCase()]
      if (locKey && localization[locKey]) {
        const baseName = localization[locKey]
        // Add Reclaimer prefix for Salvation variants
        if (internalName.includes('Salvation')) {
          blueprintName = `Reclaimer ${baseName}`
        } else {
          blueprintName = baseName
        }
      }
    }
    
    // Special handling for armor items with complex naming patterns
    // Pattern: {mfg}_armor_{weight}_{slot}_{variant} or {mfg}_{type}_armor_{slot}_{variant}
    if (!blueprintName) {
      const nameLower = (internalName || '').toLowerCase()
      const MFG_UPPER = (internalName || '').split('_')[0]?.toUpperCase() || ''
      
      // Helper to get slot display name
      const getSlotName = (s) => {
        const map = { arms: 'Arms', core: 'Core', helmet: 'Helmet', legs: 'Legs', backpack: 'Backpack', suit: 'Suit' }
        return map[s] || s.charAt(0).toUpperCase() + s.slice(1)
      }
      
      // Try armor-specific patterns
      // e.g., cds_armor_heavy_arms_01_01_01 -> try item_Name_cds_heavy_armor_01_arms
      const armorMatch = nameLower.match(/^(\w+?)_(?:legacy_)?armor_(\w+?)_(\w+?)_(\d+)_(\d+)_(\d+)/)
      if (armorMatch) {
        const [, mfg, weight, slot, v1, v2, v3] = armorMatch
        const keysToTry = [
          `item_Name_${mfg}_armor_${weight}_${slot}_${v1}_${v2}_${v3}`,
          `item_Name_${MFG_UPPER}_armor_${weight}_${slot}_${v1}_${v2}_${v3}`,
          `item_Name_${mfg}_${weight}_armor_${v1}_${slot}`,
          `item_Name_${mfg}_${weight}_armor_0${v1}_${slot}`,
        ]
        for (const k of keysToTry) {
          if (localization[k]) { blueprintName = localization[k]; break }
        }
        
        // Try using short name + slot
        if (!blueprintName) {
          const shortKeys = [
            `item_Name_${mfg}_armor_${weight}_0${v1}_short`,
            `item_Name_${mfg}_armor_${weight}_${v1}_short`,
            `item_Name_${mfg}_${weight}_armor_0${v1}_short`,
            `item_Name_${mfg}_armor_${weight}_armor_0${v1}_short`,
          ]
          for (const sk of shortKeys) {
            if (localization[sk]) {
              blueprintName = `${localization[sk]} ${getSlotName(slot)}`
              break
            }
          }
        }
      }
      
      // Try {mfg}_{type}_{weight}_{slot} patterns (e.g., grin_utility_medium_arms, qrt_combat_medium_arms)
      const typeMatch = nameLower.match(/^(\w+?)_(combat|utility|env|specialist)_(\w+?)_(\w+?)_(\d+)_(\d+)_(\d+)/)
      if (!blueprintName && typeMatch) {
        const [, mfg, type, weight, slot, v1, v2, v3] = typeMatch
        const keysToTry = [
          `item_Name_${mfg}_${type}_${weight}_${slot}_${v1}_${v2}_${v3}`,
          `item_Name_${MFG_UPPER}_${type}_${weight}_${slot}_${v1}_${v2}_${v3}`,
        ]
        for (const k of keysToTry) {
          if (localization[k]) { blueprintName = localization[k]; break }
        }
        
        // Try short name
        if (!blueprintName) {
          const shortKeys = [
            `item_Name_${mfg}_${type}_${weight}_0${v1}_short`,
            `item_Name_${mfg}_${type}_${weight}_armor_0${v1}_short`,
            `item_Name_${MFG_UPPER}_${type}_${weight}_0${v1}_short`,
          ]
          for (const sk of shortKeys) {
            if (localization[sk]) {
              blueprintName = `${localization[sk]} ${getSlotName(slot)}`
              break
            }
          }
        }
      }
      
      // Try legacy armor patterns: cds_legacy_armor_heavy_arms_01_01_01
      const legacyMatch = nameLower.match(/^(\w+?)_legacy_armor_(\w+?)_(\w+?)_(\d+)_(\d+)_(\d+)/)
      if (!blueprintName && legacyMatch) {
        const [, mfg, weight, slot, v1, v2, v3] = legacyMatch
        const keysToTry = [
          `item_Name_${mfg}_legacy_armor_${weight}_${slot}_${v1}_${v2}_${v3}`,
          `item_Name_${MFG_UPPER}_legacy_armor_${weight}_${slot}_${v1}_${v2}_${v3}`,
        ]
        for (const k of keysToTry) {
          if (localization[k]) { blueprintName = localization[k]; break }
        }
      }
      
      // Try undersuit patterns: cds_undersuit_01_01_01
      const undersuitMatch = nameLower.match(/^(\w+?)_undersuit(?:_helmet)?_(\d+)_(\d+)_(\d+)/)
      if (!blueprintName && undersuitMatch) {
        const [full, mfg, v1, v2, v3] = undersuitMatch
        const isHelmet = full.includes('helmet')
        const keysToTry = [
          `item_Name_${MFG_UPPER}_Undersuit_Armor_${v1}_${v2}_${v3}`,
          `item_Name_${mfg}_undersuit_${v1}_${v2}_${v3}`,
          `item_Name_${MFG_UPPER}_undersuit_${v1}_${v2}_${v3}`,
        ]
        for (const k of keysToTry) {
          if (localization[k]) { blueprintName = localization[k]; break }
        }
      }
      
      // Try reversed patterns: ksar_armor_light_arms -> ksar_light_armor_arms
      // Also try dropping _armor_ entirely: srvl_armor_heavy_arms -> srvl_heavy_arms
      // Pattern: {mfg}_armor_{weight}_{slot} -> {mfg}_{weight}_armor_{slot} or {mfg}_{weight}_{slot}
      const reversedMatch = nameLower.match(/^(\w+?)_armor_(\w+?)_(\w+?)_(\d+)_(\d+)_(\d+)/)
      if (!blueprintName && reversedMatch) {
        const [, mfg, weight, slot, v1, v2, v3] = reversedMatch
        const keysToTry = [
          // Try without _armor_ (e.g., srvl_heavy_arms_01)
          `item_Name_${mfg}_${weight}_${slot}_0${v1}`,
          `item_Name_${mfg}_${weight}_${slot}_${v1}`,
          // Try with _armor_ reordered
          `item_Name_${mfg}_${weight}_armor_${slot}_0${v1}`,
          `item_Name_${mfg}_${weight}_armor_${slot}_${v1}`,
          `item_Name_${mfg}_${weight}_armor_${slot}_${v1}_${v2}_${v3}`,
        ]
        for (const k of keysToTry) {
          if (localization[k]) { blueprintName = localization[k]; break }
        }
        
        // Try using short name from srvl_heavy_ar_short pattern
        if (!blueprintName) {
          const shortKeys = [
            `item_Name_${mfg}_${weight}_ar_short`,
            `item_Name_${mfg}_${weight}_armor_0${v1}_short`,
          ]
          for (const sk of shortKeys) {
            if (localization[sk]) {
              blueprintName = `${localization[sk]} ${getSlotName(slot)}`
              break
            }
          }
        }
      }
      
      // Try env armor patterns: clda_env_armor_heavy_helmet -> clda_env_heavy_helmet
      const envMatch = nameLower.match(/^(\w+?)_env_armor_(\w+?)_(\w+?)_(\d+)/)
      if (!blueprintName && envMatch) {
        const [, mfg, weight, slot, v1] = envMatch
        const keysToTry = [
          `item_Name_${mfg}_env_${weight}_${slot}_0${v1}`,
          `item_Name_${mfg}_env_${weight}_${slot}_${v1}`,
          `item_Name_${mfg}_env_armor_${weight}_${slot}_0${v1}`,
        ]
        for (const k of keysToTry) {
          if (localization[k]) { blueprintName = localization[k]; break }
        }
        // Try short name
        if (!blueprintName) {
          const shortKey = `item_Name_${mfg}_env_armor_0${v1}_short`
          if (localization[shortKey]) {
            blueprintName = `${localization[shortKey]} ${getSlotName(slot)}`
          }
        }
      }
      
      // Try 9tails variants: _01_9tails_01 -> _01_01_9tails01
      // Blueprint: cds_legacy_armor_heavy_arms_01_9tails_01
      // Localization: item_Name_cds_legacy_armor_heavy_arms_01_01_9tails01
      const ninetailsMatch = nameLower.match(/^(.+?)_(\d+)_9tails_(\d+)$/)
      if (!blueprintName && ninetailsMatch) {
        const [, prefix, v1, v2] = ninetailsMatch
        // v1 and v2 are already "01" format, so don't prepend 0
        const keysToTry = [
          // _01_9tails_01 -> _01_01_9tails01
          `item_Name_${prefix}_${v1}_${v2}_9tails${v2}`,
          `item_Name_${prefix}_${v1}_01_9tails${v2}`,
        ]
        for (const k of keysToTry) {
          if (localization[k]) { blueprintName = localization[k]; break }
        }
      }
      
      // Try undersuit patterns: ksar_undersuit_01_01_01 -> ksar_undersuit_01
      const undersuitMatch2 = nameLower.match(/^(\w+?)_undersuit(?:_helmet)?_(\d+)_(\d+)_(\d+)$/)
      if (!blueprintName && undersuitMatch2) {
        const [full, mfg, v1] = undersuitMatch2
        const isHelmet = full.includes('helmet')
        const keysToTry = isHelmet ? [
          `item_Name_${mfg}_undersuit_helmet_0${v1}`,
          `item_Name_${mfg}_undersuit_helmet_${v1}`,
        ] : [
          `item_Name_${mfg}_undersuit_0${v1}`,
          `item_Name_${mfg}_undersuit_${v1}`,
        ]
        for (const k of keysToTry) {
          if (localization[k]) { blueprintName = localization[k]; break }
        }
      }
      
      // Try CCC medium armor helmet: ccc_medium_armor_helmet_01_01_01 -> ccc_medium_armor_helmet_01
      const cccHelmetMatch = nameLower.match(/^(ccc)_medium_armor_helmet_(\d+)_(\d+)_(\d+)$/)
      if (!blueprintName && cccHelmetMatch) {
        const [, mfg, v1] = cccHelmetMatch
        const keysToTry = [
          `item_Name_${mfg}_medium_armor_helmet_0${v1}`,
          `item_Name_${mfg}_medium_armor_helmet_${v1}`,
        ]
        for (const k of keysToTry) {
          if (localization[k]) { blueprintName = localization[k]; break }
        }
      }
      
      // Try RRS specialist with unusual version numbers (drops last version)
      const rrsSpecialistMatch = nameLower.match(/^(rrs)_specialist_(\w+?)_(\w+?)_(\d+)_(\d+)_(\d+)$/)
      if (!blueprintName && rrsSpecialistMatch) {
        const [, mfg, weight, slot, v1, v2, v3] = rrsSpecialistMatch
        const keysToTry = [
          `item_Name_${mfg}_specialist_${weight}_${slot}_0${v1}_0${v2}`,
          `item_Name_${mfg}_specialist_${weight}_${slot}_${v1}_${v2}`,
        ]
        for (const k of keysToTry) {
          if (localization[k]) { blueprintName = localization[k]; break }
        }
      }
      
      // Try CDS armor light helmet pattern
      const cdsLightHelmetMatch = nameLower.match(/^(cds)_armor_light_helmet_(\d+)_(\d+)_(\d+)$/)
      if (!blueprintName && cdsLightHelmetMatch) {
        const [, mfg, v1, v2, v3] = cdsLightHelmetMatch
        // Try legacy pattern: cds_legacy_armor_light_helmet_01_01_01
        const keysToTry = [
          `item_Name_${mfg}_legacy_armor_light_helmet_0${v1}_0${v2}_0${v3}`,
          `item_Name_${mfg}_legacy_armor_light_helmet_${v1}_${v2}_${v3}`,
        ]
        for (const k of keysToTry) {
          if (localization[k]) { blueprintName = localization[k]; break }
        }
      }
      
      // Try specialist armor patterns: qrt_specialist_medium_arms -> qrt_specialist_heavy_arms
      const specialistMatch = nameLower.match(/^(\w+?)_specialist_(\w+?)_(\w+?)_(\d+)_(\d+)_(\d+)/)
      if (!blueprintName && specialistMatch) {
        const [, mfg, weight, slot, v1, v2, v3] = specialistMatch
        const keysToTry = [
          `item_Name_${mfg}_specialist_${weight}_${slot}_0${v1}_0${v2}_0${v3}`,
          `item_Name_${mfg}_specialist_${weight}_${slot}_${v1}_${v2}_${v3}`,
          `item_Name_${mfg}_specialist_heavy_${slot}_0${v1}_0${v2}_0${v3}`,  // Some medium might map to heavy
          `item_Name_${mfg}_specialist_heavy_${slot}_${v1}_${v2}_${v3}`,
        ]
        for (const k of keysToTry) {
          if (localization[k]) { blueprintName = localization[k]; break }
        }
        // Try short name
        if (!blueprintName) {
          const shortKeys = [
            `item_Name_${mfg}_specialist_${weight}_armor_0${v1}_short`,
            `item_Name_${mfg}_specialist_heavy_armor_0${v1}_short`,
          ]
          for (const sk of shortKeys) {
            if (localization[sk]) {
              blueprintName = `${localization[sk]} ${getSlotName(slot)}`
              break
            }
          }
        }
      }
    }
    
    // Generic last-chance lookup: read the entity SCItem's own display name
    // (AttachDef.Localization.Name). Catches items whose loc key can't be
    // derived from the internal name (e.g. mining_laser_drak_golem_s1 →
    // @item_Mining_MiningLaser_Drake_Default_S0 = "Pitman Mining Laser").
    if (!blueprintName && (entityClass || internalName)) {
      const entityFile = resolveEntityFile(entityClass || internalName, entityPathIndex)
      const entityJson = entityFile ? readJson(entityFile) : null
      const attachComp = (entityJson?._RecordValue_?.Components ?? []).find(
        (comp) => comp?._Type_ === 'SAttachableComponentParams'
      )
      const nameKey = attachComp?.AttachDef?.Localization?.Name
      if (nameKey && nameKey !== '@LOC_PLACEHOLDER' && nameKey !== '@LOC_EMPTY') {
        const resolved = resolveLocalization(nameKey, localization)
        if (resolved && !resolved.startsWith('@')) {
          blueprintName = resolved
        }
      }
    }

    // Fallback: generate from internal name if not in localization
    // Track this for priority rule: isReward=true items MUST have localization
    let usedFallbackName = false
    if (!blueprintName) {
      usedFallbackName = true
      blueprintName = internalName
        .replace(/_/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase()) // Title case
        .replace(/(\d+)x(\d+)/gi, '$1x$2') // Fix dimensions like 2x2
        .trim()
    }

    // FPS armor slot/weight derived before final name validation
    let armorSlot = detectArmorSlotFromInternalName(internalName || entityClass)
    let armorWeight = null

    // Derive subtype from entityClass for filtering (pistol, rifle, cooler, etc.)
    let subtype = null
    const ecLower = (entityClass || '').toLowerCase()
    // FPS weapon types
    if (category === 'FPSWeapons') {
      for (const t of ['crossbow', 'hmg', 'lmg', 'pistol', 'rifle', 'shotgun', 'smg', 'sniper']) {
        if (ecLower.includes(`_${t}_`) || ecLower.includes(`_${t}`)) {
          subtype = t
          break
        }
      }
      if (!subtype && ecLower.includes('mag')) subtype = 'magazine'
      if (!subtype && ecLower.includes('frag')) subtype = 'grenade'
    }
    if (category === 'FPSArmours') {
      const nameForSlot = (internalName || entityClass || '').toLowerCase()
      if (ecLower.includes('flightsuit') || ecLower.includes('racer') || ecLower.includes('racing') || ecLower.includes('flight')) {
        armorWeight = 'flight'
      } else if (ecLower.includes('_superheavy_') || ecLower.includes('_superheavy')) {
        armorWeight = 'superheavy'
      } else if (ecLower.includes('_heavy_') || ecLower.includes('_heavy')) {
        armorWeight = 'heavy'
      } else if (ecLower.includes('_medium_') || ecLower.includes('_medium')) {
        armorWeight = 'medium'
      } else if (ecLower.includes('_light_') || ecLower.includes('_light') || ecLower.includes('undersuit')) {
        armorWeight = 'light'
      } else if (nameForSlot.startsWith('gys_')) {
        armorWeight = 'medium'
      }

      // Armor style subtype (standard, flightsuit, explorer, etc.) — not body slot
      const pathParts = legacyFilePath.split('\\').map(p => p.toLowerCase())
      const pathFilename = pathParts[pathParts.length - 1] || ''
      for (let i = 0; i < pathParts.length - 1; i++) {
        if (pathParts[i] === 'armour' && pathParts[i - 1] === 'fpsgear') {
          let style = pathParts[i + 1]?.replace('$', '')
          if (style === 'templates' && pathParts[i + 2]) style = pathParts[i + 2]
          if (style === 'combat') subtype = 'standard'
          else if (style === 'flightsuit') subtype = pathFilename.includes('_helmet') ? 'standard' : 'flightsuit'
          else subtype = style || 'standard'
          break
        }
      }
      if (!subtype) {
        const n = nameForSlot
        if (n.includes('explorer')) subtype = 'explorer'
        else if (n.includes('undersuit')) subtype = 'undersuit'
        else if (n.includes('stealth')) subtype = 'stealth'
        else if (n.includes('salvag')) subtype = 'salvager'
        else subtype = 'standard'
      }

      // Reconcile display name with body slot when generic localization bleed occurred
      if (armorSlot && blueprintName && !nameMatchesArmorSlot(blueprintName, armorSlot)) {
        const slotSafeName = resolveArmorBlueprintName(internalName, localization)
        if (slotSafeName) {
          blueprintName = slotSafeName
          usedFallbackName = false
        } else {
          blueprintName = appendArmorSlotToName(blueprintName, armorSlot)
        }
      }

      armorSlot = detectArmorSlotFromInternalName(internalName || entityClass, blueprintName) || armorSlot
    }
    // Vehicle component types - detect from internalName prefix
    if (category.startsWith('VehicleComponent')) {
      const nameLower = (internalName || '').toLowerCase()
      if (nameLower.startsWith('cool_') || nameLower.includes('cooler')) subtype = 'cooler'
      else if (nameLower.startsWith('powr_') || nameLower.includes('powerplant')) subtype = 'powerplant'
      else if (nameLower.startsWith('shld_') || nameLower.includes('shield')) subtype = 'shield'
      else if (nameLower.startsWith('qdrv_') || nameLower.includes('quantum')) subtype = 'quantumdrive'
      else if (nameLower.startsWith('radr_') || nameLower.includes('radar')) subtype = 'radar'
      else if (nameLower.startsWith('mining_laser') || nameLower.includes('mininglaser')) subtype = 'mininglaser'
      else if (nameLower.startsWith('tractor_beam') || nameLower.includes('tractorbeam')) subtype = 'tractorbeam'
      else if (nameLower.includes('refuel') || nameLower.includes('fuel_') || nameLower.includes('fuelgiver') || nameLower.includes('nozzle')) subtype = 'refuelling'
      else if (nameLower.includes('salvage')) subtype = 'salvage'
    }
    // Vehicle weapon types - detect damage type from internal name
    if (category.startsWith('VehicleWeapons')) {
      const nameLower = internalName.toLowerCase()
      if (nameLower.includes('laser')) subtype = 'laser'
      else if (nameLower.includes('ballistic') || nameLower.includes('scattergun')) subtype = 'ballistic'
      else if (nameLower.includes('distortion')) subtype = 'distortion'
      else if (nameLower.includes('neutron')) subtype = 'neutron'
      else if (nameLower.includes('tachyon')) subtype = 'tachyon'
      else if (nameLower.includes('mass')) subtype = 'mass'
      else if (nameLower.includes('plasma')) subtype = 'plasma'
      else if (ecLower.includes('missile') || ecLower.includes('rack')) subtype = 'missile'
      else if (ecLower.includes('turret')) subtype = 'turret'
    }
    
    // Map category to the display format expected by the website
    let categoryName = category
    if (category.startsWith('VehicleComponent')) {
      const size = category.replace('VehicleComponent', '')
      categoryName = `Veh. Comp. ${size}`
    } else if (category.startsWith('VehicleWeapons')) {
      const size = category.replace('VehicleWeapons', '')
      categoryName = `Veh. Weapons ${size}`
    }
    // Magazines from FPSWeapons should be categorized as Ammo
    // Check entityClass for 'mag' since subtype is set to weapon type
    if (category === 'FPSWeapons' && ecLower.includes('_mag')) {
      categoryName = 'Ammo'
    }
    
    // Convert craftTimeMinutes to craftTime object for UI compatibility
    const totalMinutes = Math.round(craftTimeMinutes * 10) / 10
    const hours = Math.floor(totalMinutes / 60)
    const minutes = Math.floor(totalMinutes % 60)
    const seconds = Math.round((totalMinutes * 60) % 60)
    
    const craftTimeDisplay = { hours, minutes, seconds }
    
    const entityBaseStats = extractEntityBaseStats(
      entityClass || internalName,
      entityPathIndex,
      EXTRACTED_DATA,
      recordIndex
    )
    let vehicleBaseStats = null
    let armorBaseStats = null
    let weaponBaseStats = null
    if (entityBaseStats) {
      if (category === 'FPSArmours' || category.startsWith('Armor')) {
        armorBaseStats = entityBaseStats
      } else if (category === 'FPSWeapons' || category.startsWith('VehicleWeapons')) {
        weaponBaseStats = entityBaseStats
      } else if (category.startsWith('VehicleComponent')) {
        vehicleBaseStats = entityBaseStats
      } else {
        vehicleBaseStats = entityBaseStats
      }
    }
    
    blueprints.push({
      id: json._RecordId_,
      file: internalName,
      name: fullName,
      internalName,
      blueprintName,
      entityClass,
      category,
      categoryName,
      subtype,
      armorSlot,
      armorWeight,
      craftTimeMinutes: totalMinutes,
      craftTime: craftTimeDisplay,
      slots,
      ...(vehicleBaseStats ? { vehicleBaseStats } : {}),
      ...(armorBaseStats ? { armorBaseStats } : {}),
      ...(weaponBaseStats ? { weaponBaseStats } : {}),
      _usedFallbackName: usedFallbackName // Track for priority rule validation
    })
  }
  
  console.log(`  Parsed ${blueprints.length} blueprint definitions`)
  
  return blueprints
}

// ============================================================================
// MINING DATA PARSING
// ============================================================================

function parseMineableElements() {
  console.log('\n[3/7] Parsing mineable elements (ores/minerals)...')
  
  const elementFiles = findJsonFiles(EXPECTED_PATHS.mineableElements)
  if (elementFiles.length === 0) {
    validationIssues.push('No mineable element files found')
    return []
  }
  
  const elements = []
  
  for (const file of elementFiles) {
    if (file.includes('template')) continue // Skip templates
    
    const json = readJson(file)
    if (!json?._RecordValue_) continue
    
    const val = json._RecordValue_
    const recordName = json._RecordName_ || basename(file, '.json')
    
    // Extract resource type name
    let resourceName = recordName.replace('MineableElement.', '')
    if (val.resourceType?._RecordName_) {
      resourceName = val.resourceType._RecordName_.replace('ResourceType.', '')
    }
    
    elements.push({
      id: json._RecordId_,
      name: resourceName,
      recordName,
      instability: val.elementInstability || 0,
      resistance: val.elementResistance || 0,
      optimalWindowMidpoint: val.elementOptimalWindowMidpoint || 0.5,
      optimalWindowRandomness: val.elementOptimalWindowMidpointRandomness || 0,
      optimalWindowThinness: val.elementOptimalWindowThinness || 1,
      explosionMultiplier: val.elementExplosionMultiplier || 1,
      clusterFactor: val.elementClusterFactor || 1,
      isFPS: /_fps_/i.test(recordName),
      isGroundVehicle: /_groundvehicle_/i.test(recordName),
      isShip: !/_fps_|_groundvehicle_/i.test(recordName)
    })
  }
  
  console.log(`  Parsed ${elements.length} mineable elements`)
  
  return elements
}

function countMiningModulePorts(itemPortParams) {
  if (!itemPortParams?.Ports?.length) return 0
  return itemPortParams.Ports.filter((port) =>
    port.Types?.some((t) => t.Type === 'MiningModifier')
  ).length
}

function extractMiningModuleModifiers(components) {
  const stats = {
    powerMultiplier: 1,
    resistanceModifier: 0,
    optimalWindowModifier: 0,
    filterModifier: 0,
    instabilityModifier: 0,
    shatterDamageModifier: 0,
  }

  const modifierComp = components?.find(
    (c) => c?._Type_ === 'EntityComponentAttachableModifierParams'
  )
  if (!modifierComp?.modifiers?.length) return stats

  for (const mod of modifierComp.modifiers) {
    if (
      mod._Type_ === 'ItemWeaponModifiersParams' &&
      mod.showInUI &&
      mod.weaponModifier?.weaponStats?.damageMultiplier != null
    ) {
      stats.powerMultiplier = mod.weaponModifier.weaponStats.damageMultiplier
    }
    if (mod._Type_ === 'ItemMiningModifierParams' && mod.MiningLaserModifier) {
      const ml = mod.MiningLaserModifier
      if (ml.resistanceModifier?.value != null) {
        stats.resistanceModifier += ml.resistanceModifier.value
      }
      if (ml.optimalChargeWindowSizeModifier?.value != null) {
        stats.optimalWindowModifier += ml.optimalChargeWindowSizeModifier.value
      }
      if (ml.laserInstability?.value != null) {
        stats.instabilityModifier += ml.laserInstability.value
      }
      if (ml.shatterdamageModifier?.value != null) {
        stats.shatterDamageModifier += ml.shatterdamageModifier.value
      }
    }
    if (mod._Type_ === 'MiningFilterItemModifierParams') {
      const filterVal = mod.filterParams?.filterModifier?.value
      if (filterVal != null) stats.filterModifier += filterVal
    }
  }

  return stats
}

function parseMiningModules(localization = {}) {
  console.log('  Parsing mining modules...')

  const modulePath = join(
    EXTRACTED_DATA,
    EXPECTED_PATHS.scitems,
    'ships/utility/mining/miningarm'
  )
  if (!existsSync(modulePath)) {
    validationIssues.push('Missing miningarm path for mining modules')
    return []
  }

  const files = readdirSync(modulePath).filter(
    (f) =>
      f.endsWith('.json') &&
      (f.startsWith('mining_modules_passive_') || f.startsWith('mining_modules_active_'))
  )
  const modules = []

  for (const file of files) {
    const filePath = join(modulePath, file)
    const json = JSON.parse(readFileSync(filePath, 'utf-8'))
    if (!json?._RecordValue_?.Components) continue

    const recordName = (json._RecordName_ || file.replace('.json', '')).replace(
      'EntityClassDefinition.',
      ''
    )
    const kind = file.includes('_active_') ? 'active' : 'passive'

    let attachParams = null
    for (const comp of json._RecordValue_.Components) {
      if (comp?._Type_ === 'SAttachableComponentParams') attachParams = comp
    }

    const rawDisplayName = attachParams?.AttachDef?.Localization?.Name || recordName
    const displayName = resolveLocalization(rawDisplayName, localization) || recordName
    const size = attachParams?.AttachDef?.Size ?? 0
    const grade = attachParams?.AttachDef?.Grade ?? 0
    const modifierStats = extractMiningModuleModifiers(json._RecordValue_.Components)

    modules.push({
      id: json._RecordId_,
      name: recordName,
      displayName,
      kind,
      size,
      grade,
      ...modifierStats,
    })
  }

  modules.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'passive' ? -1 : 1
    return a.displayName.localeCompare(b.displayName)
  })

  console.log(`  Parsed ${modules.length} mining modules`)
  return modules
}

function extractMiningRockModifiers(components) {
  const stats = {
    resistanceModifier: 0,
    instabilityModifier: 0,
    optimalWindowModifier: 0,
    optimalWindowRateModifier: 0,
    clusterFactorModifier: 0,
    shatterDamageModifier: 0,
  }

  const modifierComp = components?.find(
    (c) => c?._Type_ === 'EntityComponentAttachableModifierParams'
  )
  const rockMod = modifierComp?.modifiers?.find(
    (m) => m._Type_ === 'ItemMineableRockModifierParams'
  )
  const ml = rockMod?.MiningLaserModifier
  if (!ml) return stats

  if (ml.resistanceModifier?.value != null) {
    stats.resistanceModifier = ml.resistanceModifier.value
  }
  if (ml.laserInstability?.value != null) {
    stats.instabilityModifier = ml.laserInstability.value
  }
  if (ml.optimalChargeWindowSizeModifier?.value != null) {
    stats.optimalWindowModifier = ml.optimalChargeWindowSizeModifier.value
  }
  if (ml.optimalChargeWindowRateModifier?.value != null) {
    stats.optimalWindowRateModifier = ml.optimalChargeWindowRateModifier.value
  }
  if (ml.clusterFactorModifier?.value != null) {
    stats.clusterFactorModifier = ml.clusterFactorModifier.value
  }
  if (ml.shatterdamageModifier?.value != null) {
    stats.shatterDamageModifier = ml.shatterdamageModifier.value
  }

  return stats
}

function gadgetDisplayNameFromRecord(recordName) {
  const cleaned = recordName.replace('EntityClassDefinition.', '')
  const match = cleaned.match(/^Mining_Gadget_[A-Z]+_(.+)$/i)
  if (!match) return cleaned
  return match[1].replace(/_/g, ' ')
}

function parseMiningGadgets(localization = {}) {
  console.log('  Parsing mining gadgets...')

  const gadgetPath = join(
    EXTRACTED_DATA,
    EXPECTED_PATHS.scitems,
    'weapons/devices'
  )
  if (!existsSync(gadgetPath)) {
    validationIssues.push('Missing weapons/devices path for mining gadgets')
    return []
  }

  const files = readdirSync(gadgetPath).filter(
    (f) => f.startsWith('mining_gadget_') && f.endsWith('.json')
  )
  const gadgets = []

  for (const file of files) {
    const filePath = join(gadgetPath, file)
    const json = JSON.parse(readFileSync(filePath, 'utf-8'))
    if (!json?._RecordValue_?.Components) continue

    const recordName = (json._RecordName_ || file.replace('.json', '')).replace(
      'EntityClassDefinition.',
      ''
    )

    let attachParams = null
    for (const comp of json._RecordValue_.Components) {
      if (comp?._Type_ === 'SAttachableComponentParams') attachParams = comp
    }

    const rawDisplayName = attachParams?.AttachDef?.Localization?.Name || recordName
    const displayName =
      resolveLocalization(rawDisplayName, localization) ||
      gadgetDisplayNameFromRecord(recordName)
    const modifierStats = extractMiningRockModifiers(json._RecordValue_.Components)

    gadgets.push({
      id: json._RecordId_,
      name: recordName,
      displayName,
      ...modifierStats,
    })
  }

  gadgets.sort((a, b) => a.displayName.localeCompare(b.displayName))
  console.log(`  Parsed ${gadgets.length} mining gadgets`)
  return gadgets
}

function parseMiningLasers(localization = {}) {
  console.log('  Parsing mining lasers...')
  
  const weaponPath = join(EXTRACTED_DATA, EXPECTED_PATHS.scitems, 'ships/weapons')
  if (!existsSync(weaponPath)) {
    validationIssues.push('Missing weapons path for mining lasers')
    return []
  }
  
  const files = readdirSync(weaponPath).filter(f => f.startsWith('mining_laser_') && f.endsWith('.json'))
  const lasers = []
  
  for (const file of files) {
    if (file.includes('template')) continue
    
    const filePath = join(weaponPath, file)
    const content = readFileSync(filePath, 'utf-8')
    const json = JSON.parse(content)
    
    if (!json?._RecordValue_?.Components) continue
    
    const recordName = json._RecordName_ || file.replace('.json', '')
    
    // Find mining laser params component
    let miningParams = null
    let attachParams = null
    let itemPortParams = null
    
    for (const comp of json._RecordValue_.Components) {
      if (!comp) continue
      if (comp._Type_ === 'SEntityComponentMiningLaserParams') {
        miningParams = comp
      }
      if (comp._Type_ === 'SAttachableComponentParams') {
        attachParams = comp
      }
      if (comp._Type_ === 'SItemPortContainerComponentParams') {
        itemPortParams = comp
      }
    }
    
    // Extract all numeric stats via regex (faster than deep traversal)
    const damageMatch = content.match(/"DamageEnergy":\s*([\d.]+)/)
    const fullRangeMatch = content.match(/"fullDamageRange":\s*([\d.]+)/)
    const zeroRangeMatch = content.match(/"zeroDamageRange":\s*([\d.]+)/)
    const extractionMatch = content.match(/"extractionEfficiency":\s*([\d.]+)/)
    
    // Extract and resolve display name
    const rawDisplayName = attachParams?.AttachDef?.Localization?.Name || recordName.replace('EntityClassDefinition.', '')
    const displayName = resolveLocalization(rawDisplayName, localization) || rawDisplayName
    
    const size = attachParams?.AttachDef?.Size || 0
    
    lasers.push({
      id: json._RecordId_,
      name: recordName.replace('EntityClassDefinition.', ''),
      displayName,
      size,
      moduleSlotCount: countMiningModulePorts(itemPortParams),
      // Power stats (the main "damage" value for mining)
      laserPower: damageMatch ? parseFloat(damageMatch[1]) : 0,
      // Range stats
      optimalRange: fullRangeMatch ? parseFloat(fullRangeMatch[1]) : 0,
      maxRange: zeroRangeMatch ? parseFloat(zeroRangeMatch[1]) : 0,
      // Extraction efficiency
      extractionEfficiency: extractionMatch ? parseFloat(extractionMatch[1]) : 1.0,
      // Mining modifiers
      instabilityModifier: miningParams?.miningLaserModifiers?.laserInstability?.value || 0,
      resistanceModifier: miningParams?.miningLaserModifiers?.resistanceModifier?.value || 0,
      optimalWindowModifier: miningParams?.miningLaserModifiers?.optimalChargeWindowSizeModifier?.value || 0,
      filterModifier: miningParams?.filterParams?.filterModifier?.value || 0,
      throttleLerpSpeed: miningParams?.throttleLerpSpeed || 0,
      throttleMinimum: miningParams?.throttleMinimum || 0,
      tags: attachParams?.AttachDef?.Tags || ''
    })
  }
  
  console.log(`  Parsed ${lasers.length} mining lasers`)
  
  return lasers
}

// ============================================================================
// COMPONENT PARSING
// ============================================================================

function parseShipComponents(localization = {}) {
  console.log('\n[4/7] Parsing ship components...')
  
  const componentTypes = ['cooler', 'powerplant', 'shieldgenerator', 'quantumdrive']
  const components = []
  
  for (const compType of componentTypes) {
    const compPath = join(EXTRACTED_DATA, EXPECTED_PATHS.scitems, 'ships', compType)
    if (!existsSync(compPath)) {
      console.log(`  Warning: ${compType} path not found`)
      continue
    }
    
    const files = readdirSync(compPath).filter(f => f.endsWith('.json'))
    
    for (const file of files) {
      const filePath = join(compPath, file)
      const content = readFileSync(filePath, 'utf-8')
      const json = JSON.parse(content)
      
      if (!json?._RecordValue_?.Components) continue
      
      const recordName = json._RecordName_ || file.replace('.json', '')
      
      let attachParams = null
      let typeSpecificParams = null
      
      for (const comp of json._RecordValue_.Components) {
        if (!comp) continue
        if (comp._Type_ === 'SAttachableComponentParams') {
          attachParams = comp
        }
        // Type-specific params
        if (comp._Type_ === 'SCItemCoolerParams') {
          typeSpecificParams = { type: 'Cooler', ...comp }
        }
        if (comp._Type_ === 'SCItemPowerPlantParams') {
          typeSpecificParams = { type: 'PowerPlant', ...comp }
        }
        if (comp._Type_ === 'SCItemShieldGeneratorParams') {
          typeSpecificParams = { type: 'ShieldGenerator', ...comp }
        }
        if (comp._Type_ === 'SCItemQuantumDriveParams') {
          typeSpecificParams = { type: 'QuantumDrive', ...comp }
        }
      }
      
      if (!attachParams) continue
      
      const def = attachParams.AttachDef || {}
      const rawDisplayName = def.Localization?.Name || recordName
      const mfr = resolveManufacturer(def.Manufacturer, localization)
      
      components.push({
        id: json._RecordId_,
        name: recordName.replace('EntityClassDefinition.', ''),
        type: compType,
        displayName: resolveLocalization(rawDisplayName, localization) || rawDisplayName,
        size: def.Size || 0,
        grade: def.Grade || 0,
        manufacturerCode: mfr.code,
        manufacturer: mfr.name,
        tags: def.Tags || '',
        typeParams: typeSpecificParams
      })
    }
    
    console.log(`  Parsed ${files.length} ${compType} components`)
  }
  
  return components.filter((c) => !isUnresolvedDisplayName(c.displayName))
}

// ============================================================================
// REPUTATION SYSTEM PARSING
// ============================================================================

/**
 * Parse all reputation standings from reputation/standings/* folders
 * These contain the actual minReputation thresholds for each tier
 */
function parseReputationStandings(localization = {}, standingCache = null) {
  console.log('\n[5/7] Parsing reputation standings...')

  if (standingCache) {
    console.log(`  Parsed ${Object.keys(standingCache.standingsByPath).length} reputation standings`)
    console.log(`  Categories: ${Object.keys(standingCache.standingsByCategory).join(', ')}`)
    return standingCache
  }

  const standingFiles = findJsonFiles(EXPECTED_PATHS.reputation)
  if (standingFiles.length === 0) {
    validationIssues.push('No reputation standing files found')
    return { standingsByPath: {}, standingsByCategory: {} }
  }

  return buildReputationStandingCache(standingFiles, localization, EXTRACTED_DATA)
}

/**
 * Parse reputation scopes (defines standing progressions)
 * Each scope links a list of standings in order
 */
function parseReputationScopes(standingsByPath) {
  console.log('  Parsing reputation scopes...')
  
  const scopePath = join(EXTRACTED_DATA, 'libs/foundry/records/reputation/scopes')
  if (!existsSync(scopePath)) {
    console.log('  Scopes path not found')
    return {}
  }
  
  const scopes = {}
  
  function processDir(dir) {
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        processDir(fullPath)
      } else if (entry.name.endsWith('.json')) {
        const json = readJson(fullPath)
        if (!json?._RecordValue_?.standingMap?.standings) continue
        
        const recordName = json._RecordName_ || entry.name.replace('.json', '')
        const scopeName = recordName.replace('SReputationScopeParams.', '')
        
        // Resolve standings from file references
        const resolvedStandings = []
        for (const standingRef of json._RecordValue_.standingMap.standings) {
          // Convert file:// reference to relative path
          const refPath = standingRef.replace(/file:\/\/\.\/+/g, 'libs/foundry/records/reputation/scopes/')
            .replace(/\.\.\/+/g, '')
            .replace(/^libs\/foundry\/records\/reputation\/scopes\/+/, '')
          
          // Try to find the standing by various path formats
          let found = null
          for (const [path, standing] of Object.entries(standingsByPath)) {
            if (path.includes(refPath.split('/').pop().replace('.json', ''))) {
              found = standing
              break
            }
          }
          
          if (found) {
            resolvedStandings.push(found)
          }
        }
        
        scopes[scopeName] = {
          id: json._RecordId_,
          name: scopeName,
          displayName: json._RecordValue_.displayName || '',
          reputationCeiling: json._RecordValue_.standingMap.reputationCeiling || 0,
          initialReputation: json._RecordValue_.standingMap.initialReputation || 0,
          standings: resolvedStandings,
          standingCount: resolvedStandings.length
        }
      }
    }
  }
  
  processDir(scopePath)
  
  console.log(`  Parsed ${Object.keys(scopes).length} reputation scopes`)
  
  return scopes
}

/**
 * Parse faction reputation definitions
 * These link factions to their reputation tracks
 */
function parseFactionReputations(localization = {}) {
  console.log('  Parsing faction reputation definitions...')
  
  const factionRepPath = join(EXTRACTED_DATA, 'libs/foundry/records/factions/factionreputation')
  if (!existsSync(factionRepPath)) {
    console.log('  Faction reputation path not found')
    return {}
  }
  
  const factions = {}
  const files = readdirSync(factionRepPath).filter(f => f.endsWith('.json'))
  
  for (const file of files) {
    const json = readJson(join(factionRepPath, file))
    if (!json?._RecordValue_) continue
    
    const val = json._RecordValue_
    const recordName = json._RecordName_ || file.replace('.json', '')
    const factionKey = recordName.replace('FactionReputation.', '').toLowerCase()
    
    // Resolve display name
    const nameKey = val.displayName?.startsWith('@') ? val.displayName.substring(1) : null
    const resolvedName = nameKey ? (localization[nameKey] || val.displayName) : val.displayName
    const name = resolveFactionDisplayName({
      rawName: resolvedName,
      factionKey,
      recordName,
    })
    
    factions[factionKey] = {
      id: json._RecordId_,
      key: factionKey,
      name,
      displayNameKey: val.displayName || '',
      descriptionKey: val.description || '',
      recordName,
      filePath: `libs/foundry/records/factions/factionreputation/${file}`,
      reputationContextFile: val.reputationContextPropertiesUI || null,
    }
  }
  
  console.log(`  Parsed ${Object.keys(factions).length} faction reputations`)
  
  return factions
}

// Mission broker parsing: scripts/lib/parseMissionBroker.mjs

/**
 * Parse reputation reward amounts (the actual rep point values)
 */
function parseReputationRewardAmounts(rewardAmountsCache = null) {
  if (rewardAmountsCache) {
    console.log(`  Using ${Object.keys(rewardAmountsCache).length} cached reputation reward amounts`)
    return rewardAmountsCache
  }

  console.log('  Parsing reputation reward amounts...')
  
  const rewardPath = join(EXTRACTED_DATA, 'libs/foundry/records/reputation/rewards/missionrewards_reputation')
  if (!existsSync(rewardPath)) {
    console.log('  Reputation rewards path not found')
    return {}
  }
  
  const missionRewardFiles = findJsonFiles('libs/foundry/records/reputation/rewards/missionrewards_reputation')
  const rewards = buildReputationRewardAmounts(missionRewardFiles)
  console.log(`  Parsed ${Object.keys(rewards).length} reputation reward amounts`)
  return rewards
}

/**
 * Parse reputation context files to get proper faction → scope mappings
 * These files define which career scopes belong to which faction
 */
function parseReputationContexts(scopes) {
  console.log('  Parsing reputation contexts (faction → scope mappings)...')
  
  const contextPath = join(EXTRACTED_DATA, 'libs/foundry/records/reputation/contexts')
  if (!existsSync(contextPath)) {
    console.log('  Contexts path not found')
    return {}
  }
  
  const factionContexts = {}
  
  function processDir(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        processDir(fullPath)
      } else if (entry.name.endsWith('.json') && entry.name.includes('reputationcontext_')) {
        const json = readJson(fullPath)
        if (!json?._RecordValue_) continue
        
        const val = json._RecordValue_
        const contextName = entry.name.replace('reputationcontext_', '').replace('.json', '')
        
        // Extract scope references from scopeContextList (career paths)
        const careerScopes = []
        for (const scopeCtx of val.scopeContextList || []) {
          if (scopeCtx.scope) {
            const scopeRef = scopeCtx.scope.split('/').pop().replace('.json', '')
            const scopeName = scopeRef.replace('reputationscope_', '')
            
            // Find the matching scope in our parsed scopes
            const matchingScope = Object.entries(scopes).find(([key]) => 
              key.toLowerCase() === scopeRef.toLowerCase() ||
              key.toLowerCase().includes(scopeName.toLowerCase())
            )
            
            if (matchingScope) {
              careerScopes.push({
                scopeKey: matchingScope[0],
                scopeName: scopeName,
                standings: matchingScope[1].standings
              })
            }
          }
        }
        
        // Also get primary scope (usually affinity)
        let primaryScope = null
        if (val.primaryScopeContext?.scope) {
          const scopeRef = val.primaryScopeContext.scope.split('/').pop().replace('.json', '')
          const matchingScope = Object.entries(scopes).find(([key]) => 
            key.toLowerCase() === scopeRef.toLowerCase()
          )
          if (matchingScope) {
            primaryScope = {
              scopeKey: matchingScope[0],
              standings: matchingScope[1].standings
            }
          }
        }
        
        factionContexts[contextName] = {
          primaryScope,
          careerScopes
        }
      }
    }
  }
  
  processDir(contextPath)
  console.log(`  Parsed ${Object.keys(factionContexts).length} reputation contexts`)
  
  return factionContexts
}

/**
 * Build career standings for Archive faction cards.
 */
function buildCareerStandingsFromScope(scopeKey, scopes, localization) {
  const displayScopeKey = getPreferredDisplayScopeKey(scopeKey, scopes)
  const scope = scopes[displayScopeKey] || scopes[scopeKey]
  if (!scope?.standings?.length) return null

  const standings = scope.standings
    .filter((s) => s.displayName && !s.displayName.includes('PLACEHOLDER'))
    .map((s) => ({
      displayName: s.displayName,
      minReputation: s.minReputation,
      gated: s.gated,
    }))

  if (standings.length === 0) return null

  return {
    scopeKey,
    displayScopeKey,
    displayName: resolveScopeDisplayName(displayScopeKey, scopes, localization)
      || resolveScopeDisplayName(scopeKey, scopes, localization)
      || scopeKey,
    standings,
  }
}

function resolveFactionContext(faction, factionContexts) {
  const contextPath = faction.reputationContextFile
  if (!contextPath) return null

  const contextFile = basename(String(contextPath).replace(/\\/g, '/'))
  const contextName = contextFile.replace(/^reputationcontext_/i, '').replace(/\.json$/i, '')
  return factionContexts[contextName] ?? null
}

/**
 * Build complete reputation system data
 */
function parseReputationSystem(localization = {}, reputationCaches = {}) {
  console.log('\n[5/7] Parsing complete reputation system...')
  
  const standingCache = reputationCaches.standingCache
  const { standingsByPath, standingsByCategory } = parseReputationStandings(localization, standingCache)
  const scopes = parseReputationScopes(standingsByPath)
  const factions = parseFactionReputations(localization)
  const factionContexts = parseReputationContexts(scopes)
  const rewardAmounts = parseReputationRewardAmounts(reputationCaches.rewardAmounts)
  const { missions, missionsByFaction } = parseMissionBrokerData(EXTRACTED_DATA, localization)
  
  // Build faction standings from each faction's reputationContextPropertiesUI file
  const factionStandings = {}
  for (const [factionKey, faction] of Object.entries(factions)) {
    const context = resolveFactionContext(faction, factionContexts)
    if (!context) continue

    const careers = {}
    for (const career of context.careerScopes || []) {
      const built = buildCareerStandingsFromScope(career.scopeKey, scopes, localization)
      if (!built) continue

      const careerKey = career.scopeName || career.scopeKey
      careers[careerKey] = {
        scopeKey: built.scopeKey,
        displayScopeKey: built.displayScopeKey,
        name: built.displayName,
        standings: built.standings,
      }
    }

    const careerList = Object.values(careers)
    const defaultCareer =
      careerList.find((c) => c.scopeKey !== 'FactionReputationScope')
      || careerList[0]

    if (careerList.length > 0) {
      factionStandings[factionKey] = {
        faction: faction.name,
        factionKey,
        careers: Object.keys(careers).length > 0 ? careers : undefined,
        scopeName: defaultCareer?.displayScopeKey || defaultCareer?.scopeKey,
        standings: defaultCareer?.standings || [],
      }
      continue
    }

    if (context.primaryScope?.standings?.length) {
      const built = buildCareerStandingsFromScope(context.primaryScope.scopeKey, scopes, localization)
      if (built) {
        factionStandings[factionKey] = {
          faction: faction.name,
          factionKey,
          scopeName: built.displayScopeKey || built.scopeKey,
          standings: built.standings,
        }
      }
    }
  }
  
  return {
    standingsByPath,
    standingsByCategory,
    scopes,
    factions,
    factionContexts,
    factionStandings,
    rewardAmounts,
    missions,
    missionsByFaction,
    summary: {
      totalStandings: Object.keys(standingsByPath).length,
      totalScopes: Object.keys(scopes).length,
      totalFactions: Object.keys(factions).length,
      totalContexts: Object.keys(factionContexts).length,
      totalRewardTypes: Object.keys(rewardAmounts).length,
      totalMissions: Object.keys(missions).length,
      missionsWithBlueprints: Object.values(missions).filter(m => m.hasBlueprintReward).length,
      missionsWithRepRequirements: Object.values(missions).filter(m => m.hasRepRequirement).length
    }
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('  Star Citizen Game Data Parser')
  console.log('='.repeat(60))

  clearAppliedSpellingCorrections()
  
  // Validate extracted data exists
  if (!existsSync(EXTRACTED_DATA)) {
    console.error('\nERROR: extracted-data/ folder not found!')
    console.error('Run the extraction script first:')
    console.error('  .\\scripts\\extract-game-data.ps1')
    process.exit(1)
  }
  
  // Validate expected paths exist
  console.log('\nValidating extracted data structure...')
  for (const [name, path] of Object.entries(EXPECTED_PATHS)) {
    const fullPath = join(EXTRACTED_DATA, path)
    if (existsSync(fullPath)) {
      console.log(`  ✓ ${name}`)
    } else {
      console.log(`  ✗ ${name} - MISSING`)
      validationIssues.push(`Expected path missing: ${name} (${path})`)
    }
  }
  for (const [name, path] of Object.entries(OPTIONAL_PATHS)) {
    const fullPath = join(EXTRACTED_DATA, path)
    if (existsSync(fullPath)) {
      console.log(`  ○ ${name} (optional, not parsed)`)
    }
  }

  // Parse localization first (used by lore extraction, mining locations, and name resolution)
  const localization = parseLocalization()

  // Shared reputation caches (single disk read for standings + reward amounts)
  const standingFiles = findJsonFiles(EXPECTED_PATHS.reputation)
  const standingCache = buildReputationStandingCache(standingFiles, localization, EXTRACTED_DATA)
  const repRewardFiles = findJsonFiles(EXPECTED_PATHS.reputationRewards)
  const repRewardAmounts = buildContractRepRewardAmounts(repRewardFiles)
  const missionRewardFiles = repRewardFiles.filter((file) =>
    file.replace(/\\/g, '/').includes('/reputation/rewards/missionrewards_reputation/')
  )
  const rewardAmounts = buildReputationRewardAmounts(missionRewardFiles)
  const reputationCaches = {
    standingCache,
    rewardAmounts,
    standingDefs: standingCache.standingDefs,
    repRewardAmounts,
  }

  const resourceLore = extractResourceLore(localization)
  const hppPresets = loadHppProviderPresets(EXTRACTED_DATA)
  console.log(`  Loaded ${hppPresets.length} harvestable provider presets (single HPP walk)`)
  const miningLocations = parseMiningLocations(localization, hppPresets)
  const manufacturers = buildManufacturerMap(localization)
  
  // Parse all data
  const { missionBlueprints, blueprintMissions } = parseBlueprintRewards()
  const blueprintDefs = parseBlueprintDefinitions(localization)
  const mineableElements = parseMineableElements()
  const {
    oreSignatures,
    audit: oreSignatureAudit,
  } = parseOreSignatures(EXTRACTED_DATA)
  console.log(`\n  Parsed ${Object.keys(oreSignatures).length} ship-mining RS base signatures from mineable rock entities`)
  if (oreSignatureAudit.conflicts.length) {
    console.log(`  ⚠ ${oreSignatureAudit.conflicts.length} RS signature conflict(s) across entity templates`)
    oreSignatureAudit.conflicts.slice(0, 5).forEach((c) => console.log(`      - ${c}`))
  }
  if (oreSignatureAudit.missingOres.length) {
    console.log(`  ⚠ Missing RS signatures for: ${oreSignatureAudit.missingOres.join(', ')}`)
  }
  const miningLasers = parseMiningLasers(localization)
  const miningModules = parseMiningModules(localization)
  const miningGadgets = parseMiningGadgets(localization)
  const components = parseShipComponents(localization)
  const reputationSystem = parseReputationSystem(localization, reputationCaches)
  
  // Parse contract generators for complete mission -> blueprint mapping
  const contractData = parseContractGenerators(localization, reputationCaches)
  mergeSupplementalContracts(
    contractData,
    localization,
    contractData.factionNames,
    contractData.standingDefs,
    contractData.repRewardAmounts
  )
  enrichContractStandingData(contractData, reputationSystem, localization)

  // Wikelo Emporium barter trades (TheCollector contracts)
  console.log('\n[WIKELO] Parsing Wikelo Emporium trades...')
  const wikeloData = parseWikeloTrades({
    extractedData: EXTRACTED_DATA,
    localization,
    repRewardAmounts,
  })
  console.log(`  Parsed ${wikeloData.trades.length} Wikelo trades`)
  for (const issue of wikeloData.issues) {
    validationIssues.push(`[Wikelo] ${issue}`)
  }
  
  // Parse weapons, ordnance, and modules
  console.log('\n[6/7] Parsing FPS weapons, ordnance, and salvage modules...')
  const fpsWeapons = parseFpsWeapons(localization)
  const salvageModules = parseSalvageModules(localization)
  const ordnanceData = parseOrdnance(localization)
  
  // Parse quality bands
  const qualityData = parseQualityBands(EXTRACTED_DATA)
  
  const gameBuildInfo = readGameBuildInfo({ extractedData: EXTRACTED_DATA })
  if (gameBuildInfo?.version || gameBuildInfo?.launcherVersion) {
    const label = gameBuildInfo.launcherVersion || gameBuildInfo.version
    console.log(`\nGame build: ${label}`)
    saveJson('game-build-version.json', {
      version: gameBuildInfo.version,
      launcherVersion: gameBuildInfo.launcherVersion,
    })
  } else {
    console.warn('\n⚠️  Could not determine game build version (game-build.json / build_manifest.id missing)')
  }

  // Generate output files
  console.log('\n[7/7] Generating output files...')
  console.log('='.repeat(60))
  
  // Resource lore (replaces wiki-fetched lore)
  if (Object.keys(resourceLore).length > 0) {
    saveJson('game-lore.json', {
      _source: 'Star Citizen Game Files (extracted localization)',
      _extracted: new Date().toISOString(),
      resources: resourceLore,
      summary: {
        totalDescriptions: Object.keys(resourceLore).length
      }
    })
  } else {
    console.log('  ⚠ No lore data (run extract-game-data.ps1 to get localization files)')
  }
  
  // Mining locations (replaces legacy mining-locations.json)
  const miningSpawns = parseMiningSpawns(EXTRACTED_DATA, miningLocations, oreSignatures, hppPresets)
  const spawnMerge = mergeSpawnOreLocations({
    oreLocations: miningLocations.oreLocations,
    locationOres: miningLocations.locationOres,
    locationMineables: miningLocations.locationMineables,
    spawnOres: miningSpawns.ores,
    rarityTiers: miningLocations.rarityTiers,
    assignOreRarity,
  })
  miningLocations.rarityTiers = rebuildRarityTiers(
    miningLocations.oreLocations,
    miningLocations.rarityTiers,
    miningLocations.rarityOrder,
    assignOreRarity
  )
  const postSpawnConsolidated = consolidateMiningLocationData(miningLocations)
  miningLocations.oreLocations = postSpawnConsolidated.oreLocations
  miningLocations.locationOres = postSpawnConsolidated.locationOres
  miningLocations.locationMineables = postSpawnConsolidated.locationMineables
  miningLocations.handMineableHabitats = postSpawnConsolidated.handMineableHabitats
  miningLocations.rarityTiers = rebuildRarityTiers(
    miningLocations.oreLocations,
    miningLocations.rarityTiers,
    miningLocations.rarityOrder,
    assignOreRarity
  )
  console.log(
    `  Reconciled ore locations with spawn profiles (+${spawnMerge.added} sites, -${spawnMerge.pruned} compendium-only)`
  )

  saveJson('game-mining-locations.json', {
    _source: 'Star Citizen Game Files (extracted localization)',
    _extracted: new Date().toISOString(),
    rarityTiers: miningLocations.rarityTiers,
    oreLocations: miningLocations.oreLocations,
    locationOres: miningLocations.locationOres,
    locationMineables: miningLocations.locationMineables,
    handMineableHabitats: miningLocations.handMineableHabitats,
    redundantSubsiteGuideLocations: miningLocations.redundantSubsiteGuideLocations,
    locationAliases: miningLocations.locationAliases,
    guideToSpawnKeys: miningLocations.guideToSpawnKeys,
    rarityOrder: miningLocations.rarityOrder,
    summary: {
      totalOres: Object.keys(miningLocations.oreLocations).length,
      totalLocations: Object.keys(miningLocations.locationOres).length,
      locationsWithDetails: Object.keys(miningLocations.locationMineables).length,
      handMineableHabitatEntries: Object.values(miningLocations.handMineableHabitats ?? {}).reduce(
        (n, byLoc) => n + Object.keys(byLoc).length,
        0
      ),
      locationAliasCount: Object.keys(miningLocations.locationAliases ?? {}).length,
      guideToSpawnKeyCount: Object.keys(miningLocations.guideToSpawnKeys ?? {}).length,
    }
  })

  saveJson('game-mining-spawns.json', {
    _source: 'Star Citizen Game Files (extracted harvestable/HPP data)',
    _extracted: new Date().toISOString(),
    clusterPresets: miningSpawns.clusterPresets,
    ores: miningSpawns.ores,
    audit: miningSpawns.audit,
    summary: miningSpawns.summary,
  })
  
  // Manufacturers
  saveJson('game-manufacturers.json', {
    _source: 'Star Citizen Game Files (extracted localization)',
    _extracted: new Date().toISOString(),
    manufacturers: manufacturers,
    summary: {
      totalManufacturers: Object.keys(manufacturers).length
    }
  })
  
  // Blueprint acquisition data (replaces starstrings contract-blueprints.json)
  // Written once below after contract enrichment — skip intermediate save here.
  // Enrich blueprint definitions with mission reward data
  const defaultBlueprintIds = parseDefaultBlueprintIds()

  const enrichedBlueprints = blueprintDefs.map(bp => {
    const internalKey = (bp.internalName || bp.file || '').toLowerCase()
    if (defaultBlueprintIds.has(internalKey)) {
      return { ...bp, isDefault: true, rewardMissions: [], missionPools: [] }
    }

    const bpName = bp.name.toLowerCase().replace('bp_craft_', '')
    const poolKeys = blueprintMissions[bpName] || []
    const rewardMissions = buildBlueprintRewardMissionsFromContracts(
      bp.internalName || bpName,
      missionBlueprints,
      contractData.contracts
    )

    if (rewardMissions.length === 0) {
      return { ...bp, isReward: false, rewardMissions: [] }
    }

    return {
      ...bp,
      isReward: true,
      rewardMissions,
      missionPools: poolKeys
    }
  })
  
  // Priority Rule Validation: isReward=true items MUST have localization
  const rewardBlueprintsWithFallback = enrichedBlueprints.filter(b => b.isReward && b._usedFallbackName)
  const nonRewardBlueprintsWithFallback = enrichedBlueprints.filter(b => !b.isReward && b._usedFallbackName)
  
  if (rewardBlueprintsWithFallback.length > 0) {
    console.log(`\n  ⚠️  WARNING: ${rewardBlueprintsWithFallback.length} reward blueprints using fallback names (need localization fix):`)
    rewardBlueprintsWithFallback.slice(0, 10).forEach(b => {
      console.log(`      - ${b.internalName} → "${b.blueprintName}"`)
    })
    if (rewardBlueprintsWithFallback.length > 10) {
      console.log(`      ... and ${rewardBlueprintsWithFallback.length - 10} more`)
    }
  }
  
  if (nonRewardBlueprintsWithFallback.length > 0) {
    console.log(`  ℹ️  INFO: ${nonRewardBlueprintsWithFallback.length} non-reward blueprints using fallback names (expected, not in game yet)`)
  }
  
  // Clean up internal tracking flag before saving (don't expose to frontend)
  const cleanedBlueprints = enrichedBlueprints.map(({ _usedFallbackName, ...bp }) => bp)
  
  // Blueprint definitions (enriched with mission data)
  saveJson('game-blueprints.json', {
    _source: 'Star Citizen Game Files (extracted)',
    _extracted: new Date().toISOString(),
    version: gameBuildInfo?.version ?? 'unknown',
    blueprints: cleanedBlueprints,
    defaultBlueprintIds: [...defaultBlueprintIds].sort(),
    summary: {
      totalBlueprints: cleanedBlueprints.length,
      defaultBlueprints: cleanedBlueprints.filter(b => b.isDefault).length,
      blueprintsWithRewards: cleanedBlueprints.filter(b => b.isReward).length,
      rewardBlueprintsNeedingLocalization: rewardBlueprintsWithFallback.length,
      nonRewardBlueprintsWithFallback: nonRewardBlueprintsWithFallback.length
    }
  })

  saveBlueprintNameLookup(
    buildBlueprintNameLookup(cleanedBlueprints, contractData, missionBlueprints),
    join(dirname(fileURLToPath(import.meta.url)), '..')
  )
  
  // Mining data (replaces mining-locations.json partially)
  saveJson('game-mining.json', {
    _source: 'Star Citizen Game Files (extracted)',
    _extracted: new Date().toISOString(),
    mineableElements,
    oreSignatures,
    miningLasers,
    miningModules,
    miningGadgets,
    summary: {
      elements: mineableElements.length,
      signatureOres: Object.keys(oreSignatures).length,
      lasers: miningLasers.length,
      modules: miningModules.length,
      gadgets: miningGadgets.length,
    },
  })
  
  // Ship components
  saveJson('game-components.json', {
    _source: 'Star Citizen Game Files (extracted)',
    _extracted: new Date().toISOString(),
    components,
    summary: {
      totalComponents: components.length,
      byType: components.reduce((acc, c) => {
        acc[c.type] = (acc[c.type] || 0) + 1
        return acc
      }, {})
    }
  })
  
  // Reputation system (complete faction standings and mission data)
  saveJson('game-reputation.json', {
    _source: 'Star Citizen Game Files (extracted)',
    _extracted: new Date().toISOString(),
    factions: reputationSystem.factions,
    factionContexts: reputationSystem.factionContexts,
    factionStandings: reputationSystem.factionStandings,
    standingsByCategory: reputationSystem.standingsByCategory,
    scopes: reputationSystem.scopes,
    rewardAmounts: reputationSystem.rewardAmounts,
    missions: reputationSystem.missions,
    missionsByFaction: reputationSystem.missionsByFaction,
    summary: reputationSystem.summary
  })
  
  // Blueprint missions (contract-based mission → blueprint mapping with full details)
  saveJson('game-blueprint-missions.json', {
    _source: 'Star Citizen Game Files (contract generators)',
    _extracted: new Date().toISOString(),
    // Existing pool -> blueprint mappings
    missionBlueprints,
    blueprintMissions,
    // NEW: Contract-based mission data with titles, rep, aUEC
    contracts: contractData.contracts,
    missionsByPool: contractData.missionsByPool,
    summary: {
      totalPools: Object.keys(missionBlueprints).length,
      totalBlueprints: Object.keys(blueprintMissions).length,
      contractsWithBlueprints: contractData.contracts.length,
      poolsWithMissionData: Object.keys(contractData.missionsByPool).length
    }
  })
  
  // Wikelo Emporium trades (barter contracts at TheCollector)
  saveJson('game-wikelo-trades.json', {
    _source: 'Star Citizen Game Files (TheCollector contract generator)',
    _extracted: new Date().toISOString(),
    trades: wikeloData.trades,
    standings: wikeloData.standings,
    summary: {
      totalTrades: wikeloData.trades.length,
      vehicleTrades: wikeloData.trades.filter(t => t.category === 'vehicle').length,
      gearTrades: wikeloData.trades.filter(t => t.category === 'gear').length,
      favorTrades: wikeloData.trades.filter(t => t.category === 'favor').length
    }
  })

  // FPS Weapons (replaces wiki-enriched weapon data)
  saveJson('game-fps-weapons.json', {
    _source: 'Star Citizen Game Files (extracted)',
    _extracted: new Date().toISOString(),
    weapons: fpsWeapons,
    summary: {
      totalWeapons: fpsWeapons.length
    }
  })
  
  // Salvage Modules (replaces wiki-enriched salvage data)
  saveJson('game-salvage-modules.json', {
    _source: 'Star Citizen Game Files (extracted)',
    _extracted: new Date().toISOString(),
    modules: salvageModules,
    summary: {
      totalModules: salvageModules.length
    }
  })
  
  // Ordnance (replaces legacy ordnance.json)
  saveJson('game-ordnance.json', {
    _source: 'Star Citizen Game Files (extracted localization)',
    _extracted: new Date().toISOString(),
    ordnance: ordnanceData.ordnance,
    ordnanceByGuidance: ordnanceData.ordnanceByGuidance,
    ordnanceBySize: ordnanceData.ordnanceBySize,
    metadata: ordnanceData.metadata,
    summary: {
      totalOrdnance: ordnanceData.ordnance.length,
      missiles: ordnanceData.ordnance.filter(o => !o.isTorpedo).length,
      torpedoes: ordnanceData.ordnance.filter(o => o.isTorpedo).length
    }
  })
  
  // Quality bands (replaces static qualityBands.ts data)
  if (Object.keys(qualityData.bands).length > 0) {
    saveJson('game-quality-bands.json', {
      _source: 'Star Citizen Game Files (extracted via dcb query)',
      _extracted: new Date().toISOString(),
      qualityBands: qualityData.bands,
      qualityDistribution: qualityData.distribution,
      // For easy import into qualityBands.ts - mapped values only
      bandThresholds: Object.fromEntries(
        Object.entries(qualityData.bands).map(([key, data]) => [key, data.thresholds])
      ),
      summary: {
        totalResources: Object.keys(qualityData.bands).length,
        distributionTypes: Object.keys(qualityData.distribution).length
      }
    })
  } else {
    console.log('  ⚠ No quality band data (run extract-game-data.ps1 with dcb query)')
  }
  
  // Validation report
  console.log('\n' + '='.repeat(60))
  console.log('  Extraction Summary')
  console.log('='.repeat(60))
  
  if (validationIssues.length > 0) {
    console.log('\n⚠️  VALIDATION ISSUES DETECTED:')
    for (const issue of validationIssues) {
      console.log(`  • ${issue}`)
    }
    console.log('\nThis may indicate game data structure changes.')
    console.log('Review the issues above and update the parser if needed.')
    
    // Write validation report
    saveJson('_extraction-validation.json', {
      _generated: new Date().toISOString(),
      issues: validationIssues,
      expectedPaths: EXPECTED_PATHS
    })
  } else {
    console.log('\n✓ All expected data paths found')
    console.log('✓ No validation issues detected')
  }
  
  // What's New: append pending JSONL → push to Supabase (version-scoped dedupe) → wipe on success
  try {
    const digest = await writeWhatsNewDigest({
      projectRoot: PROJECT_ROOT,
      dataDir: OUTPUT_DIR,
      version: gameBuildInfo?.launcherVersion || gameBuildInfo?.version || undefined,
    })
    console.log(
      `\n✓ What's New: ${digest.entryCount} fresh entr${digest.entryCount === 1 ? 'y' : 'ies'} (+${digest.totals.added}/-${digest.totals.removed}/Δ${digest.totals.changed} vs git)`
    )
    if (digest.push?.skipped && digest.push?.reason) {
      console.warn(`  ⚠ ${digest.push.reason}`)
    } else if (digest.push?.ok && !digest.push?.empty) {
      console.log(
        `  ✓ DB ingest: inserted ${digest.push.inserted}, skipped ${digest.push.skipped} (same issue+version)`
      )
    } else if (digest.push?.error) {
      console.warn(`  ⚠ DB ingest failed (pending kept): ${digest.push.error}`)
      console.warn('    Retry: npm run push-whats-new')
    }
  } catch (err) {
    console.warn(`\n⚠️  Could not build/push What's New: ${err?.message || err}`)
  }

  console.log('\nOutput files written to: src/data/')
  console.log('')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
