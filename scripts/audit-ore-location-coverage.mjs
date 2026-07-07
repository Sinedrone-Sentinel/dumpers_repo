#!/usr/bin/env node
/**
 * Audit ore×location coverage across compendium, HPP, spawn profiles, and site data.
 * Exits non-zero when spawn-backed ores list compendium-only sites with no HPP link.
 */

import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { collectHppMineableSiteLinks } from './lib/mergeHppMineableLocations.mjs'
import { buildLocationAliases } from './lib/miningLocationAliases.mjs'
import { normalizeMineableLabel } from './lib/miningOreNames.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const EXTRACTED_DATA = join(PROJECT_ROOT, 'extracted-data')
const LOCATIONS_FILE = join(PROJECT_ROOT, 'src', 'data', 'game-mining-locations.json')
const SPAWNS_FILE = join(PROJECT_ROOT, 'src', 'data', 'game-mining-spawns.json')

const BROAD = new Set([
  'All Moons/Planets/Caves',
  'All Pyro Planets',
  'Pyro Asteroid Clusters',
  'Found in All Stanton Deposits (Rare)',
  'QV Breaker Stations (Nyx)',
])

function loadLocalization() {
  const path = join(EXTRACTED_DATA, 'Data', 'Localization', 'english', 'global.ini')
  const raw = readFileSync(path, 'utf-8')
  const localization = {}
  for (const line of raw.split(/\r?\n/)) {
    if (!line.includes('=')) continue
    const eq = line.indexOf('=')
    localization[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return localization
}

function compendiumOreLocations(localization) {
  const comp = localization.Journal_General_Mining_Compendium_Content ?? ''
  const map = {}
  for (const line of comp.split('\\n')) {
    const match = line.match(/^([A-Za-z]+)\s*-\s*(.+)$/i)
    if (!match) continue
    map[match[1]] = match[2].split(',').map((l) => l.trim()).filter(Boolean)
  }
  return map
}

function siteMineablesFor(ore, locationMineables) {
  const canonical = normalizeMineableLabel(ore).toLowerCase()
  const sites = []
  for (const [guideLoc, mineables] of Object.entries(locationMineables ?? {})) {
    const labels = [
      ...(mineables.shipMineables ?? []),
      ...(mineables.handMineables ?? []),
      ...(mineables.groundVehicleMineables ?? []),
    ]
    if (labels.some((l) => normalizeMineableLabel(l).toLowerCase() === canonical)) {
      sites.push(guideLoc)
    }
  }
  return sites
}

const locations = JSON.parse(readFileSync(LOCATIONS_FILE, 'utf-8'))
const spawns = JSON.parse(readFileSync(SPAWNS_FILE, 'utf-8'))
const localization = loadLocalization()
const compendium = compendiumOreLocations(localization)
const locationAliases = buildLocationAliases(localization, EXTRACTED_DATA)
const hppLinks = collectHppMineableSiteLinks({ extractedDataRoot: EXTRACTED_DATA, locationAliases })

const hppByOre = new Map()
for (const link of hppLinks) {
  if (link.groupName !== 'SpaceShip_Mineables') continue
  if (!hppByOre.has(link.ore)) hppByOre.set(link.ore, new Set())
  hppByOre.get(link.ore).add(link.guideLoc)
}

const spawnByOre = new Map()
for (const [ore, profile] of Object.entries(spawns.ores ?? {})) {
  const sites = new Set()
  for (const loc of Object.values(profile.locations ?? {})) {
    if (loc.guideName) sites.add(loc.guideName)
  }
  if (sites.size) spawnByOre.set(ore, sites)
}

const issues = []

for (const [ore, spawnSites] of spawnByOre) {
  const listed = new Set(locations.oreLocations?.[ore] ?? [])
  const comp = new Set((compendium[ore] ?? []).filter((l) => !BROAD.has(l)))
  const hpp = hppByOre.get(ore) ?? new Set()
  const site = new Set(siteMineablesFor(ore, locations.locationMineables))

  for (const loc of spawnSites) {
    if (!listed.has(loc)) {
      issues.push({ type: 'missing-listed', ore, loc, source: 'spawn' })
    }
  }

  for (const loc of listed) {
    if (BROAD.has(loc)) continue
    if (!spawnSites.has(loc) && !hpp.has(loc) && !site.has(loc)) {
      issues.push({ type: 'unsupported-listed', ore, loc, compendium: comp.has(loc) })
    }
  }

  for (const loc of comp) {
    if (!spawnSites.has(loc) && !hpp.has(loc)) {
      issues.push({ type: 'compendium-only', ore, loc })
    }
  }
}

console.log(`Spawn-backed ores: ${spawnByOre.size}`)
console.log(`Issues: ${issues.length}`)

const byType = {}
for (const issue of issues) {
  byType[issue.type] = (byType[issue.type] ?? 0) + 1
}
console.log('By type:', byType)

if (issues.length > 0) {
  console.log('\nSample issues:')
  for (const issue of issues.slice(0, 40)) {
    console.log(`  [${issue.type}] ${issue.ore} @ ${issue.loc}`)
  }
}

const ouratite = {
  listed: locations.oreLocations?.Ouratite ?? [],
  spawn: [...(spawnByOre.get('Ouratite') ?? [])],
  hpp: [...(hppByOre.get('Ouratite') ?? [])],
  compendium: compendium.Ouratite ?? [],
}
console.log('\nOuratite snapshot:', ouratite)

process.exit(issues.length > 0 ? 1 : 0)
