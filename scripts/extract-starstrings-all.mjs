#!/usr/bin/env node
/**
 * Master extraction script for MrKraken's StarStrings data
 * Extracts: mining locations, components, ordnance, and enhanced contract data
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STARSTRINGS_PATH = 'F:\\SC Profiles\\StarStrings-master'

// ============================================================================
// MINING DATA EXTRACTION
// ============================================================================

function extractMiningData() {
  const miningPath = join(STARSTRINGS_PATH, 'mining.ini')
  if (!existsSync(miningPath)) {
    console.warn('mining.ini not found, skipping mining extraction')
    return null
  }

  const content = readFileSync(miningPath, 'utf-8')
  
  // Parse the Journal entry which contains organized mining data
  const journalMatch = content.match(/Journal_General_Mining_Compendium_Content=(.+)/)
  if (!journalMatch) {
    console.warn('Could not find mining compendium in mining.ini')
    return null
  }

  const journalContent = journalMatch[1].replace(/\\n/g, '\n')
  
  const rarityTiers = {
    legendary: [],
    epic: [],
    rare: [],
    uncommon: [],
    common: [],
    handMineable: []
  }

  let currentTier = null
  const lines = journalContent.split('\n')
  
  for (const line of lines) {
    const trimmed = line.trim()
    
    // Detect tier headers
    if (trimmed.includes('** Legendary **')) currentTier = 'legendary'
    else if (trimmed.includes('** Epic **')) currentTier = 'epic'
    else if (trimmed.includes('** Rare **')) currentTier = 'rare'
    else if (trimmed.includes('** Uncommon **')) currentTier = 'uncommon'
    else if (trimmed.includes('** Common **')) currentTier = 'common'
    else if (trimmed.includes('** Hand Mineables **')) currentTier = 'handMineable'
    else if (currentTier && trimmed.includes(' - ')) {
      // Parse ore line: "OreName - Location1, Location2, ..."
      const [orePart, locationsPart] = trimmed.split(' - ')
      if (orePart && locationsPart) {
        const oreName = orePart.trim()
        const locations = locationsPart.split(',').map(l => l.trim()).filter(Boolean)
        
        rarityTiers[currentTier].push({
          name: oreName,
          locations
        })
      }
    }
  }

  // Build ore-to-locations map and location-to-ores map
  const oreLocations = {}
  const locationOres = {}
  
  for (const [tier, ores] of Object.entries(rarityTiers)) {
    for (const ore of ores) {
      oreLocations[ore.name] = {
        rarity: tier,
        locations: ore.locations
      }
      
      for (const loc of ore.locations) {
        if (!locationOres[loc]) locationOres[loc] = []
        locationOres[loc].push({
          name: ore.name,
          rarity: tier
        })
      }
    }
  }

  return {
    _source: 'MrKraken StarStrings mining.ini',
    _extracted: new Date().toISOString(),
    rarityTiers,
    oreLocations,
    locationOres,
    rarityOrder: ['legendary', 'epic', 'rare', 'uncommon', 'common', 'handMineable']
  }
}

// ============================================================================
// COMPONENT DATA EXTRACTION
// ============================================================================

function extractComponentData() {
  const componentsPath = join(STARSTRINGS_PATH, 'components.ini')
  if (!existsSync(componentsPath)) {
    console.warn('components.ini not found, skipping component extraction')
    return null
  }

  const content = readFileSync(componentsPath, 'utf-8')
  const lines = content.split('\n').filter(l => l.trim())

  // Manufacturer code mappings
  const manufacturerCodes = {
    'AEGS': 'Aegis Dynamics',
    'ACOM': 'ArcCorp',
    'AMRS': 'Amon & Reese',
    'ARCC': 'Arc Corp',
    'ASAS': 'Ascension Astro',
    'BANU': 'Banu',
    'BASL': 'Basilisk',
    'BEHR': 'Behring',
    'BLTR': 'Blighter',
    'BRRA': 'Brentworth',
    'CHCO': 'Chimera Communications',
    'FSIN': 'Flash Industries',
    'GODI': 'Gorgon Defender Industries',
    'GRNP': 'Groupe Nouveau Paris',
    'JSPN': 'Juno Starwerk',
    'JUST': 'Juno',
    'LPLT': 'Lightning Power Ltd',
    'MITE': 'Mite',
    'NAVE': 'Nav-E7',
    'NOVP': 'Nova',
    'RACO': 'Railen Corp',
    'RSI': 'Roberts Space Industries',
    'SADA': 'Sakura Sun',
    'SASU': 'Sakura Sun',
    'SECO': 'Seal Corp',
    'TARS': 'Tarsus',
    'THCN': 'Thermacorp',
    'TYDT': 'Tyler Design & Tech',
    'WCPR': 'Wen/Cassel Propulsion',
    'WETK': 'Wei-Tek',
    'WLOP': 'Wolover',
    'YORM': 'Yormandi'
  }

  // Component type codes
  const typeCodes = {
    'COOL': 'Cooler',
    'POWR': 'Power Plant',
    'QDRV': 'Quantum Drive',
    'QDMP': 'Quantum Dampener',
    'QED': 'Quantum Enforcement Device',
    'SHLD': 'Shield Generator',
    'LIFE': 'Life Support',
    'RADR': 'Radar',
    'COMP': 'Computer',
    'JUMP': 'Jump Drive',
    'SECO': 'Shield'
  }

  // Class codes
  const classCodes = {
    'Mil': 'Military',
    'Civ': 'Civilian',
    'Ind': 'Industrial',
    'Cmp': 'Competition',
    'Sth': 'Stealth'
  }

  // Grade ratings
  const gradeOrder = ['A', 'B', 'C', 'D']

  const components = []
  const componentsByType = {}
  const componentsByManufacturer = {}
  const componentsByClass = {}

  for (const line of lines) {
    // Pattern: item_Name[TYPE]_[MFR]_S[SIZE]_[Name]=Class/Size/Grade DisplayName
    const match = line.match(/^item_Name[_]?([A-Z]+)_([A-Z]+)_S(\d+)_([^=]+)=(.+)$/)
    if (!match) continue

    const [, typeCode, mfrCode, sizeStr, internalName, displayValue] = match
    
    // Parse display value: "Mil/1/D Tundra" or similar
    const displayMatch = displayValue.match(/^([A-Za-z]+)\/(\d+)\/([A-D])\s+(.+)$/)
    if (!displayMatch) continue

    const [, classCode, displaySize, grade, displayName] = displayMatch

    const component = {
      internalId: `${typeCode}_${mfrCode}_S${sizeStr}_${internalName}`,
      displayName: displayName.trim(),
      type: typeCodes[typeCode] || typeCode,
      typeCode,
      manufacturer: manufacturerCodes[mfrCode] || mfrCode,
      manufacturerCode: mfrCode,
      size: parseInt(sizeStr),
      class: classCodes[classCode] || classCode,
      classCode,
      grade,
      gradeRank: gradeOrder.indexOf(grade) + 1,
      fullLabel: displayValue.trim()
    }

    components.push(component)

    // Index by type
    if (!componentsByType[component.type]) componentsByType[component.type] = []
    componentsByType[component.type].push(component)

    // Index by manufacturer
    if (!componentsByManufacturer[component.manufacturer]) componentsByManufacturer[component.manufacturer] = []
    componentsByManufacturer[component.manufacturer].push(component)

    // Index by class
    if (!componentsByClass[component.class]) componentsByClass[component.class] = []
    componentsByClass[component.class].push(component)
  }

  return {
    _source: 'MrKraken StarStrings components.ini',
    _extracted: new Date().toISOString(),
    components,
    componentsByType,
    componentsByManufacturer,
    componentsByClass,
    metadata: {
      manufacturerCodes,
      typeCodes,
      classCodes,
      gradeOrder
    }
  }
}

// ============================================================================
// ORDNANCE DATA EXTRACTION
// ============================================================================

function extractOrdnanceData() {
  const ordnancePath = join(STARSTRINGS_PATH, 'ordnance.ini')
  if (!existsSync(ordnancePath)) {
    console.warn('ordnance.ini not found, skipping ordnance extraction')
    return null
  }

  const content = readFileSync(ordnancePath, 'utf-8')
  const lines = content.split('\n').filter(l => l.trim())

  // Guidance type codes
  const guidanceCodes = {
    'CS': 'Cross-Section',
    'EM': 'Electromagnetic',
    'IR': 'Infrared'
  }

  const ordnance = []
  const ordnanceByGuidance = {}
  const ordnanceBySize = {}

  for (const line of lines) {
    // Pattern: item_Name[G]MISL_S[SIZE]_[GUIDANCE]_[MFR]_[Name]=DisplayName
    // Or: item_NameMISL_S[SIZE]_[GUIDANCE]_[MFR]_[Name]=DisplayName
    const match = line.match(/^item_Name(G?)MISL_S(\d+)_([A-Z]+)_([A-Z]+)_([^=]+)=(.+)$/)
    if (!match) continue

    const [, isGimbal, sizeStr, guidanceCode, mfrCode, internalName, displayValue] = match
    
    // Parse display value: "[EM2] Dominator-G Missile" or similar
    const displayMatch = displayValue.match(/^\[([A-Z]+)(\d+)\]\s+(.+)$/)
    if (!displayMatch) continue

    const [, displayGuidance, displaySize, displayName] = displayMatch

    const isTorpedo = displayName.toLowerCase().includes('torpedo')
    const size = parseInt(sizeStr)

    const item = {
      internalId: `${isGimbal ? 'G' : ''}MISL_S${sizeStr}_${guidanceCode}_${mfrCode}_${internalName}`,
      displayName: displayName.trim(),
      guidance: guidanceCodes[guidanceCode] || guidanceCode,
      guidanceCode,
      size,
      isGimbal: isGimbal === 'G',
      isTorpedo,
      type: isTorpedo ? 'Torpedo' : 'Missile',
      manufacturer: mfrCode,
      fullLabel: displayValue.trim()
    }

    ordnance.push(item)

    // Index by guidance
    const guidanceKey = item.guidance
    if (!ordnanceByGuidance[guidanceKey]) ordnanceByGuidance[guidanceKey] = []
    ordnanceByGuidance[guidanceKey].push(item)

    // Index by size
    if (!ordnanceBySize[size]) ordnanceBySize[size] = []
    ordnanceBySize[size].push(item)
  }

  return {
    _source: 'MrKraken StarStrings ordnance.ini',
    _extracted: new Date().toISOString(),
    ordnance,
    ordnanceByGuidance,
    ordnanceBySize,
    metadata: {
      guidanceCodes,
      sizeRanges: {
        missile: [1, 2, 3, 4, 5, 7],
        torpedo: [9, 10, 12]
      }
    }
  }
}

// ============================================================================
// ENHANCED CONTRACT DATA EXTRACTION
// ============================================================================

function extractContractData() {
  const contractsPath = join(STARSTRINGS_PATH, 'contracts.ini')
  if (!existsSync(contractsPath)) {
    console.warn('contracts.ini not found, skipping contract extraction')
    return null
  }

  const content = readFileSync(contractsPath, 'utf-8')
  
  // Extract blueprint pools from contract descriptions
  const blueprintPools = []
  const standingTierBlueprints = {
    neutral: [],
    friendly: [],
    trusted: [],
    jr_contractor: [],
    sr_contractor: [],
    master: []
  }
  const allBlueprints = new Set()

  // Parse all contract entries
  const lines = content.split('\n')
  
  for (const line of lines) {
    if (!line.includes('=')) continue
    
    const [key, ...valueParts] = line.split('=')
    const value = valueParts.join('=').replace(/\\n/g, '\n')
    
    // Look for blueprint mentions
    if (value.includes('Potential Blueprints') || value.includes('Blueprint Pool')) {
      // Extract standing tier requirement
      let standingTier = 'unknown'
      const tierMatch = value.match(/Awarded from ([^<\n]+) level/i)
      if (tierMatch) {
        const tierRaw = tierMatch[1].toLowerCase().trim()
        if (tierRaw.includes('neutral')) standingTier = 'neutral'
        else if (tierRaw.includes('friendly')) standingTier = 'friendly'
        else if (tierRaw.includes('trusted')) standingTier = 'trusted'
        else if (tierRaw.includes('sr') || tierRaw.includes('senior')) standingTier = 'sr_contractor'
        else if (tierRaw.includes('jr') || tierRaw.includes('junior')) standingTier = 'jr_contractor'
        else if (tierRaw.includes('master')) standingTier = 'master'
      }

      // Extract individual blueprints (lines starting with "- ")
      const blueprints = []
      const bpMatches = value.matchAll(/^- ([^(\n]+?)(?:\s*\([^)]+\))?$/gm)
      for (const m of bpMatches) {
        let bp = m[1].trim()
        // Clean up the blueprint name
        bp = bp.replace(/\\n.*$/s, '').trim()
        if (bp && bp.length > 2 && !bp.includes('<EM4>') && !bp.includes('Pool')) {
          blueprints.push(bp)
          allBlueprints.add(bp)
        }
      }

      // Also try to catch blueprints in Pool format
      const poolMatches = value.matchAll(/<EM4>Pool \d+<\/EM4>\s*([\s\S]*?)(?=<EM4>Pool|<EM4>Awarded|$)/g)
      for (const poolMatch of poolMatches) {
        const poolContent = poolMatch[1]
        const poolBps = poolContent.matchAll(/^- ([^\n]+)/gm)
        for (const pbm of poolBps) {
          let bp = pbm[1].trim().replace(/\\n.*$/s, '')
          if (bp && bp.length > 2 && !bp.includes('<EM4>')) {
            blueprints.push(bp)
            allBlueprints.add(bp)
          }
        }
      }

      if (blueprints.length > 0) {
        // De-duplicate
        const uniqueBps = [...new Set(blueprints)]
        
        blueprintPools.push({
          contractKey: key,
          blueprints: uniqueBps,
          standingTier
        })
        
        // Add to standing tier index
        if (standingTierBlueprints[standingTier]) {
          for (const bp of uniqueBps) {
            if (!standingTierBlueprints[standingTier].includes(bp)) {
              standingTierBlueprints[standingTier].push(bp)
            }
          }
        }
      }
    }
  }

  // Build a cleaner blueprint-to-standing map
  const blueprintStandings = {}
  for (const pool of blueprintPools) {
    for (const bp of pool.blueprints) {
      if (!blueprintStandings[bp]) {
        blueprintStandings[bp] = {
          minStanding: pool.standingTier,
          contracts: []
        }
      }
      blueprintStandings[bp].contracts.push(pool.contractKey)
    }
  }

  // Extract reputation amounts per mission type
  const repAmounts = {}
  const repPattern = /<EM4>Reputation Awarded[^<]*<\/EM4>:?\s*([\d,]+)/g
  let match
  while ((match = repPattern.exec(content)) !== null) {
    const amount = parseInt(match[1].replace(/,/g, ''))
    if (!isNaN(amount)) {
      repAmounts[amount] = (repAmounts[amount] || 0) + 1
    }
  }

  return {
    _source: 'MrKraken StarStrings contracts.ini',
    _extracted: new Date().toISOString(),
    blueprintPools,
    standingTierBlueprints,
    blueprintStandings,
    reputationAmounts: Object.keys(repAmounts).map(Number).sort((a, b) => a - b),
    summary: {
      totalPoolsFound: blueprintPools.length,
      uniqueBlueprintsFound: allBlueprints.size
    }
  }
}

// ============================================================================
// GLOBAL.INI ENHANCED EXTRACTION
// ============================================================================

function extractGlobalData() {
  const globalPath = join(STARSTRINGS_PATH, 'Data', 'Localization', 'english', 'global.ini')
  if (!existsSync(globalPath)) {
    console.warn('global.ini not found, skipping global extraction')
    return null
  }

  const content = readFileSync(globalPath, 'utf-8')
  
  // Extract standing level definitions
  const standingLevels = {
    lawful: ['Neutral', 'Friendly', 'Trusted', 'Advocate', 'Ally'],
    unlawful: ['Neutral', 'Friendly', 'Trusted', 'Accomplice', 'Associate']
  }

  // Extract mission givers and their factions
  const missionGivers = {}
  const factionContracts = {}

  // Pattern for mission giver mentions
  const giverPatterns = [
    /Covalex/i, /Eckhart/i, /Constantin/i, /Hurston/i, /Crusader/i, 
    /ArcCorp/i, /microTech/i, /Rayari/i, /Adagio/i, /Bounty.*Hunter/i,
    /Citizens.*Prosperity/i, /Headhunters/i, /Red Wind/i, /Dusters/i,
    /Rough.*Necks/i, /Xeno.*Threat/i, /Nine.*Tails/i, /Highpoint/i
  ]

  // Count contract types
  const contractTypes = {}
  const lines = content.split('\n')
  
  for (const line of lines) {
    // Categorize by common contract prefixes
    if (line.includes('_Desc') || line.includes('_Title')) {
      for (const pattern of giverPatterns) {
        if (pattern.test(line)) {
          const giverName = pattern.source.replace(/\.\*/g, ' ').replace(/\\/g, '')
          contractTypes[giverName] = (contractTypes[giverName] || 0) + 1
          break
        }
      }
    }
  }

  // Extract [BP] tagged missions count
  const bpMissionCount = (content.match(/\[BP\]/g) || []).length
  const bpStarMissionCount = (content.match(/\[BP\]\*/g) || []).length

  return {
    _source: 'MrKraken StarStrings global.ini',
    _extracted: new Date().toISOString(),
    standingLevels,
    contractTypeCounts: contractTypes,
    bpMissions: {
      totalBpTagged: bpMissionCount,
      conditionalBp: bpStarMissionCount,
      guaranteedBp: bpMissionCount - bpStarMissionCount
    }
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('='.repeat(60))
  console.log('StarStrings Complete Data Extraction')
  console.log('='.repeat(60))

  const dataDir = join(__dirname, '..', 'src', 'data')

  // Extract mining data
  console.log('\n[1/5] Extracting mining locations...')
  const miningData = extractMiningData()
  if (miningData) {
    const miningPath = join(dataDir, 'mining-locations.json')
    writeFileSync(miningPath, JSON.stringify(miningData, null, 2))
    console.log(`  ✓ Saved ${Object.keys(miningData.oreLocations).length} ores to mining-locations.json`)
  }

  // Extract component data
  console.log('\n[2/5] Extracting component metadata...')
  const componentData = extractComponentData()
  if (componentData) {
    const componentPath = join(dataDir, 'component-types.json')
    writeFileSync(componentPath, JSON.stringify(componentData, null, 2))
    console.log(`  ✓ Saved ${componentData.components.length} components to component-types.json`)
  }

  // Extract ordnance data
  console.log('\n[3/5] Extracting ordnance data...')
  const ordnanceData = extractOrdnanceData()
  if (ordnanceData) {
    const ordnancePath = join(dataDir, 'ordnance.json')
    writeFileSync(ordnancePath, JSON.stringify(ordnanceData, null, 2))
    console.log(`  ✓ Saved ${ordnanceData.ordnance.length} missiles/torpedoes to ordnance.json`)
  }

  // Extract contract data
  console.log('\n[4/5] Extracting contract blueprint pools...')
  const contractData = extractContractData()
  if (contractData) {
    const contractPath = join(dataDir, 'contract-blueprints.json')
    writeFileSync(contractPath, JSON.stringify(contractData, null, 2))
    console.log(`  ✓ Saved ${contractData.summary.totalPoolsFound} blueprint pools to contract-blueprints.json`)
  }

  // Extract global.ini data
  console.log('\n[5/5] Extracting global.ini metadata...')
  const globalData = extractGlobalData()
  if (globalData) {
    const globalPath = join(dataDir, 'starstrings-global.json')
    writeFileSync(globalPath, JSON.stringify(globalData, null, 2))
    console.log(`  ✓ Saved standing levels and BP counts to starstrings-global.json`)
  }

  console.log('\n' + '='.repeat(60))
  console.log('Extraction complete!')
  console.log('='.repeat(60))

  // Summary
  console.log('\nFiles created:')
  if (miningData) console.log('  - src/data/mining-locations.json')
  if (componentData) console.log('  - src/data/component-types.json')
  if (ordnanceData) console.log('  - src/data/ordnance.json')
  if (contractData) console.log('  - src/data/contract-blueprints.json')
  if (globalData) console.log('  - src/data/starstrings-global.json')
}

main().catch(console.error)
