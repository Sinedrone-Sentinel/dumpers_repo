import { isSalvageResource } from '../config/extraResources'
import { isHarvestResource, isWikeloItemResource } from '../config/resourceTypes'
import { AMMO_ORDER_MIN_QUALITY } from '../config/dfp'
import { slotQualitiesToParts } from './blueprintQuality'
import { getResourceBands } from './qualityBands'
import { ensureDfpEngine, getDfpEngine, isDfpEngineReady, type DfpEngineApi } from './dfpEngine'

const MIN_SCU = 0.001

const EMPTY_DFP_RESULT: DfpResult = {
  materialTotal: 0,
  acquisitionPremium: 0,
  craftLaborPremium: 0,
  typeModifier: 0,
  typeKey: 'other',
  total: 0,
  lines: [],
}

function tryGetEngine(): DfpEngineApi | null {
  if (isDfpEngineReady()) return getDfpEngine()
  void ensureDfpEngine().catch((err) => {
    console.error('DFP engine load failed:', err)
  })
  return null
}

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
  acquisitionPremium: number
  craftLaborPremium: number
  typeModifier: number
  typeKey: string
  total: number
  lines: DfpLineItem[]
}

export interface BlueprintDfpInput {
  file?: string
  internalName?: string
  categoryName?: string
  subCategoryName?: string
  subtype?: string
  slots?: {
    requiredCount?: number
    options?: {
      type?: string
      resourceName?: string
      entityName?: string
      displayName?: string
      minQuality?: number
      standardCargoUnits?: number
      quantity?: number
    }[]
  }[]
}

export function isAmmoBlueprint(blueprint: BlueprintDfpInput): boolean {
  const eng = tryGetEngine()
  return eng?.isAmmoBlueprint(blueprint) ?? false
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
  if (isHarvestResource(resourceKey)) return 'Harvest'
  if (isWikeloItemResource(resourceKey)) return 'Wikelo item'
  return `Q${minQuality}`
}

/** @deprecated Use formatBlueprintOrderQualityLabel or formatResourceOrderQualityLabel */
export function formatOrderQualityLabel(minQuality: number): string {
  return formatBlueprintOrderQualityLabel(minQuality)
}

export function resolveDfpTypeKey(blueprint: BlueprintDfpInput): string {
  const eng = tryGetEngine()
  if (eng?.isAmmoBlueprint(blueprint)) return 'ammo'
  const cat = blueprint.categoryName ?? ''
  if (cat === 'FPSArmours') return 'armor'
  if (cat === 'FPSWeapons') return 'fps_weapon'
  if (cat === 'MissionItem') return 'mission_item'
  if (cat.startsWith('Veh. Comp.')) {
    const sub = blueprint.subCategoryName ?? blueprint.subtype ?? 'default'
    const match = cat.match(/S(\d+)/i)
    return match ? `ship_component:${sub}:S${match[1]}` : `ship_component:${sub}`
  }
  if (cat.startsWith('Veh. Weapons')) return 'vehicle_weapon'
  return 'other'
}

export function calculateMaterialDfpPrice(
  resourceName: string,
  minQuality: number,
  scuQuantity: number,
  bandThresholds?: number[],
): number {
  const eng = tryGetEngine()
  if (!eng) return 0
  return eng.calculateMaterialDfpPrice(
    resourceName,
    minQuality,
    scuQuantity,
    bandThresholds,
  )
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

export function calculateBlueprintDfpWithParts(
  blueprint: BlueprintDfpInput,
  slotQualities?: Record<number, number> | null,
  craftQuantity = 1,
): DfpResult {
  const eng = tryGetEngine()
  if (!eng) return { ...EMPTY_DFP_RESULT, typeKey: resolveDfpTypeKey(blueprint) }
  const parts = slotQualities ? slotQualitiesToParts(slotQualities) : undefined
  const raw = eng.calculateBlueprintDfp(blueprint, {
    parts,
    craftQuantity,
    bandThresholdsForResource: (name) => getResourceBands(name),
  })
  return {
    materialTotal: raw.materialTotal,
    acquisitionPremium: raw.acquisitionPremium ?? 0,
    craftLaborPremium: raw.craftLaborPremium ?? 0,
    typeModifier: raw.typeModifier,
    typeKey: resolveDfpTypeKey(blueprint),
    total: raw.total,
    lines: raw.lines as DfpLineItem[],
  }
}

export function calculateBlueprintDfpForOrder(
  blueprint: BlueprintDfpInput,
  orderMinQuality: number,
  craftQuantity = 1
): DfpResult {
  const slotCount = blueprint.slots?.length ?? 0
  const slotQualities: Record<number, number> = {}
  for (let i = 0; i < slotCount; i++) {
    slotQualities[i] = orderMinQuality
  }
  return calculateBlueprintDfpWithParts(blueprint, slotQualities, craftQuantity)
}

export function calculateBlueprintDfp(blueprint: BlueprintDfpInput): DfpResult {
  const eng = tryGetEngine()
  if (!eng) return { ...EMPTY_DFP_RESULT, typeKey: resolveDfpTypeKey(blueprint) }
  const raw = eng.calculateBlueprintDfp(blueprint)
  return {
    materialTotal: raw.materialTotal,
    acquisitionPremium: raw.acquisitionPremium ?? 0,
    craftLaborPremium: raw.craftLaborPremium ?? 0,
    typeModifier: raw.typeModifier,
    typeKey: resolveDfpTypeKey(blueprint),
    total: raw.total,
    lines: raw.lines as DfpLineItem[],
  }
}

export interface WikeloTradeDfpInput {
  category?: string
  isVehicleReward?: boolean
  costs?: {
    entityClass?: string
    resourceName?: string
    name?: string
    amount?: number
    scu?: number
  }[]
}

export interface WikeloDfpResult {
  /** null = game-bound vehicle reward (shown as N/A) */
  total: number | null
  lines: { name: string; amount: number; lineTotal: number }[]
  unpricedItems: string[]
  isVehicleReward: boolean
}

export function calculateWikeloTradeDfp(trade: WikeloTradeDfpInput): WikeloDfpResult {
  const isVehicleReward = trade.isVehicleReward === true || trade.category === 'vehicle'
  const eng = tryGetEngine()
  if (!eng?.calculateWikeloTradeDfp) {
    return { total: isVehicleReward ? null : 0, lines: [], unpricedItems: [], isVehicleReward }
  }
  return eng.calculateWikeloTradeDfp(trade)
}

export function formatWikeloDfpLabel(result: WikeloDfpResult): string {
  if (result.isVehicleReward || result.total === null) return 'DFP N/A'
  return formatDfpLabel(result.total)
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

export function formatCraftDfpBreakdown(result: DfpResult): string {
  const parts = [`Materials ${formatDfpValue(result.materialTotal)}`]
  if (result.acquisitionPremium > 0) {
    parts.push(`Acquire ${formatDfpValue(result.acquisitionPremium)}`)
  }
  if (result.craftLaborPremium > 0) {
    parts.push(`Labor ${formatDfpValue(result.craftLaborPremium)}`)
  }
  parts.push(`= ${formatDfpValue(result.total)}`)
  return parts.join(' + ')
}

export function formatDfpAuec(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—'
  return `${Math.round(value).toLocaleString()} aUEC`
}
