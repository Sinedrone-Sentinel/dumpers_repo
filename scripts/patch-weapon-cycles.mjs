/**
 * Stamp Weapon_CycleShots / Weapon_CycleSeconds onto guns whose sequence is slower
 * than the stored fire rate. Other item stats stay as they are.
 *
 * Patch day does not use this. `npm run parse-game-data` rewrites the catalog
 * through extractShipItemStats, which already applies the same cycle.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { applyWeaponCycle, fireSequenceCycle, weaponBurstDps } from './lib/shipItemStats.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const catalogPath = path.join(root, 'src/data/game-ship-item-stats.json')
const weaponsDir = path.join(root, 'extracted-data/libs/foundry/records/entities/scitem/ships/weapons')

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, acc)
    else if (entry.name.endsWith('.json')) acc.push(full)
  }
  return acc
}

const files = new Map()
for (const filePath of walk(weaponsDir)) {
  files.set(path.basename(filePath, '.json').toLowerCase(), filePath)
}

const raw = fs.readFileSync(catalogPath, 'utf8')
const nl = raw.includes('\r\n') ? '\r\n' : '\n'
const catalog = JSON.parse(raw)
const patches = []

for (const item of catalog.items || []) {
  if (item.kind !== 'weapon' || !item.stats) continue
  const filePath = files.get(String(item.entityClass || '').toLowerCase())
  if (!filePath) continue
  let json
  try {
    json = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    continue
  }
  const stats = { ...item.stats }
  applyWeaponCycle(stats, fireSequenceCycle(json))
  if (!stats.Weapon_CycleSeconds || stats.Weapon_CycleSeconds === item.stats.Weapon_CycleSeconds) continue
  patches.push({
    entityClass: item.entityClass,
    shots: stats.Weapon_CycleShots,
    seconds: stats.Weapon_CycleSeconds,
    burst: Math.round(weaponBurstDps(stats)),
  })
}

if (patches.length === 0) {
  console.log('No weapon cycles were slower than the stored fire rate.')
  process.exit(0)
}

let next = raw
for (const patch of patches) {
  const marker = `"entityClass": "${patch.entityClass}"`
  const start = next.indexOf(marker)
  if (start < 0) throw new Error(`Missing catalog row ${patch.entityClass}`)
  const nextRow = next.indexOf('"entityClass":', start + marker.length)
  const end = nextRow < 0 ? next.length : nextRow
  const statsAt = next.indexOf('"stats": {', start)
  if (statsAt < 0 || statsAt > end) throw new Error(`Missing stats for ${patch.entityClass}`)
  if (next.slice(statsAt, end).includes('Weapon_CycleShots')) continue
  const insert = `${nl}        "Weapon_CycleShots": ${patch.shots},${nl}        "Weapon_CycleSeconds": ${patch.seconds},`
  next = next.slice(0, statsAt + '"stats": {'.length) + insert + next.slice(statsAt + '"stats": {'.length)
  const burstStart = next.indexOf('"burstDps":', start)
  const burstEnd = next.indexOf('"entityClass":', start + marker.length)
  if (burstStart < 0 || (burstEnd > 0 && burstStart > burstEnd)) continue
  const burstSlice = next.slice(burstStart, burstStart + 40)
  const replaced = burstSlice.replace(/"burstDps":\s*[0-9.]+/, `"burstDps": ${patch.burst}`)
  next = next.slice(0, burstStart) + replaced + next.slice(burstStart + burstSlice.length)
}

fs.writeFileSync(catalogPath, next, 'utf8')
console.log(`Patched ${patches.length} weapons.`)
