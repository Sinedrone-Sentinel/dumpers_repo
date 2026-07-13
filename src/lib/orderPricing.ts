import { AMMO_ORDER_MIN_QUALITY, orderMinQualityForResource } from '../config/dfp'
import { dfpEngineResourceName } from './dfpResourceNames'
import { minSlotQuality } from './blueprintQuality'
import { getResourceBands } from './qualityBands'
import { extractOrderLineItemsFromBlueprints, type BlueprintWithSlots } from './blueprintResources'
import {
  calculateBlueprintDfp,
  calculateBlueprintDfpWithParts,
  calculateMaterialDfpPrice,
  isAmmoBlueprint,
} from './dfp'
import type {
  CustomOrder,
  CustomOrderBlueprint,
  CustomOrderResourceLine,
} from './operations'
import { isWholeUnitResource } from '../config/resourceTypes'
import {
  fromMilliScu,
  normalizeQuantityForResource,
  normalizeResourceQuantity,
  toMilliScu,
} from './resourceQuantity'

import type { BlueprintLineSnapshot } from './blueprintEffectiveStats'

export interface OrderBlueprintLine {
  blueprintId: string
  blueprintTitle: string
  minQuality: number
  slotQualities?: Record<number, number> | null
  quantity: number
  unitDfpAuec: number
  lineDfpAuec: number
  lineSnapshot?: BlueprintLineSnapshot | null
}

export interface OrderResourceLine {
  resourceKey: string
  resourceLabel: string
  minQuality: number
  quantityScu: number
  unitDfpAuec: number
  lineDfpAuec: number
}

/** Bazaar model: listings are always priced at exact DFP (no adjustments). */
export function createCartPricingFields(
  unitDfpAuec: number,
  lineDfpAuec: number
): {
  baseUnitDfpAuec: number
  baseLineDfpAuec: number
  unitDfpAuec: number
  lineDfpAuec: number
} {
  return {
    baseUnitDfpAuec: unitDfpAuec,
    baseLineDfpAuec: lineDfpAuec,
    unitDfpAuec,
    lineDfpAuec,
  }
}

export function pricingForBlueprintLine(
  blueprint: BlueprintWithSlots,
  slotQualities: Record<number, number>,
  quantity: number
): { unitDfpAuec: number; lineDfpAuec: number; orderMinQuality: number } {
  const qty = Math.max(1, quantity)
  const orderMinQuality = isAmmoBlueprint(blueprint)
    ? AMMO_ORDER_MIN_QUALITY
    : minSlotQuality(slotQualities)

  const dfp = isAmmoBlueprint(blueprint)
    ? calculateBlueprintDfp(blueprint)
    : calculateBlueprintDfpWithParts(blueprint, slotQualities, qty)

  const lineDfpAuec = dfp.total
  const unitDfpAuec = Math.round(lineDfpAuec / qty)

  return { unitDfpAuec, lineDfpAuec, orderMinQuality }
}

export function resolveOrderBlueprintLines(order: CustomOrder): OrderBlueprintLine[] {
  if (order.blueprints && order.blueprints.length > 0) {
    return [...order.blueprints]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((row: CustomOrderBlueprint) => ({
        blueprintId: row.blueprint_id,
        blueprintTitle: row.blueprint_title ?? row.blueprint_id,
        minQuality: row.min_quality,
        slotQualities: row.slot_qualities,
        quantity: row.quantity,
        unitDfpAuec: Number(row.unit_dfp_auec),
        lineDfpAuec: Number(row.line_dfp_auec),
        lineSnapshot: row.line_snapshot ?? null,
      }))
  }

  if (order.blueprint_id) {
    return [
      {
        blueprintId: order.blueprint_id,
        blueprintTitle: order.title,
        minQuality: order.min_quality,
        quantity: order.quantity,
        unitDfpAuec: Number(order.total_dfp_auec) / Math.max(1, order.quantity),
        lineDfpAuec: Number(order.total_dfp_auec),
      },
    ]
  }

  return []
}

export function pricingForResourceLine(
  resourceKey: string,
  resourceLabel: string,
  minQuality: number,
  quantityScu: number
): { unitDfpAuec: number; lineDfpAuec: number; orderMinQuality: number } {
  const minAmount = isWholeUnitResource(resourceKey) ? 1 : RESOURCE_MIN_SCU
  const qty = normalizeQuantityForResource(resourceKey, Math.max(minAmount, quantityScu))
  const orderMinQuality = orderMinQualityForResource(resourceKey, resourceLabel, minQuality)
  const engineName = dfpEngineResourceName(resourceKey, resourceLabel)
  const bands = getResourceBands(resourceLabel)
  const lineDfpAuec = calculateMaterialDfpPrice(engineName, orderMinQuality, qty, bands)
  const unitDfpAuec = qty > 0 ? Math.round(lineDfpAuec / qty) : lineDfpAuec
  return { unitDfpAuec, lineDfpAuec, orderMinQuality }
}

const RESOURCE_MIN_SCU = 0.001

export function resolveOrderResourceLines(order: CustomOrder): OrderResourceLine[] {
  if (order.resource_lines && order.resource_lines.length > 0) {
    return [...order.resource_lines]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((row: CustomOrderResourceLine) => ({
        resourceKey: row.resource_key,
        resourceLabel: row.resource_label,
        minQuality: row.min_quality,
        quantityScu: normalizeResourceQuantity(Number(row.quantity_scu)),
        unitDfpAuec: Number(row.unit_dfp_auec),
        lineDfpAuec: Number(row.line_dfp_auec),
      }))
  }
  return []
}

export function buildOrderFulfillmentItems(input: {
  blueprintLines: { blueprint: BlueprintWithSlots; quantity: number }[]
  resourceLines: { resourceKey: string; quantityScu: number }[]
}): { resourceKey: string; quantity: number }[] {
  const totals = new Map<string, number>()

  for (const item of extractOrderLineItemsFromBlueprints(input.blueprintLines)) {
    if (isWholeUnitResource(item.resourceKey)) {
      totals.set(
        item.resourceKey,
        (totals.get(item.resourceKey) ?? 0) + Math.trunc(item.quantity)
      )
    } else {
      totals.set(
        item.resourceKey,
        (totals.get(item.resourceKey) ?? 0) + toMilliScu(item.quantity)
      )
    }
  }

  for (const line of input.resourceLines) {
    if (isWholeUnitResource(line.resourceKey)) {
      totals.set(
        line.resourceKey,
        (totals.get(line.resourceKey) ?? 0) + Math.trunc(line.quantityScu)
      )
    } else {
      totals.set(
        line.resourceKey,
        (totals.get(line.resourceKey) ?? 0) + toMilliScu(line.quantityScu)
      )
    }
  }

  return [...totals.entries()]
    .map(([resourceKey, amount]) => ({
      resourceKey,
      quantity: isWholeUnitResource(resourceKey)
        ? Math.trunc(amount)
        : fromMilliScu(amount),
    }))
    .filter((row) => row.quantity > 0)
    .sort((a, b) => a.resourceKey.localeCompare(b.resourceKey))
}

export function orderBlueprintCraftCount(order: CustomOrder): number {
  return resolveOrderBlueprintLines(order).reduce((sum, line) => sum + line.quantity, 0)
}

/** Recompute fulfillment SCU from stored order lines + blueprint catalog. */
export function resolveOrderFulfillmentItems(
  order: CustomOrder,
  blueprintById: Map<string, BlueprintWithSlots>
): { resourceKey: string; quantity: number }[] {
  const blueprintLines = resolveOrderBlueprintLines(order)
  const resourceLines = resolveOrderResourceLines(order)

  return buildOrderFulfillmentItems({
    blueprintLines: blueprintLines
      .map((line) => {
        const blueprint = blueprintById.get(line.blueprintId)
        return blueprint ? { blueprint, quantity: line.quantity } : null
      })
      .filter((row): row is { blueprint: BlueprintWithSlots; quantity: number } => row != null),
    resourceLines: resourceLines.map((line) => ({
      resourceKey: line.resourceKey,
      quantityScu: line.quantityScu,
    })),
  })
}

export function orderBlueprintIds(order: CustomOrder): string[] {
  const lines = resolveOrderBlueprintLines(order)
  return lines.map((line) => line.blueprintId)
}

export function orderTotalDfp(order: CustomOrder): number {
  const stored = Number(order.total_dfp_auec)
  if (stored > 0) return stored
  const bp = resolveOrderBlueprintLines(order).reduce((sum, line) => sum + line.lineDfpAuec, 0)
  const res = resolveOrderResourceLines(order).reduce((sum, line) => sum + line.lineDfpAuec, 0)
  return bp + res
}

/** Title uses total crafts requested, not number of cart lines. */
export function buildOrderTitle(
  totalBlueprintCrafts: number,
  resourceLineCount: number
): string {
  if (totalBlueprintCrafts > 0 && resourceLineCount > 0) {
    return `${totalBlueprintCrafts} blueprint + ${resourceLineCount} resource order`
  }
  if (totalBlueprintCrafts === 1) return 'Blueprint order'
  if (totalBlueprintCrafts > 1) return `${totalBlueprintCrafts} blueprint order`
  if (resourceLineCount === 1) return 'Resource order'
  return `${resourceLineCount} resource order`
}
