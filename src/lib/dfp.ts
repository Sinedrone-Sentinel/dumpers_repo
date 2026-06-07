import {
  DFP_ASSUMED_QUALITY,
  DFP_BASE_PER_001_cSCU,
  DFP_DEFAULT_MODIFIER,
  DFP_QUALITY_TIERS,
  DFP_RARITY_MODIFIERS,
  DFP_RESOURCE_ALIASES,
  DFP_SCALE_FACTOR,
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
  total: number
  lines: DfpLineItem[]
}

export interface BlueprintDfpInput {
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

  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0)
  return { total, lines }
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
