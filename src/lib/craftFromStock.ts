import { isWholeUnitResource } from '../config/resourceTypes'
import type {
  BlueprintRequirementOption,
  BlueprintSlot,
  BlueprintWithSlots,
} from './blueprintResources'
import { slugifyResourceName } from './blueprintResources'
import { fromMilliScu, toMilliScu } from './resourceQuantity'

/**
 * Craft-from-stock model
 * -----------------------
 * Powers the Can Craft "CRAFT" button. Every craftable blueprint slot maps to a
 * single tracked resource (verified: no slot in game-blueprints.json has >1
 * option). The member picks, per slot, one of the quality tiers they actually
 * hold; CRAFT consumes exactly the required amount at that tier.
 */

/** One personal inventory line — a (resource, quality, note) stock card. */
export interface CraftStockCardLite {
  resource_key: string
  quality: number
  note: string | null
  quantity: number
}

export interface OwnedResourceStock {
  /** quality tier -> total quantity held (summed across notes). */
  byQuality: Map<number, number>
  /** quality tiers with stock on hand, ascending. */
  qualities: number[]
  /** quality tier -> the individual stock cards feeding it. */
  cardsByQuality: Map<number, CraftStockCardLite[]>
}

export type OwnedStockIndex = Map<string, OwnedResourceStock>

/** True when `have` covers `need` for a resource (whole-unit vs SCU aware). */
function hasEnough(resourceKey: string, need: number, have: number): boolean {
  if (need <= 0) return true
  if (isWholeUnitResource(resourceKey)) {
    return Math.trunc(have) >= Math.trunc(need)
  }
  return toMilliScu(have) >= toMilliScu(need)
}

function addNeed(resourceKey: string, a: number, b: number): number {
  if (isWholeUnitResource(resourceKey)) return Math.trunc(a) + Math.trunc(b)
  return fromMilliScu(toMilliScu(a) + toMilliScu(b))
}

/** Index a member's stock cards by resource and quality tier. */
export function buildOwnedStockIndex(cards: CraftStockCardLite[]): OwnedStockIndex {
  const index: OwnedStockIndex = new Map()

  for (const card of cards) {
    const qty = Number(card.quantity)
    if (!Number.isFinite(qty) || qty <= 0) continue
    const key = card.resource_key
    let entry = index.get(key)
    if (!entry) {
      entry = { byQuality: new Map(), qualities: [], cardsByQuality: new Map() }
      index.set(key, entry)
    }
    const list = entry.cardsByQuality.get(card.quality) ?? []
    list.push({
      resource_key: key,
      quality: card.quality,
      note: card.note ?? null,
      quantity: qty,
    })
    entry.cardsByQuality.set(card.quality, list)
  }

  for (const [key, entry] of index) {
    const whole = isWholeUnitResource(key)
    for (const [quality, list] of entry.cardsByQuality) {
      let total = 0
      if (whole) {
        for (const card of list) total += Math.trunc(card.quantity)
      } else {
        let milli = 0
        for (const card of list) milli += toMilliScu(card.quantity)
        total = fromMilliScu(milli)
      }
      entry.byQuality.set(quality, total)
    }
    entry.qualities = [...entry.byQuality.keys()]
      .filter((quality) => (entry.byQuality.get(quality) ?? 0) > 0)
      .sort((a, b) => a - b)
  }

  return index
}

function optionLabel(option: BlueprintRequirementOption): string | null {
  return (
    option.resourceName || option.entityName || option.displayName || option.itemName || null
  )
}

function resourceOptionForSlot(slot: BlueprintSlot): BlueprintRequirementOption | null {
  const options = (slot.options ?? []).filter(
    (option) => !option.type || option.type === 'resource'
  )
  return options[0] ?? null
}

function neededForOption(
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

export interface CraftSlotRequirement {
  slotIndex: number
  slotDisplayName: string
  resourceKey: string
  resourceLabel: string
  needed: number
  wholeUnit: boolean
  /** quality tiers the member holds for this resource (ascending). */
  availableQualities: number[]
}

/** Per-slot resource requirements for a blueprint, annotated with owned tiers. */
export function buildCraftSlotRequirements(
  blueprint: BlueprintWithSlots,
  owned: OwnedStockIndex
): CraftSlotRequirement[] {
  const slots = blueprint.slots ?? []
  const requirements: CraftSlotRequirement[] = []

  slots.forEach((slot, slotIndex) => {
    const option = resourceOptionForSlot(slot)
    if (!option) return
    const label = optionLabel(option)
    if (!label) return
    const resourceKey = slugifyResourceName(label)
    if (!resourceKey) return

    const slotCount = slot.requiredCount ?? 1
    const slotDisplayName = (slot as { slotDisplayName?: string }).slotDisplayName ?? label
    requirements.push({
      slotIndex,
      slotDisplayName,
      resourceKey,
      resourceLabel: label,
      needed: neededForOption(option, slotCount, resourceKey),
      wholeUnit: isWholeUnitResource(resourceKey),
      availableQualities: owned.get(resourceKey)?.qualities ?? [],
    })
  })

  return requirements
}

/**
 * Default quality selection for a slot: the lowest tier that alone covers the
 * requirement (burn low quality first), else the tier with the most on hand,
 * else null when nothing is stocked.
 */
export function defaultCraftQuality(
  req: CraftSlotRequirement,
  owned: OwnedStockIndex
): number | null {
  const stock = owned.get(req.resourceKey)
  if (!stock || stock.qualities.length === 0) return null

  for (const quality of stock.qualities) {
    if (hasEnough(req.resourceKey, req.needed, stock.byQuality.get(quality) ?? 0)) {
      return quality
    }
  }

  let best = stock.qualities[0]
  let bestQty = stock.byQuality.get(best) ?? 0
  for (const quality of stock.qualities) {
    const value = stock.byQuality.get(quality) ?? 0
    if (value > bestQty) {
      best = quality
      bestQty = value
    }
  }
  return best
}

export interface CraftPlanReduction {
  resource_key: string
  quality: number
  note: string | null
  /** positive amount to remove from this card. */
  delta: number
}

export interface CraftSlotStatus {
  slotIndex: number
  slotDisplayName: string
  resourceKey: string
  resourceLabel: string
  quality: number | null
  needed: number
  have: number
  enough: boolean
  wholeUnit: boolean
  availableQualities: number[]
}

export interface CraftPlan {
  ok: boolean
  hasAnyStock: boolean
  slots: CraftSlotStatus[]
  reductions: CraftPlanReduction[]
}

/**
 * Validate a per-slot quality selection against owned stock and, when every
 * slot is satisfied, produce the card-level reductions needed to craft once.
 * Demand is aggregated per (resource, quality) so shared resources across slots
 * are checked and consumed together.
 */
export function resolveCraftPlan(
  requirements: CraftSlotRequirement[],
  selected: Record<number, number | undefined>,
  owned: OwnedStockIndex
): CraftPlan {
  const demand = new Map<string, { resource_key: string; quality: number; needed: number }>()

  for (const req of requirements) {
    const quality = selected[req.slotIndex]
    if (quality == null || !req.availableQualities.includes(quality)) continue
    const key = `${req.resourceKey}::${quality}`
    const existing = demand.get(key)
    if (existing) {
      existing.needed = addNeed(req.resourceKey, existing.needed, req.needed)
    } else {
      demand.set(key, { resource_key: req.resourceKey, quality, needed: req.needed })
    }
  }

  const shortages = new Set<string>()
  for (const [key, entry] of demand) {
    const have = owned.get(entry.resource_key)?.byQuality.get(entry.quality) ?? 0
    if (!hasEnough(entry.resource_key, entry.needed, have)) shortages.add(key)
  }

  const slots: CraftSlotStatus[] = requirements.map((req) => {
    const rawQuality = selected[req.slotIndex]
    const quality =
      rawQuality != null && req.availableQualities.includes(rawQuality) ? rawQuality : null
    const have = quality != null ? owned.get(req.resourceKey)?.byQuality.get(quality) ?? 0 : 0
    const key = quality != null ? `${req.resourceKey}::${quality}` : null
    const enough = key != null && !shortages.has(key)
    return {
      slotIndex: req.slotIndex,
      slotDisplayName: req.slotDisplayName,
      resourceKey: req.resourceKey,
      resourceLabel: req.resourceLabel,
      quality,
      needed: req.needed,
      have,
      enough,
      wholeUnit: req.wholeUnit,
      availableQualities: req.availableQualities,
    }
  })

  const ok = requirements.length > 0 && slots.every((slot) => slot.enough)

  const reductions: CraftPlanReduction[] = []
  if (ok) {
    for (const [, entry] of demand) {
      const cards = owned.get(entry.resource_key)?.cardsByQuality.get(entry.quality) ?? []
      // Consume smaller cards first so partial cards get cleaned up.
      const sorted = [...cards].sort((a, b) => a.quantity - b.quantity)

      if (isWholeUnitResource(entry.resource_key)) {
        let remaining = Math.trunc(entry.needed)
        for (const card of sorted) {
          if (remaining <= 0) break
          const take = Math.min(remaining, Math.trunc(card.quantity))
          if (take > 0) {
            reductions.push({
              resource_key: card.resource_key,
              quality: card.quality,
              note: card.note,
              delta: take,
            })
            remaining -= take
          }
        }
      } else {
        let remainingMilli = toMilliScu(entry.needed)
        for (const card of sorted) {
          if (remainingMilli <= 0) break
          const take = Math.min(remainingMilli, toMilliScu(card.quantity))
          if (take > 0) {
            reductions.push({
              resource_key: card.resource_key,
              quality: card.quality,
              note: card.note,
              delta: fromMilliScu(take),
            })
            remainingMilli -= take
          }
        }
      }
    }
  }

  const hasAnyStock = requirements.some((req) => req.availableQualities.length > 0)

  return { ok, hasAnyStock, slots, reductions }
}
