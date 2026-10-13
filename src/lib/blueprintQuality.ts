import { AMMO_CRAFT_MATERIAL_QUALITY } from '../config/dfp'
import { DEFAULT_QUALITY, getDefaultBandQuality, getResourceBands } from './qualityBands'
import type { BlueprintSlot, BlueprintWithSlots } from './blueprintResources'

interface SlotWithMinQuality {
  options?: { minQuality?: number; resourceName?: string; entityName?: string; displayName?: string; itemName?: string }[]
}

/** Game minimum material quality for a slot; 0 when the recipe has no floor (data uses 0 / 1). */
export function slotMinQuality(slot: SlotWithMinQuality | undefined): number {
  const min = slot?.options?.[0]?.minQuality ?? 0
  return min > 1 ? min : 0
}

/** Band values a slot may use — bands below the recipe floor are dropped. */
export function allowedBandsForSlot(slot: SlotWithMinQuality | undefined): number[] | undefined {
  const bands = getResourceBands(resolveSlotResourceName(slot as BlueprintSlot | undefined))
  if (!bands) return undefined
  const min = slotMinQuality(slot)
  if (!min) return bands
  const allowed = bands.filter((q) => q >= min)
  return allowed.length > 0 ? allowed : bands.slice(-1)
}

/** Raise a quality to the slot floor (the lowest allowed band when the resource is banded). */
export function clampSlotQuality(slot: SlotWithMinQuality | undefined, quality: number): number {
  const min = slotMinQuality(slot)
  if (!min || quality >= min) return quality
  const allowed = allowedBandsForSlot(slot)
  return allowed?.[0] ?? min
}

/** Slot indexes whose saved quality is under the recipe floor. */
export function slotQualitiesBelowMin(
  blueprint: BlueprintWithSlots | null | undefined,
  slotQualities: Record<number, number> | null | undefined,
): number[] {
  if (!blueprint?.slots || !slotQualities) return []
  const below: number[] = []
  blueprint.slots.forEach((slot, idx) => {
    const min = slotMinQuality(slot)
    const q = slotQualities[idx]
    if (min && typeof q === 'number' && q < min) below.push(idx)
  })
  return below
}

export function resolveSlotResourceName(slot: BlueprintSlot | undefined): string {
  const option = slot?.options?.[0]
  return (
    option?.resourceName ||
    option?.entityName ||
    option?.displayName ||
    option?.itemName ||
    ''
  )
}

/** Band 2 default per resource (matches PersonalStockAddPanel). */
export function defaultQualityForSlotResource(resourceName: string): number {
  return getDefaultBandQuality(resourceName)
}

export function buildDefaultSlotQualities(blueprint: BlueprintWithSlots): Record<number, number> {
  const qualities: Record<number, number> = {}
  const slots = blueprint.slots ?? []
  const isAmmo = blueprint.categoryName === 'Ammo'
  for (let i = 0; i < slots.length; i++) {
    const base = isAmmo
      ? AMMO_CRAFT_MATERIAL_QUALITY
      : defaultQualityForSlotResource(resolveSlotResourceName(slots[i]))
    qualities[i] = clampSlotQuality(slots[i], base)
  }
  return qualities
}

export function mergeSlotQualities(
  blueprint: BlueprintWithSlots,
  overrides?: Record<number, number> | null,
): Record<number, number> {
  const defaults = buildDefaultSlotQualities(blueprint)
  if (!overrides) return defaults
  const merged = { ...defaults, ...overrides }
  const slots = blueprint.slots ?? []
  for (const key of Object.keys(merged)) {
    const idx = Number(key)
    merged[idx] = clampSlotQuality(slots[idx], merged[idx])
  }
  return merged
}

export function minSlotQuality(slotQualities: Record<number, number>): number {
  const values = Object.values(slotQualities)
  return values.length > 0 ? Math.min(...values) : DEFAULT_QUALITY
}

export function slotQualitiesToParts(
  slotQualities: Record<number, number>,
): { slotIndex: number; quality: number }[] {
  return Object.entries(slotQualities).map(([idx, quality]) => ({
    slotIndex: Number(idx),
    quality,
  }))
}

export function isUniformSlotQuality(slotQualities: Record<number, number>): boolean {
  const values = Object.values(slotQualities)
  if (values.length <= 1) return true
  return values.every((v) => v === values[0])
}

export function formatSlotQualitySummary(slotQualities: Record<number, number>): string {
  if (isUniformSlotQuality(slotQualities)) {
    return `Q${minSlotQuality(slotQualities)}`
  }
  const values = Object.values(slotQualities)
  return `Q${Math.min(...values)}–Q${Math.max(...values)} mix`
}
