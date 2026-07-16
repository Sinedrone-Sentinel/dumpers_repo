#!/usr/bin/env node
/**
 * Audit blueprint card DFP (standard Q0 / band-2 slot qualities) and flag peer outliers.
 * Ammo blueprints are excluded — ammo DFP should stay in double/triple-digit aUEC.
 *
 * Usage: node scripts/audit-blueprint-dfp.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'src/data/game-blueprints.json'), 'utf8'))
const qualityBands = JSON.parse(
  fs.readFileSync(path.join(root, 'src/data/game-quality-bands.json'), 'utf8'),
)
const engine = await import(pathToFileURL(path.join(root, 'public/dfp-engine.js')).href)

const AMMO_CRAFT_MATERIAL_QUALITY = 1
const DEFAULT_QUALITY_BAND_INDEX = 1
const DEFAULT_QUALITY = 500

const RESOURCE_ALIASES = {
  quantanium: 'quantainium',
  aluminium: 'aluminum',
  pressurizedice: 'rawice',
  yormandieye: 'beryl',
  yormanditongue: 'beryl',
  sileron: 'stileron',
}

function normalizeResourceName(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, '')
    .replace(/^raw\s+/i, '')
    .replace(/\s+/g, '')
    .replace(/_/g, '')
    .trim()
}

function getResourceBands(resourceName) {
  const norm = normalizeResourceName(resourceName)
  const key = RESOURCE_ALIASES[norm] ?? norm
  return qualityBands.bandThresholds[key]
}

function defaultQualityForSlotResource(resourceName) {
  const bands = getResourceBands(resourceName)
  if (bands?.length) return bands[DEFAULT_QUALITY_BAND_INDEX] ?? bands[0]
  return DEFAULT_QUALITY
}

function resolveSlotResourceName(slot) {
  const option = slot?.options?.[0]
  return option?.resourceName || option?.entityName || option?.displayName || option?.itemName || ''
}

function buildDefaultSlotQualities(blueprint) {
  const qualities = {}
  const slots = blueprint.slots ?? []
  const isAmmo = blueprint.categoryName === 'Ammo'
  for (let i = 0; i < slots.length; i++) {
    qualities[i] = isAmmo
      ? AMMO_CRAFT_MATERIAL_QUALITY
      : defaultQualityForSlotResource(resolveSlotResourceName(slots[i]))
  }
  return qualities
}

function isAmmoBlueprint(bp) {
  return bp.categoryName === 'Ammo'
}

function partsFromQualities(slotQualities) {
  return Object.entries(slotQualities).map(([idx, quality]) => ({
    slotIndex: Number(idx),
    quality,
  }))
}

function cardDfp(bp) {
  const opts = {
    bandThresholdsForResource: (name) => getResourceBands(name),
  }
  if (isAmmoBlueprint(bp)) {
    return engine.calculateBlueprintDfp(bp, opts)
  }
  const parts = partsFromQualities(buildDefaultSlotQualities(bp))
  return engine.calculateBlueprintDfp(bp, { ...opts, parts })
}

function inferWeaponSubtype(bp) {
  if (bp.subtype) return bp.subtype
  const n = (bp.blueprintName || '').toLowerCase()
  if (n.includes('pistol')) return 'pistol'
  if (n.includes('rifle') && !n.includes('sniper')) return 'rifle'
  if (n.includes('sniper')) return 'sniper'
  if (n.includes('shotgun')) return 'shotgun'
  if (n.includes('smg')) return 'smg'
  if (n.includes('hmg')) return 'hmg'
  if (n.includes('lmg')) return 'lmg'
  if (n.includes('crossbow')) return 'crossbow'
  return 'other'
}

function peerKey(bp) {
  const cat = bp.categoryName || 'unknown'
  if (cat === 'FPSWeapons') return `FPSWeapons:${inferWeaponSubtype(bp)}`
  if (cat === 'FPSArmours') {
    const weight = bp.armorWeight || bp.subtype || 'unknown'
    const slot = bp.armorSlot || 'unknown'
    return `FPSArmours:${weight}:${slot}`
  }
  if (cat === 'Ammo') return `Ammo:${inferWeaponSubtype(bp)}`
  if (cat.startsWith('Veh. Comp.')) {
    const size = cat.match(/S\d+/)?.[0] || '?'
    return `VehComp:${size}:${bp.subCategoryName || bp.subtype || 'component'}`
  }
  if (cat.startsWith('Veh. Weapons')) {
    const size = cat.match(/S\d+/)?.[0] || '?'
    return `VehWeapon:${size}`
  }
  if (cat === 'MissionItem') return 'MissionItem'
  return cat
}

function fmt(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

function median(nums) {
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function isListable(bp) {
  return (bp.internalName || bp.file) && bp.entityClass != null && bp.blueprintName
}

const rows = []
for (const bp of catalog.blueprints) {
  if (!isListable(bp) || isAmmoBlueprint(bp)) continue
  const d = cardDfp(bp)
  rows.push({
    name: bp.blueprintName,
    internal: bp.internalName,
    category: bp.categoryName,
    peer: peerKey(bp),
    isReward: !!bp.isReward,
    material: d.materialTotal ?? 0,
    acquisition: d.acquisitionPremium ?? 0,
    labor: d.craftLaborPremium ?? 0,
    total: d.total ?? 0,
    missions: (bp.rewardMissions || []).map((m) => m.mission).slice(0, 2),
  })
}

const byPeer = new Map()
for (const row of rows) {
  if (!byPeer.has(row.peer)) byPeer.set(row.peer, [])
  byPeer.get(row.peer).push(row)
}

const HIGH_RATIO = 3
const LOW_RATIO = 1 / 3
const outliers = []

for (const [peer, members] of byPeer) {
  if (members.length < 3) continue
  const totals = members.map((m) => m.total)
  const med = median(totals)
  if (med <= 0) continue
  for (const m of members) {
    if (m.total >= med * HIGH_RATIO) {
      outliers.push({ ...m, peer, peerMed: med, dir: 'HIGH', ratio: m.total / med })
    } else if (m.total <= med * LOW_RATIO && m.total > 0) {
      outliers.push({ ...m, peer, peerMed: med, dir: 'LOW', ratio: m.total / med })
    }
  }
}

outliers.sort((a, b) => b.ratio - a.ratio || b.total - a.total)

console.log(
  `Blueprint DFP audit — ${rows.length} listable non-ammo items (Q0 / band-2 slot qualities)\n`,
)

console.log('=== TOP 25 HIGHEST TOTAL DFP ===')
for (const r of [...rows].sort((a, b) => b.total - a.total).slice(0, 25)) {
  console.log(
    `  ${fmt(r.total).padStart(8)} | mat ${fmt(r.material).padStart(8)} acq ${fmt(r.acquisition).padStart(8)} | ${r.name}`,
  )
  if (r.missions.length) console.log(`           missions: ${r.missions.join('; ')}`)
}

console.log('\n=== TOP 25 LOWEST TOTAL DFP (rewards only) ===')
for (const r of [...rows].filter((x) => x.isReward).sort((a, b) => a.total - b.total).slice(0, 25)) {
  console.log(
    `  ${fmt(r.total).padStart(8)} | mat ${fmt(r.material).padStart(8)} acq ${fmt(r.acquisition).padStart(8)} | ${r.name}`,
  )
  if (r.missions.length) console.log(`           missions: ${r.missions.join('; ')}`)
}

console.log('\n=== ACQUISITION PREMIUM DOMINATED (acq >= 10× materials, total >= 500k) ===')
const acqDom = rows
  .filter((r) => r.acquisition >= 10 * r.material && r.total >= 500_000)
  .sort((a, b) => b.total - a.total)
for (const r of acqDom.slice(0, 30)) {
  console.log(
    `  ${fmt(r.total).padStart(8)} | mat ${fmt(r.material).padStart(8)} acq ${fmt(r.acquisition).padStart(8)} | ${r.name}`,
  )
  if (r.missions.length) console.log(`           missions: ${r.missions.join('; ')}`)
}
if (acqDom.length > 30) console.log(`  ... +${acqDom.length - 30} more`)

console.log(`\n=== PEER OUTLIERS (${outliers.length} items, group size >= 3, >=3× or <=⅓× peer median) ===`)
for (const o of outliers) {
  const tag = o.dir === 'HIGH' ? 'HIGH' : 'LOW '
  console.log(
    `  [${tag}] ${o.peer} | ${fmt(o.total)} vs peer med ${fmt(o.peerMed)} (${o.ratio.toFixed(1)}×) | ${o.name}`,
  )
  console.log(
    `         mat ${fmt(o.material)} acq ${fmt(o.acquisition)}${o.isReward ? ' | reward' : ''}`,
  )
  if (o.missions.length) console.log(`         ${o.missions.join('; ')}`)
}

// Spot checks from user report
console.log('\n=== SPOT CHECKS ===')
for (const needle of ['Coda', 'Tripledown', 'Vendetta', 'Scalpel', 'Ripper', 'Pulverizer']) {
  const hits = rows.filter((r) => r.name.includes(needle))
  for (const r of hits) {
    console.log(
      `  ${r.name}: total ${fmt(r.total)} (mat ${fmt(r.material)}, acq ${fmt(r.acquisition)}) peer=${r.peer}`,
    )
  }
}
