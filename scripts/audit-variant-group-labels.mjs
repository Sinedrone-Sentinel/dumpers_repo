/**
 * Audit FPS variant group summary labels (Base + N vs N variants).
 * Run: node scripts/audit-variant-group-labels.mjs
 */
import gameBlueprints from '../src/data/game-blueprints.json' with { type: 'json' }
import {
  buildBlueprintGridItems,
  getVariantGroupSummary,
} from '../src/lib/blueprintVariantGroups.ts'

function oldSummary(members, categoryName) {
  const countOldBase = (m) => {
    if (categoryName === 'FPSWeapons') return !/"[^"]+"/.test(m.blueprintName || '')
    return /_01$/.test(m.internalName || '')
  }
  const baseCount = members.filter(countOldBase).length
  const variantCount = members.length - baseCount
  if (baseCount >= 1 && variantCount >= 1) {
    return `Base + ${variantCount} variant${variantCount !== 1 ? 's' : ''}`
  }
  return `${members.length} variant${members.length !== 1 ? 's' : ''}`
}

const armours = gameBlueprints.blueprints.filter((b) => b.categoryName === 'FPSArmours')
const weapons = gameBlueprints.blueprints.filter((b) => b.categoryName === 'FPSWeapons')

const falseBaseLabels = []
for (const list of [armours, weapons]) {
  const items = buildBlueprintGridItems(list, true)
  for (const item of items) {
    if (item.kind !== 'group') continue
    const oldS = oldSummary(item.members, item.categoryName)
    const newS = getVariantGroupSummary(item.members, item.categoryName)
    if (oldS.startsWith('Base') && !newS.startsWith('Base')) {
      falseBaseLabels.push({
        family: item.familyLabel,
        category: item.categoryName,
        count: item.members.length,
        oldS,
        newS,
      })
    }
  }
}

console.log(`False "Base + …" labels fixed: ${falseBaseLabels.length}`)
for (const row of falseBaseLabels) {
  console.log(`- ${row.family} (${row.category}, ${row.count}): ${row.oldS} → ${row.newS}`)
}
