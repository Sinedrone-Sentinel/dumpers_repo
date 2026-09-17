import { isWholeUnitResource } from '../config/resourceTypes'
import {
  craftMaterialLabel,
  craftMaterialOptionsForSlot,
  craftMaterialResourceKey,
  getResourceLabel,
  type BlueprintWithSlots,
} from './blueprintResources'
import { formatResourceOrderQualityLabel } from './dfp'
import { formatQuantityForResource, fromMilliScu, toMilliScu } from './resourceQuantity'

export interface StockDeductNeed {
  resourceKey: string
  quality: number
  quantity: number
}

export interface StockDeductCard {
  resource_key: string
  quality: number
  quantity: number
}

function quantityPerCraft(
  resourceKey: string,
  standardCargoUnits: number | undefined,
  optionQuantity: number | undefined,
  slotCount: number
): number {
  if (isWholeUnitResource(resourceKey)) {
    return slotCount * (optionQuantity ?? 1)
  }
  const units = standardCargoUnits ?? optionQuantity ?? 0
  return fromMilliScu(toMilliScu(units) * slotCount)
}

function addNeed(resourceKey: string, a: number, b: number): number {
  if (isWholeUnitResource(resourceKey)) return Math.trunc(a) + Math.trunc(b)
  return fromMilliScu(toMilliScu(a) + toMilliScu(b))
}

function hasEnough(resourceKey: string, need: number, have: number): boolean {
  if (need <= 0) return true
  if (isWholeUnitResource(resourceKey)) {
    return Math.trunc(have) >= Math.trunc(need)
  }
  return toMilliScu(have) >= toMilliScu(need)
}

function stockKey(resourceKey: string, quality: number): string {
  return resourceKey + '::' + String(quality)
}

function slotQualityAt(
  slotIndex: number,
  slotQualities: Record<number, number> | null | undefined,
  minQuality: number
): number {
  const raw = slotQualities?.[slotIndex]
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw)
  return Math.round(minQuality)
}

/** Expand one blueprint x craft count into per-slot (resource, quality, qty) demand. */
export function blueprintLineDeductPlan(
  blueprint: BlueprintWithSlots,
  craftQuantity: number,
  slotQualities: Record<number, number> | null | undefined,
  minQuality: number
): StockDeductNeed[] {
  const craftQty = Math.max(1, Math.trunc(craftQuantity) || 1)
  const merged = new Map<string, StockDeductNeed>()

  ;(blueprint.slots ?? []).forEach((slot, slotIndex) => {
    const option = craftMaterialOptionsForSlot(slot)[0]
    if (!option) return
    const label = craftMaterialLabel(option)
    if (!label) return
    const resourceKey = craftMaterialResourceKey(option)
    if (!resourceKey) return

    const quality = slotQualityAt(slotIndex, slotQualities, minQuality)
    const perCraft = quantityPerCraft(
      resourceKey,
      option.standardCargoUnits,
      option.quantity,
      slot.requiredCount ?? 1
    )
    const quantity = isWholeUnitResource(resourceKey)
      ? Math.trunc(perCraft) * craftQty
      : fromMilliScu(toMilliScu(perCraft) * craftQty)
    if (quantity <= 0) return

    const key = stockKey(resourceKey, quality)
    const existing = merged.get(key)
    if (existing) {
      existing.quantity = addNeed(resourceKey, existing.quantity, quantity)
    } else {
      merged.set(key, { resourceKey, quality, quantity })
    }
  })

  return [...merged.values()]
}

export function resourceLineDeductPlan(
  resourceKey: string,
  quality: number,
  quantity: number
): StockDeductNeed[] {
  if (!resourceKey || !(quantity > 0)) return []
  const qty = isWholeUnitResource(resourceKey) ? Math.trunc(quantity) : quantity
  if (qty <= 0) return []
  return [{ resourceKey, quality: Math.round(quality), quantity: qty }]
}

export function mergeDeductPlans(plans: StockDeductNeed[][]): StockDeductNeed[] {
  const merged = new Map<string, StockDeductNeed>()
  for (const plan of plans) {
    for (const row of plan) {
      const key = stockKey(row.resourceKey, row.quality)
      const existing = merged.get(key)
      if (existing) {
        existing.quantity = addNeed(row.resourceKey, existing.quantity, row.quantity)
      } else {
        merged.set(key, { ...row })
      }
    }
  }
  return [...merged.values()]
}

export function buildStockByQuality(cards: StockDeductCard[]): Map<string, number> {
  const index = new Map<string, number>()
  for (const card of cards) {
    const qty = Number(card.quantity)
    if (!Number.isFinite(qty) || qty <= 0) continue
    const key = stockKey(card.resource_key, card.quality)
    const have = index.get(key) ?? 0
    index.set(key, addNeed(card.resource_key, have, qty))
  }
  return index
}

export function planFitsStock(plan: StockDeductNeed[], stock: Map<string, number>): boolean {
  if (plan.length === 0) return false
  for (const row of plan) {
    const have = stock.get(stockKey(row.resourceKey, row.quality)) ?? 0
    if (!hasEnough(row.resourceKey, row.quantity, have)) return false
  }
  return true
}

export function subtractPlan(
  stock: Map<string, number>,
  plan: StockDeductNeed[]
): Map<string, number> {
  const next = new Map(stock)
  for (const row of plan) {
    const key = stockKey(row.resourceKey, row.quality)
    const have = next.get(key) ?? 0
    if (isWholeUnitResource(row.resourceKey)) {
      next.set(key, Math.max(0, Math.trunc(have) - Math.trunc(row.quantity)))
    } else {
      next.set(key, fromMilliScu(Math.max(0, toMilliScu(have) - toMilliScu(row.quantity))))
    }
  }
  return next
}

export type DeductLineInput = {
  id: string
  /** Line is part of the current selection (WTB fulfill) or always true (WTS listing). */
  active: boolean
  wantDeduct: boolean
  plan: StockDeductNeed[]
  /** Listing lines already saved on: stay visible so the seller can uncheck when stock is short. */
  keepWanted?: boolean
}

export type DeductLineResult = {
  enabled: boolean
  checked: boolean
  fits: boolean
}

/** Walk active lines in order; later deduct boxes disable when remaining stock cannot cover. */
export function evaluateDeductCheckboxes(
  lines: DeductLineInput[],
  cards: StockDeductCard[]
): Record<string, DeductLineResult> {
  let remaining = buildStockByQuality(cards)
  const out: Record<string, DeductLineResult> = {}

  for (const line of lines) {
    if (!line.active || line.plan.length === 0) {
      out[line.id] = { enabled: false, checked: false, fits: false }
      continue
    }
    const fits = planFitsStock(line.plan, remaining)
    const checked = line.wantDeduct && (fits || !!line.keepWanted)
    const enabled = fits || checked
    out[line.id] = { enabled, checked, fits }
    if (line.wantDeduct && fits) remaining = subtractPlan(remaining, line.plan)
  }

  return out
}

export function deductPlanToRpc(plan: StockDeductNeed[]): {
  resource_key: string
  quality: number
  quantity: number
}[] {
  return plan.map((row) => ({
    resource_key: row.resourceKey,
    quality: row.quality,
    quantity: row.quantity,
  }))
}

export function parseStoredDeductPlan(raw: unknown): StockDeductNeed[] {
  if (!Array.isArray(raw)) return []
  const parsed: StockDeductNeed[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const record = row as Record<string, unknown>
    const resourceKey =
      typeof record.resource_key === 'string'
        ? record.resource_key
        : typeof record.resourceKey === 'string'
          ? record.resourceKey
          : ''
    const quality = Number(record.quality)
    const quantity = Number(record.quantity)
    if (!resourceKey || !Number.isFinite(quality) || !Number.isFinite(quantity) || quantity <= 0) {
      continue
    }
    parsed.push({ resourceKey, quality: Math.round(quality), quantity })
  }
  return parsed
}

export function collectOrderDeductPlan(
  order: {
    blueprints?: Array<{
      deduct_from_stock?: boolean | null
      deduct_plan?: unknown
      blueprint_id: string
      quantity: number
      slot_qualities?: Record<number, number> | null
      min_quality: number
    }>
    resource_lines?: Array<{
      deduct_from_stock?: boolean | null
      resource_key: string
      min_quality: number
      quantity_scu: number
    }>
  },
  blueprintById: Map<string, BlueprintWithSlots>
): StockDeductNeed[] {
  const plans: StockDeductNeed[][] = []

  for (const line of order.blueprints ?? []) {
    if (!line.deduct_from_stock) continue
    const stored = parseStoredDeductPlan(line.deduct_plan)
    if (stored.length > 0) {
      plans.push(stored)
      continue
    }
    const blueprint = blueprintById.get(line.blueprint_id)
    if (!blueprint) continue
    plans.push(
      blueprintLineDeductPlan(blueprint, line.quantity, line.slot_qualities, line.min_quality)
    )
  }

  for (const line of order.resource_lines ?? []) {
    if (!line.deduct_from_stock) continue
    plans.push(resourceLineDeductPlan(line.resource_key, line.min_quality, Number(line.quantity_scu)))
  }

  return mergeDeductPlans(plans)
}

export function formatDeductPlanHint(
  plan: StockDeductNeed[],
  labelMap: Record<string, string>
): string {
  return plan
    .map((row) => {
      const label = getResourceLabel(row.resourceKey, labelMap)
      const qty = formatQuantityForResource(row.resourceKey, row.quantity)
      const quality = formatResourceOrderQualityLabel(row.resourceKey, label, row.quality)
      return qty + ' ' + label + ' ' + quality
    })
    .join(' · ')
}

