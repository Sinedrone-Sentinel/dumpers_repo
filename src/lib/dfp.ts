import { isSalvageResource } from '../config/extraResources'
import { AMMO_ORDER_MIN_QUALITY } from '../config/dfp'
import { getDfpEngine } from './dfpEngine'

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
  materialTotal: number
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

export function isAmmoBlueprint(blueprint: BlueprintDfpInput): boolean {
  return getDfpEngine().isAmmoBlueprint(blueprint)
}

export function formatBlueprintOrderQualityLabel(minQuality: number): string {
  if (minQuality === AMMO_ORDER_MIN_QUALITY) return 'Any (ammo)'
  return `Q${minQuality}`
}

export function formatResourceOrderQualityLabel(
  resourceKey: string,
  _label: string,
  minQuality: number
): string {
  if (isSalvageResource(resourceKey)) return 'Q0 (salvage)'
  return `Q${minQuality}`
}

/** @deprecated Use formatBlueprintOrderQualityLabel or formatResourceOrderQualityLabel */
export function formatOrderQualityLabel(minQuality: number): string {
  return formatBlueprintOrderQualityLabel(minQuality)
}

export function resolveDfpTypeKey(blueprint: BlueprintDfpInput): string {
  const eng = getDfpEngine()
  if (eng.isAmmoBlueprint(blueprint)) return 'ammo'
  const cat = blueprint.categoryName ?? ''
  if (cat === 'FPSArmours') return 'armor'
  if (cat === 'FPSWeapons') return 'fps_weapon'
  if (cat === 'MissionItem') return 'mission_item'
  if (cat.startsWith('Veh. Comp.')) {
    const sub = blueprint.subCategoryName ?? 'default'
    const match = cat.match(/S(\d+)/i)
    return match ? `ship_component:${sub}:S${match[1]}` : `ship_component:${sub}`
  }
  if (cat.startsWith('Veh. Weapons')) return 'vehicle_weapon'
  return 'other'
}

export function calculateMaterialDfpPrice(
  resourceName: string,
  minQuality: number,
  scuQuantity: number
): number {
  return getDfpEngine().calculateMaterialDfpPrice(resourceName, minQuality, scuQuantity)
}

export function calculateMaterialDfpLine(
  resourceName: string,
  minQuality: number,
  scuQuantity: number
): DfpLineItem {
  const lineTotal = calculateMaterialDfpPrice(resourceName, minQuality, scuQuantity)
  const scu = Math.max(scuQuantity, MIN_SCU)
  return {
    resource: resourceName,
    quality: minQuality,
    scu,
    baseValue: 0,
    modifier: 0,
    lineTotal,
  }
}

export function calculateBlueprintDfpForOrder(
  blueprint: BlueprintDfpInput,
  orderMinQuality: number,
  craftQuantity = 1
): DfpResult {
  const raw = getDfpEngine().calculateBlueprintDfpForOrder(blueprint, orderMinQuality, craftQuantity)
  return {
    ...raw,
    typeKey: resolveDfpTypeKey(blueprint),
    lines: raw.lines as DfpLineItem[],
  }
}

export function calculateBlueprintDfp(blueprint: BlueprintDfpInput): DfpResult {
  const raw = getDfpEngine().calculateBlueprintDfp(blueprint)
  return {
    ...raw,
    typeKey: resolveDfpTypeKey(blueprint),
    lines: raw.lines as DfpLineItem[],
  }
}

export function formatDfpValue(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'

  const abs = Math.abs(value)
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`
  if (abs >= 100) return Math.round(value).toLocaleString()
  return value.toFixed(1)
}

export function formatDfpLabel(value: number): string {
  const formatted = formatDfpValue(value)
  if (formatted === '—') return 'DFP —'
  return `DFP ${formatted}`
}

export function formatDfpAuec(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return `${Math.round(value).toLocaleString()} aUEC`
}

export function formatDfpRequiredPrice(value: number): string {
  const auec = formatDfpAuec(value)
  if (auec === '—') return 'DFP —'
  return `${auec} (DFP required)`
}
