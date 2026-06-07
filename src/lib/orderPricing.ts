import { AMMO_ORDER_MIN_QUALITY, orderMinQualityForResource } from '../config/dfp'
import { extractOrderLineItemsFromBlueprints, type BlueprintWithSlots } from './blueprintResources'
import {
  calculateBlueprintDfp,
  calculateBlueprintDfpForOrder,
  calculateMaterialDfpPrice,
  isAmmoBlueprint,
} from './dfp'
import type {
  CustomOrder,
  CustomOrderBlueprint,
  CustomOrderResourceLine,
} from './operations'
import { roundResourceQuantity } from './resourceQuantity'

export interface OrderBlueprintLine {
  blueprintId: string
  blueprintTitle: string
  minQuality: number
  quantity: number
  unitDfpAuec: number
  lineDfpAuec: number
}

export interface OrderResourceLine {
  resourceKey: string
  resourceLabel: string
  minQuality: number
  quantityScu: number
  unitDfpAuec: number
  lineDfpAuec: number
}

export function orderMinQualityForBlueprint(
  blueprint: BlueprintWithSlots,
  selectedQuality: number
): number {
  if (isAmmoBlueprint(blueprint)) return AMMO_ORDER_MIN_QUALITY
  return selectedQuality
}

export function pricingForBlueprintLine(
  blueprint: BlueprintWithSlots,
  minQuality: number,
  quantity: number
): { unitDfpAuec: number; lineDfpAuec: number; orderMinQuality: number } {
  const qty = Math.max(1, quantity)
  const orderMinQuality = orderMinQualityForBlueprint(blueprint, minQuality)

  const dfp = isAmmoBlueprint(blueprint)
    ? calculateBlueprintDfp(blueprint)
    : calculateBlueprintDfpForOrder(blueprint, orderMinQuality, qty)

  const lineDfpAuec = isAmmoBlueprint(blueprint)
    ? Math.round(dfp.total * qty)
    : dfp.total
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
        quantity: row.quantity,
        unitDfpAuec: Number(row.unit_dfp_auec),
        lineDfpAuec: Number(row.line_dfp_auec),
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
  const qty = roundResourceQuantity(Math.max(RESOURCE_MIN_SCU, quantityScu))
  const orderMinQuality = orderMinQualityForResource(resourceKey, resourceLabel, minQuality)
  const lineDfpAuec = calculateMaterialDfpPrice(resourceLabel, orderMinQuality, qty)
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
        quantityScu: Number(row.quantity_scu),
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
    totals.set(item.resourceKey, (totals.get(item.resourceKey) ?? 0) + item.quantity)
  }

  for (const line of input.resourceLines) {
    totals.set(
      line.resourceKey,
      roundResourceQuantity((totals.get(line.resourceKey) ?? 0) + line.quantityScu)
    )
  }

  return [...totals.entries()]
    .map(([resourceKey, quantity]) => ({ resourceKey, quantity }))
    .sort((a, b) => a.resourceKey.localeCompare(b.resourceKey))
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

export function buildOrderTitle(
  blueprintCount: number,
  resourceCount: number
): string {
  if (blueprintCount > 0 && resourceCount > 0) {
    return `${blueprintCount} blueprint + ${resourceCount} resource order`
  }
  if (blueprintCount === 1) return 'Blueprint order'
  if (blueprintCount > 1) return `${blueprintCount} blueprint order`
  if (resourceCount === 1) return 'Resource order'
  return `${resourceCount} resource order`
}
