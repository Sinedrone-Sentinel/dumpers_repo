import { isWholeUnitResource } from '../config/resourceTypes'
import type {
  BlueprintRequirementOption,
  BlueprintWithSlots,
} from './blueprintResources'
import {
  craftMaterialLabel,
  craftMaterialOptionsForSlot,
  craftMaterialResourceKey,
} from './blueprintResources'
import { fromMilliScu, toMilliScu } from './resourceQuantity'

/** Minimum stock ratio (have ÷ need) to count as "within 30% of enough". */
export const NEARLY_CRAFTABLE_MIN_RATIO = 0.7

function quantityPerCraftForOption(
  option: BlueprintRequirementOption,
  slotCount: number,
  resourceKey: string
): number {
  const optQty = option.quantity ?? 1
  if (isWholeUnitResource(resourceKey)) {
    return slotCount * optQty
  }
  const units = option.standardCargoUnits ?? option.quantity ?? 0
  return fromMilliScu(toMilliScu(units) * slotCount)
}

function hasEnoughStock(resourceKey: string, need: number, have: number): boolean {
  if (need <= 0) return true
  if (isWholeUnitResource(resourceKey)) {
    return Math.trunc(have) >= Math.trunc(need)
  }
  return have + 1e-9 >= need
}

function stockRatio(resourceKey: string, need: number, have: number): number {
  if (need <= 0) return 1
  if (isWholeUnitResource(resourceKey)) {
    const needUnits = Math.trunc(need)
    if (needUnits <= 0) return 1
    return Math.trunc(have) / needUnits
  }
  return have / need
}

/** Best OR choice per slot — option with the highest have÷need ratio. */
function aggregateBestSlotRequirements(
  blueprint: BlueprintWithSlots,
  quantityByKey: Record<string, number>,
  craftQuantity: number
): Map<string, { need: number; have: number }> | null {
  const slots = blueprint.slots ?? []
  if (slots.length === 0) return null

  const craftQty = Math.max(1, craftQuantity)
  const totals = new Map<string, { need: number; have: number }>()

  for (const slot of slots) {
    const materialOptions = craftMaterialOptionsForSlot(slot)
    if (materialOptions.length === 0) return null

    const slotCount = slot.requiredCount ?? 1
    let best: { resourceKey: string; need: number; have: number; ratio: number } | null = null

    for (const option of materialOptions) {
      const label = craftMaterialLabel(option)
      if (!label) continue

      const resourceKey = craftMaterialResourceKey(option)
      if (!resourceKey) continue

      const need = quantityPerCraftForOption(option, slotCount, resourceKey) * craftQty
      const have = quantityByKey[resourceKey] ?? 0
      const ratio = stockRatio(resourceKey, need, have)

      if (
        !best ||
        ratio > best.ratio ||
        (ratio === best.ratio && need > best.need)
      ) {
        best = { resourceKey, need, have, ratio }
      }
    }

    if (!best) return null

    const existing = totals.get(best.resourceKey)
    if (existing) {
      existing.need += best.need
    } else {
      totals.set(best.resourceKey, { need: best.need, have: best.have })
    }
  }

  return totals
}

/** True when every slot has a material option the tracked inventory can satisfy (OR per slot). */
export function canCraftBlueprint(
  blueprint: BlueprintWithSlots,
  quantityByKey: Record<string, number>,
  craftQuantity = 1
): boolean {
  const requirements = aggregateBestSlotRequirements(blueprint, quantityByKey, craftQuantity)
  if (!requirements) return false

  for (const [resourceKey, { need, have }] of requirements.entries()) {
    if (!hasEnoughStock(resourceKey, need, have)) return false
  }

  return true
}

/**
 * "Close, no cigar" — not fully craftable, but nearly there:
 * 1. Every required material is at least 70% on hand, or
 * 2. (2+ materials) Every required material is fully stocked except exactly one
 *    (that one may be any amount, including 0%).
 * Single-material recipes must satisfy rule 1 only.
 */
export function isNearlyCraftableBlueprint(
  blueprint: BlueprintWithSlots,
  quantityByKey: Record<string, number>,
  craftQuantity = 1
): boolean {
  if (canCraftBlueprint(blueprint, quantityByKey, craftQuantity)) return false

  const requirements = aggregateBestSlotRequirements(blueprint, quantityByKey, craftQuantity)
  if (!requirements) return false

  const ratios: number[] = []
  for (const [resourceKey, { need, have }] of requirements.entries()) {
    if (need <= 0) continue
    ratios.push(stockRatio(resourceKey, need, have))
  }

  if (ratios.length === 0) return false

  const minRatio = Math.min(...ratios)
  if (minRatio >= NEARLY_CRAFTABLE_MIN_RATIO - 1e-9) return true

  if (ratios.length === 1) return false

  const belowFullCount = ratios.filter((ratio) => ratio < 1 - 1e-9).length
  return belowFullCount === 1
}

export function matchesCanCraftTabBlueprint(
  blueprint: BlueprintWithSlots,
  quantityByKey: Record<string, number>,
  includeCloseNoCigar: boolean,
  craftQuantity = 1
): boolean {
  if (canCraftBlueprint(blueprint, quantityByKey, craftQuantity)) return true
  if (!includeCloseNoCigar) return false
  return isNearlyCraftableBlueprint(blueprint, quantityByKey, craftQuantity)
}
