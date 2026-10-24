import { resolveSlotResourceName, slotMinQuality, slotQualitiesBelowMin } from '../lib/blueprintQuality'
import type { BlueprintWithSlots } from '../lib/blueprintResources'
import SiteTooltip from './SiteTooltip'

interface BelowMinQualityTagProps {
  blueprint: BlueprintWithSlots | null | undefined
  slotQualities: Record<number, number> | Record<string, number> | null | undefined
  /** Lines saved without per-slot data use one quality for every slot. */
  uniformQuality?: number | null
  className?: string
}

/** Flags a saved recipe whose picked quality is under a slot's game minimum (cannot be crafted as saved). */
export default function BelowMinQualityTag({
  blueprint,
  slotQualities,
  uniformQuality,
  className = '',
}: BelowMinQualityTagProps) {
  let qualities = slotQualities as Record<number, number> | null | undefined
  if ((!qualities || Object.keys(qualities).length === 0) && uniformQuality != null && blueprint?.slots) {
    qualities = Object.fromEntries(blueprint.slots.map((_, idx) => [idx, uniformQuality]))
  }
  const below = slotQualitiesBelowMin(blueprint, qualities)
  if (below.length === 0 || !blueprint?.slots) return null

  const detail = below
    .map((idx) => {
      const slot = blueprint.slots?.[idx] as (typeof blueprint.slots)[number] & { slotDisplayName?: string }
      const name = slot?.slotDisplayName || resolveSlotResourceName(slot) || `Slot ${idx + 1}`
      return `${name} needs Q${slotMinQuality(slot)}+`
    })
    .join(' · ')

  return (
    <SiteTooltip content={detail}><span className={`site-badge-amber text-[10px] ${className}`}>
      Below minimum quality
    </span></SiteTooltip>
  )
}
