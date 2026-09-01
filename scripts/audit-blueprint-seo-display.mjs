/**
 * Fail if any public SEO blueprint page would leak internal material ids
 * or ~mission() placeholders. Uses the same helpers as generate-blueprint-seo-pages.
 *
 * Usage: node scripts/audit-blueprint-seo-display.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasBlueprintSeoEntity } from './lib/blueprintSeoSlug.mjs'
import {
  cleanSeoMissionTitle,
  looksInternalSeoLabel,
  looksInternalSeoMissionTitle,
  pickSeoMaterialOption,
  seoMaterialAmount,
  seoMaterialLabel,
} from './lib/blueprintSeoDisplay.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const data = JSON.parse(readFileSync(join(root, 'src/data/game-blueprints.json'), 'utf8'))
const blueprints = data.blueprints ?? []

const materialLeaks = []
const amountGaps = []
const missionLeaks = []

for (const bp of blueprints) {
  if (!hasBlueprintSeoEntity(bp)) continue
  const name = (bp.blueprintName || bp.internalName || bp.file || 'Blueprint').trim()

  for (const slot of bp.slots ?? []) {
    const opt = pickSeoMaterialOption(slot)
    if (!opt) continue
    const label = seoMaterialLabel(opt)
    if (looksInternalSeoLabel(label)) {
      materialLeaks.push(`${name} · ${slot.slotDisplayName || 'Input'}: ${label}`)
    }
    const amount = seoMaterialAmount(opt)
    if (opt.type === 'item' && (opt.quantity != null || opt.count != null) && amount === '—') {
      amountGaps.push(`${name} · ${slot.slotDisplayName || 'Input'}`)
    }
  }

  for (const mission of bp.rewardMissions ?? []) {
    const cleaned = cleanSeoMissionTitle(mission.mission)
    if (cleaned && looksInternalSeoMissionTitle(cleaned)) {
      missionLeaks.push(`${name}: ${cleaned.slice(0, 80)}`)
    }
  }
}

if (materialLeaks.length || amountGaps.length || missionLeaks.length) {
  console.error('SEO display audit failed')
  if (materialLeaks.length) {
    console.error(`\nInternal material labels (${materialLeaks.length}):`)
    for (const row of materialLeaks.slice(0, 20)) console.error(`  ${row}`)
    if (materialLeaks.length > 20) console.error(`  … +${materialLeaks.length - 20} more`)
  }
  if (amountGaps.length) {
    console.error(`\nItem slots with quantity but no amount (${amountGaps.length}):`)
    for (const row of amountGaps.slice(0, 10)) console.error(`  ${row}`)
  }
  if (missionLeaks.length) {
    console.error(`\nMission titles still leaking placeholders (${missionLeaks.length}):`)
    for (const row of missionLeaks.slice(0, 20)) console.error(`  ${row}`)
  }
  process.exit(1)
}

const eligible = blueprints.filter(hasBlueprintSeoEntity).length
console.log(`SEO display audit passed (${eligible} public blueprint pages)`)
