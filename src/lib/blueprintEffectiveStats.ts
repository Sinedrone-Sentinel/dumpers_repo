import { mergeSlotQualities } from './blueprintQuality'
import type { BlueprintWithSlots } from './blueprintResources'
import {
  aggregateModifiers,
  calculateSlotModifiers,
  formatPercentChange,
  formatStatValue,
  roundPercentChange,
  type AggregatedModifier,
  type RawModifier,
} from './qualityModifiers'

export interface StoredEffectiveStat {
  propertyLabel: string
  percentChange: number
  additiveChange?: number
  isIntegerAdditive?: boolean
  baseValue?: number
  finalValue?: number
}

export interface BlueprintLineSnapshot {
  slotSummary: string
  stats: StoredEffectiveStat[]
}

export interface BlueprintForEffectiveStats extends BlueprintWithSlots {
  vehicleBaseStats?: Record<string, number | null>
  armorBaseStats?: Record<string, number | null>
  weaponBaseStats?: Record<string, number | null>
  slots?: Array<{
    slotDisplayName?: string
    options?: Array<{ modifiers?: RawModifier[] }>
  }>
}

export function mergeBlueprintBaseStats(
  blueprint: BlueprintForEffectiveStats
): Record<string, number> {
  const stats: Record<string, number> = {}
  const allStats = {
    ...blueprint.vehicleBaseStats,
    ...blueprint.armorBaseStats,
    ...blueprint.weaponBaseStats,
  }
  for (const [key, value] of Object.entries(allStats)) {
    if (value !== null && value !== undefined) {
      stats[key] = value
    }
  }
  return stats
}

export function blueprintHasQualityModifiers(blueprint: BlueprintForEffectiveStats): boolean {
  return (
    blueprint.slots?.some((slot) =>
      slot.options?.some((opt) => opt.modifiers && opt.modifiers.length > 0)
    ) ?? false
  )
}

/** Slot qualities from order line, or uniform minQuality when per-slot data is absent. */
export function resolveEffectiveSlotQualities(
  blueprint: BlueprintForEffectiveStats,
  slotQualities?: Record<number, number> | null,
  minQuality?: number
): Record<number, number> {
  if (slotQualities && Object.keys(slotQualities).length > 0) {
    return mergeSlotQualities(blueprint, slotQualities)
  }

  if (minQuality != null && blueprint.slots?.length) {
    const uniform: Record<number, number> = {}
    for (let i = 0; i < blueprint.slots.length; i++) {
      uniform[i] = minQuality
    }
    return uniform
  }

  return mergeSlotQualities(blueprint, slotQualities)
}

export function computeBlueprintEffectiveModifiers(
  blueprint: BlueprintForEffectiveStats,
  slotQualities?: Record<number, number> | null,
  minQuality?: number
) {
  if (!blueprintHasQualityModifiers(blueprint) || !blueprint.slots?.length) {
    return []
  }

  const effectiveQualities = resolveEffectiveSlotQualities(
    blueprint,
    slotQualities,
    minQuality
  )
  const mergedBaseStats = mergeBlueprintBaseStats(blueprint)

  const allSlotModifiers = blueprint.slots.map((slot, idx) => {
    const quality = effectiveQualities[idx] ?? 500
    const modifiers = slot.options?.[0]?.modifiers
    return calculateSlotModifiers(quality, modifiers)
  })

  return aggregateModifiers(allSlotModifiers, mergedBaseStats)
}

export function serializeEffectiveStats(modifiers: AggregatedModifier[]): StoredEffectiveStat[] {
  return modifiers.map((mod) => ({
    propertyLabel: mod.propertyLabel,
    percentChange: roundPercentChange(mod.percentChange),
    ...(mod.isIntegerAdditive ? { additiveChange: mod.additiveChange, isIntegerAdditive: true } : {}),
    ...(mod.baseValue !== undefined && mod.finalValue !== undefined
      ? { baseValue: mod.baseValue, finalValue: mod.finalValue }
      : {}),
  }))
}

function formatStoredStatChange(stat: StoredEffectiveStat): string {
  if (stat.isIntegerAdditive) {
    const val = stat.additiveChange ?? 0
    return val >= 0 ? `+${val}` : `${val}`
  }
  return formatPercentChange(stat.percentChange)
}

export function formatStoredStatLine(stat: StoredEffectiveStat): string {
  const change = formatStoredStatChange(stat)
  if (stat.baseValue !== undefined && stat.finalValue !== undefined) {
    return `${stat.propertyLabel}: ${formatStatValue(stat.baseValue, stat.propertyLabel)} → ${formatStatValue(stat.finalValue, stat.propertyLabel)} (${change})`
  }
  return `${stat.propertyLabel}: ${change}`
}

/** Discord/markdown-friendly single stat (no property label prefix when used in list). */
export function formatStoredStatCompact(stat: StoredEffectiveStat): string {
  const change = formatStoredStatChange(stat)
  if (stat.baseValue !== undefined && stat.finalValue !== undefined) {
    return `${stat.propertyLabel}: ${formatStatValue(stat.baseValue, stat.propertyLabel)}→${formatStatValue(stat.finalValue, stat.propertyLabel)} (${change})`
  }
  return `${stat.propertyLabel}: ${change}`
}

export function buildBlueprintLineSnapshot(
  blueprint: BlueprintForEffectiveStats,
  slotQualities?: Record<number, number> | null,
  minQuality?: number
): BlueprintLineSnapshot {
  const effectiveQualities = resolveEffectiveSlotQualities(
    blueprint,
    slotQualities,
    minQuality
  )
  const slotSummary = Object.entries(effectiveQualities)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([idx, quality]) => {
      const slotIndex = Number(idx)
      const slot = blueprint.slots?.[slotIndex]
      const slotName = slot?.slotDisplayName || `Slot ${slotIndex + 1}`
      const resourceName =
        slot?.options?.[0]?.resourceName ||
        slot?.options?.[0]?.entityName ||
        slot?.options?.[0]?.displayName ||
        slot?.options?.[0]?.itemName ||
        ''
      return resourceName
        ? `${slotName} (${resourceName}) Q${quality}`
        : `${slotName} Q${quality}`
    })
    .join(' · ')

  const modifiers = computeBlueprintEffectiveModifiers(blueprint, slotQualities, minQuality)
  return {
    slotSummary,
    stats: serializeEffectiveStats(modifiers),
  }
}

export function statsFromLineSnapshot(
  snapshot?: BlueprintLineSnapshot | null
): StoredEffectiveStat[] {
  return snapshot?.stats ?? []
}
