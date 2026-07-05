import type { CompositionPart } from './miningClusterProfiles'
import { pricingForResourceLine } from './orderPricing'
import {
  DEFAULT_QUALITY,
  getDefaultBandQuality,
  getResourceBands,
  PURCHASED_STOCK_QUALITY,
  resolveLedgerQuality,
} from './qualityBands'

export const INERT_ELEMENT_NAME = 'Inert'
export const INERT_SLOT_KEY = 'slot-inert'

export function isInertElement(elementName: string): boolean {
  return elementName.trim().toLowerCase() === INERT_ELEMENT_NAME.toLowerCase()
}

/** Append synthetic Inert row when absent; range is remainder after valuable materials. */
export function withInertCompositionPart(parts: CompositionPart[]): CompositionPart[] {
  if (parts.some((part) => isInertElement(part.elementName))) return parts
  return [...parts, computeInertCompositionRange(parts)]
}

export function computeInertCompositionRange(parts: CompositionPart[]): CompositionPart {
  const valuable = parts.filter((part) => !isInertElement(part.elementName))
  const sumMin = valuable.reduce((sum, part) => sum + part.minPercentage, 0)
  const sumMax = valuable.reduce((sum, part) => sum + part.maxPercentage, 0)
  return {
    elementName: INERT_ELEMENT_NAME,
    minPercentage: Math.max(0, Math.round((100 - sumMax) * 10) / 10),
    maxPercentage: Math.max(0, Math.round((100 - sumMin) * 10) / 10),
    qualityScale: 0,
  }
}

export function compositionSlotKey(index: number, part?: CompositionPart): string {
  if (part && isInertElement(part.elementName)) return INERT_SLOT_KEY
  return `slot-${index}`
}

export const PERCENT_OVER_LIMIT = 100.001

export function calculateMaterialScu(totalScu: number, percent: number): number {
  if (!Number.isFinite(totalScu) || totalScu <= 0) return 0
  if (!Number.isFinite(percent) || percent <= 0) return 0
  return Math.round(totalScu * percent * 10) / 1000
}

export function sumPercentages(values: number[]): number {
  return values.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0)
}

export function isPercentOverLimit(total: number): boolean {
  return total > PERCENT_OVER_LIMIT
}

export function formatMaterialScu(scu: number): string {
  return scu.toFixed(3)
}

export function parsePercentInput(raw: string): number {
  const trimmed = raw.trim()
  if (!trimmed) return 0
  const value = Number.parseFloat(trimmed)
  return Number.isFinite(value) ? value : 0
}

export function parseTotalScuInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const value = Number.parseFloat(trimmed)
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}

const SCANNER_BAND_SUFFIXES = ['High', 'Low'] as const

/** In-game scanner label: duplicate element slots become High / Low by qualityScale. */
export function formatScannerBandLabel(
  part: CompositionPart,
  index: number,
  allParts: CompositionPart[]
): string {
  if (isInertElement(part.elementName)) return INERT_ELEMENT_NAME

  const sameElement = allParts
    .map((p, i) => ({ part: p, index: i }))
    .filter(({ part: p }) => p.elementName === part.elementName)

  if (sameElement.length <= 1) return part.elementName

  const sorted = [...sameElement].sort((a, b) => b.part.qualityScale - a.part.qualityScale)
  const rank = sorted.findIndex(({ index: i }) => i === index)
  if (rank < 0) return part.elementName

  const suffix =
    rank < SCANNER_BAND_SUFFIXES.length
      ? SCANNER_BAND_SUFFIXES[rank]
      : `Band ${rank + 1}`
  return `${part.elementName} · ${suffix}`
}

export function formatScannerBandTooltip(
  part: CompositionPart,
  index: number,
  allParts: CompositionPart[]
): string | undefined {
  const duplicateCount = allParts.filter((p) => p.elementName === part.elementName).length
  if (duplicateCount <= 1) return undefined
  return `Q×${part.qualityScale}`
}

/** @deprecated Use formatScannerBandLabel with slot index. */
export function formatCompositionRowLabel(
  part: CompositionPart,
  allParts: CompositionPart[]
): string {
  const index = allParts.indexOf(part)
  return formatScannerBandLabel(part, index >= 0 ? index : 0, allParts)
}

export function formatCompositionRangeHint(part: CompositionPart): string {
  if (isInertElement(part.elementName) && part.minPercentage === 0 && part.maxPercentage === 0) {
    return '0%'
  }
  return `${part.minPercentage}–${part.maxPercentage}%`
}

export function computeDerivedInertPercent(valuablePercentTotal: number): number {
  if (!Number.isFinite(valuablePercentTotal)) return 0
  return Math.max(0, Math.round((100 - valuablePercentTotal) * 10) / 10)
}

export function buildDefaultPercentSlots(parts: CompositionPart[]): Record<string, string> {
  const initial: Record<string, string> = {}
  parts.forEach((part, index) => {
    if (isInertElement(part.elementName)) return
    initial[compositionSlotKey(index, part)] = '0'
  })
  return initial
}

/** Band 2 (or Q500 fallback) per composition slot when ore/location profile loads. Inert stays Q0. */
export function buildDefaultQualitySlots(parts: CompositionPart[]): Record<string, string> {
  const initial: Record<string, string> = {}
  parts.forEach((part, index) => {
    const key = compositionSlotKey(index, part)
    initial[key] = isInertElement(part.elementName)
      ? String(PURCHASED_STOCK_QUALITY)
      : String(
          resolveLedgerQuality(
            oreResourceKeyFromElementName(part.elementName),
            part.elementName,
            getDefaultBandQuality(part.elementName)
          )
        )
  })
  return initial
}

export function parseQualitySlotValue(raw: string, fallback = DEFAULT_QUALITY): number {
  const value = Number.parseInt(raw, 10)
  return Number.isFinite(value) ? value : fallback
}

export function formatRockQualityOptionLabel(quality: number): string {
  if (quality === PURCHASED_STOCK_QUALITY) return 'Q0'
  return `Q${quality}`
}

export function formatRockQualitySelectTitle(quality: number): string {
  if (quality === PURCHASED_STOCK_QUALITY) return 'Purchased (Q0)'
  return `Q${quality}`
}

export function oreResourceKeyFromElementName(elementName: string): string {
  if (isInertElement(elementName)) return 'inert_materials'
  return elementName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

/** Purchased Q0 Dumper's Fair-Value Price for the given cSCU amount (calculator display only). */
export function calculateMaterialDfpValue(elementName: string, scu: number): number {
  if (!Number.isFinite(scu) || scu <= 0) return 0
  const { lineDfpAuec } = pricingForResourceLine(
    oreResourceKeyFromElementName(elementName),
    elementName,
    PURCHASED_STOCK_QUALITY,
    scu
  )
  if (!Number.isFinite(lineDfpAuec) || lineDfpAuec <= 0) return 0
  return Math.round(lineDfpAuec)
}

export function formatRockDfpValue(auec: number): string {
  return auec.toLocaleString()
}
