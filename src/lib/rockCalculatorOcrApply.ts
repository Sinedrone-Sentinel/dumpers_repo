import type { CompositionPart, DepositType } from './miningClusterProfiles'
import { getDepositTypes } from './miningClusterProfiles'
import { normalizeMiningOreName, resolveOcrOreName } from './miningOreCanonical'
import { resolveLedgerQuality, getDefaultBandQuality, getLedgerQualityOptions, getResourceBands, PURCHASED_STOCK_QUALITY } from './qualityBands'
import {
  buildDefaultQualitySlots,
  compositionSlotKey,
  INERT_ELEMENT_NAME,
  INERT_SLOT_KEY,
  isInertElement,
  oreResourceKeyFromElementName,
} from './rockCalculator'
import type { OcrCompositionLine, RockScanOcrResult } from './rockCalculatorOcrParse'

export interface OcrBasisResolution {
  oreName: string
  depositType: DepositType
}

/** High/Low band ordering in the calculator matches profile qualityScale sort (higher = High). */
function qualityScaleForScanBandRank(rank: number): number {
  return Math.max(0.01, 1 - rank * 0.51)
}

function buildInertPart(): CompositionPart {
  return {
    elementName: INERT_ELEMENT_NAME,
    minPercentage: 0,
    maxPercentage: 0,
    qualityScale: 0,
  }
}

/** Scan-driven slots: open 0–100% ranges (no spawn-location clamp). Inert is auto-derived in the UI. */
export function buildOcrCalculatorParts(scan: RockScanOcrResult): CompositionPart[] {
  const valuable = scan.compositionLines.filter((line) => !isInertElement(line.elementName))
  const parts = valuable.map((line) => ({
    elementName: resolveOcrOreName(line.elementName).name,
    minPercentage: 0,
    maxPercentage: 100,
    qualityScale: qualityScaleForScanBandRank(line.scanBandRank),
  }))
  return [...parts, buildInertPart()]
}

/** Exact HUD Q → ledger band; otherwise nearest game band; missing Q → Band 2. */
function resolveScanLineQuality(line: OcrCompositionLine, elementName: string): number {
  const canonical = resolveOcrOreName(elementName).name
  const resourceKey = oreResourceKeyFromElementName(canonical)
  const band2 = getDefaultBandQuality(canonical)

  if (line.qualityMissing || line.quality == null) {
    return band2
  }

  const options = getLedgerQualityOptions(resourceKey, canonical)
  if (options.includes(line.quality)) {
    return line.quality
  }

  if (getResourceBands(canonical)) {
    return resolveLedgerQuality(resourceKey, canonical, line.quality)
  }

  return band2
}

function formatScanPercent(line: OcrCompositionLine): string {
  if (/\d+\.\d{2}\s*%/.test(line.rawOcrLine)) {
    return line.percent.toFixed(2)
  }
  if (Math.abs(line.percent - Math.round(line.percent)) > 0.001) {
    return String(line.percent)
  }
  return String(line.percent)
}

export function buildOcrCalculatorApply(scan: RockScanOcrResult): {
  calculatorParts: CompositionPart[]
  percentBySlot: Record<string, string>
  qualityBySlot: Record<string, string>
} {
  const calculatorParts = buildOcrCalculatorParts(scan)
  const valuable = scan.compositionLines.filter((line) => !isInertElement(line.elementName))
  const percentBySlot: Record<string, string> = {}
  const qualityBySlot = buildDefaultQualitySlots(calculatorParts)

  valuable.forEach((line, index) => {
    const part = calculatorParts[index]
    const key = compositionSlotKey(index, part)
    percentBySlot[key] = formatScanPercent(line)
    qualityBySlot[key] = String(resolveScanLineQuality(line, part.elementName))
  })

  qualityBySlot[INERT_SLOT_KEY] = String(PURCHASED_STOCK_QUALITY)

  return { calculatorParts, percentBySlot, qualityBySlot }
}

export function resolveOcrBasis(scan: RockScanOcrResult): OcrBasisResolution | null {
  const oreName = normalizeMiningOreName(scan.primaryOreName)
  const depositTypes = getDepositTypes(oreName)
  if (!depositTypes.length) return null

  const depositType: DepositType = depositTypes.includes('asteroid') ? 'asteroid' : depositTypes[0]

  return { oreName, depositType }
}
