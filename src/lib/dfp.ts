import { isSalvageResource } from '../config/extraResources'
import {
  AMMO_ORDER_MIN_QUALITY,
  DFP_ASSUMED_QUALITY,
  DFP_BASE_PER_001_cSCU,
  DFP_CRAFT_PREMIUM,
  DFP_DEFAULT_MODIFIER,
  DFP_QUALITY_TIERS,
  DFP_RARITY_MODIFIERS,
  DFP_RESOURCE_ALIASES,
  DFP_SCALE_FACTOR,
  DFP_SHIP_SUBCATEGORY_MODIFIERS,
  DFP_TYPE_MODIFIERS,
  type DfpProductType,
  type DfpSizeKey,
  type DfpSubcategoryModifier,
} from '../config/dfp'

const MIN_SCU = 0.001

export interface DfpLineItem {
  resource: string
  quality: number
  scu: number
  baseValue: number
  modifier: number
  lineTotal: number
}

export interface DfpResult {
  /** Material subtotal before type modifier */
  materialTotal: number
  /** Category / subcategory multiplier applied to material total */
  typeModifier: number
  typeKey: string
  total: number
  lines: DfpLineItem[]
}

export interface BlueprintDfpInput {
  categoryName?: string
  subCategoryName?: string
  slots?: {
    requiredCount?: number
    options?: {
      type?: string
      resourceName?: string
      entityName?: string
      minQuality?: number
      standardCargoUnits?: number
      quantity?: number
    }[]
  }[]
}

export function clampQuality(quality: number): number {
  const tiers = DFP_QUALITY_TIERS
  if (quality <= tiers[0]) return tiers[0]
  if (quality >= tiers[tiers.length - 1]) return tiers[tiers.length - 1]

  let result = tiers[0]
  for (const tier of tiers) {
    if (quality >= tier) result = tier
    else break
  }
  return result
}

export function resolveQuality(minQuality?: number): number {
  if (minQuality == null || minQuality <= 0) return DFP_ASSUMED_QUALITY
  return clampQuality(minQuality)
}

export function resolveDfpResourceKey(name: string): string {
  return DFP_RESOURCE_ALIASES[name] ?? name
}

export function getRarityModifier(resourceName: string): number {
  const key = resolveDfpResourceKey(resourceName)
  return DFP_RARITY_MODIFIERS[key] ?? DFP_DEFAULT_MODIFIER
}

export function baseValueForScu(quality: number, scu: number): number {
  const tier = clampQuality(quality)
  const per001 = DFP_BASE_PER_001_cSCU[tier] ?? DFP_BASE_PER_001_cSCU[DFP_ASSUMED_QUALITY]
  const effectiveScu = Math.max(scu, MIN_SCU)
  return per001 * (effectiveScu / MIN_SCU) * DFP_SCALE_FACTOR
}

const SIZE_FROM_CATEGORY = /S(\d+)/i

export function extractComponentSize(categoryName?: string): DfpSizeKey | null {
  if (!categoryName) return null
  const match = categoryName.match(SIZE_FROM_CATEGORY)
  if (!match) return null
  return `S${match[1]}` as DfpSizeKey
}

export function resolveDfpProductType(blueprint: BlueprintDfpInput): DfpProductType {
  const category = blueprint.categoryName ?? ''

  if (category === 'FPSArmours') return 'armor'
  if (category === 'FPSWeapons') return 'fps_weapon'
  if (category === 'Ammo') return 'ammo'
  if (category === 'MissionItem') return 'mission_item'
  if (category.startsWith('Veh. Comp.')) return 'ship_component'
  if (category.startsWith('Veh. Weapons')) return 'vehicle_weapon'
  return 'other'
}

export function isAmmoBlueprint(blueprint: BlueprintDfpInput): boolean {
  return resolveDfpProductType(blueprint) === 'ammo'
}

/** Blueprint order lines (ammo uses min quality 0). */
export function formatBlueprintOrderQualityLabel(minQuality: number): string {
  if (minQuality === AMMO_ORDER_MIN_QUALITY) return 'Any (ammo)'
  return `Q${minQuality}`
}

/** Resource buy-order lines. */
export function formatResourceOrderQualityLabel(
  resourceKey: string,
  label: string,
  minQuality: number
): string {
  if (isSalvageResource(resourceKey)) return 'Q0 (salvage)'
  return `Q${minQuality}`
}

/** @deprecated Use formatBlueprintOrderQualityLabel or formatResourceOrderQualityLabel */
export function formatOrderQualityLabel(minQuality: number): string {
  return formatBlueprintOrderQualityLabel(minQuality)
}

function resolveSubcategoryModifier(
  entry: DfpSubcategoryModifier | undefined,
  size: DfpSizeKey | null,
): number | null {
  if (entry == null) return null
  if (typeof entry === 'number') return entry

  if (size && entry[size] != null) return entry[size]!
  if (entry.default != null) return entry.default
  return null
}

export function resolveDfpTypeKey(blueprint: BlueprintDfpInput): string {
  const productType = resolveDfpProductType(blueprint)
  if (productType !== 'ship_component') return productType

  const sub = blueprint.subCategoryName ?? 'default'
  const size = extractComponentSize(blueprint.categoryName)
  return size ? `ship_component:${sub}:${size}` : `ship_component:${sub}`
}

export function getDfpTypeModifier(blueprint: BlueprintDfpInput): number {
  const productType = resolveDfpProductType(blueprint)

  if (productType !== 'ship_component') {
    return (DFP_TYPE_MODIFIERS[productType] ?? DFP_TYPE_MODIFIERS.other) * DFP_CRAFT_PREMIUM
  }

  const sub = blueprint.subCategoryName ?? 'default'
  const size = extractComponentSize(blueprint.categoryName)
  const entry = DFP_SHIP_SUBCATEGORY_MODIFIERS[sub] ?? DFP_SHIP_SUBCATEGORY_MODIFIERS.default
  const fallback = resolveSubcategoryModifier(DFP_SHIP_SUBCATEGORY_MODIFIERS.default, size) ?? 0.85
  const modifier = resolveSubcategoryModifier(entry, size) ?? fallback

  return modifier * DFP_CRAFT_PREMIUM
}

/** Order-level min quality applied to all material slots, then × craft quantity. */
/** Raw/refined material price only — no blueprint craft type modifier or premium. */
export function calculateMaterialDfpPrice(
  resourceName: string,
  minQuality: number,
  scuQuantity: number
): number {
  const quality = resolveQuality(minQuality)
  const scu = Math.max(scuQuantity, MIN_SCU)
  const base = baseValueForScu(quality, scu)
  const modifier = getRarityModifier(resourceName)
  return Math.round(base * modifier)
}

export function calculateMaterialDfpLine(
  resourceName: string,
  minQuality: number,
  scuQuantity: number
): DfpLineItem {
  const quality = resolveQuality(minQuality)
  const scu = Math.max(scuQuantity, MIN_SCU)
  const base = baseValueForScu(quality, scu)
  const modifier = getRarityModifier(resourceName)
  return {
    resource: resourceName,
    quality,
    scu,
    baseValue: base,
    modifier,
    lineTotal: Math.round(base * modifier),
  }
}

export function calculateBlueprintDfpForOrder(
  blueprint: BlueprintDfpInput,
  orderMinQuality: number,
  craftQuantity = 1
): DfpResult {
  const quality = resolveQuality(orderMinQuality)
  const qty = Math.max(1, craftQuantity)
  const adjusted: BlueprintDfpInput = {
    categoryName: blueprint.categoryName,
    subCategoryName: blueprint.subCategoryName,
    slots: (blueprint.slots ?? []).map((slot) => ({
      requiredCount: slot.requiredCount,
      options: (slot.options ?? []).map((option) => ({
        ...option,
        minQuality: quality,
      })),
    })),
  }
  const unitResult = calculateBlueprintDfp(adjusted)
  const total = Math.round(unitResult.total * qty)
  return { ...unitResult, total }
}

export function calculateBlueprintDfp(blueprint: BlueprintDfpInput): DfpResult {
  const lines: DfpLineItem[] = []

  for (const slot of blueprint.slots ?? []) {
    const slotCount = slot.requiredCount ?? 1

    for (const option of slot.options ?? []) {
      const resource = option.resourceName || option.entityName
      if (!resource) continue

      const quality = resolveQuality(option.minQuality)
      const units = option.standardCargoUnits ?? MIN_SCU
      const optQty = option.quantity ?? 1
      const scu = units * slotCount * optQty
      const base = baseValueForScu(quality, scu)
      const modifier = getRarityModifier(resource)
      const lineTotal = base * modifier

      lines.push({
        resource,
        quality,
        scu,
        baseValue: base,
        modifier,
        lineTotal,
      })
    }
  }

  const materialTotal = lines.reduce((sum, line) => sum + line.lineTotal, 0)
  const typeModifier = getDfpTypeModifier(blueprint)
  const typeKey = resolveDfpTypeKey(blueprint)
  const total = Math.round(materialTotal * typeModifier)

  return { materialTotal, typeModifier, typeKey, total, lines }
}

export function formatDfpValue(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'

  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`
  }
  if (abs >= 100) {
    return Math.round(value).toLocaleString()
  }
  return value.toFixed(1)
}

export function formatDfpLabel(value: number): string {
  const formatted = formatDfpValue(value)
  if (formatted === '—') return 'DFP —'
  return `DFP ${formatted}`
}

/** Full aUEC amount for order pricing (required DFP price). */
export function formatDfpAuec(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return `${Math.round(value).toLocaleString()} aUEC`
}

export function formatDfpRequiredPrice(value: number): string {
  const auec = formatDfpAuec(value)
  if (auec === '—') return 'DFP —'
  return `${auec} (DFP required)`
}
