import type { CompositionPart, DepositType } from './miningClusterProfiles'
import {
  getDepositTypes,
  getRockCalculatorLocationOptions,
  getRockCompositionProfile,
} from './miningClusterProfiles'
import { resolveLedgerQuality } from './qualityBands'
import {
  buildDefaultPercentSlots,
  buildDefaultQualitySlots,
  compositionSlotKey,
  isInertElement,
  oreResourceKeyFromElementName,
} from './rockCalculator'
import type { OcrCompositionLine, RockScanOcrResult } from './rockCalculatorOcrParse'

export interface OcrBasisResolution {
  oreName: string
  depositType: DepositType
  locationValue: string
  locationLabel: string
}

function profileSlotsByElement(
  calculatorParts: CompositionPart[],
  elementName: string
): Array<{ index: number; part: CompositionPart }> {
  return calculatorParts
    .map((part, index) => ({ part, index }))
    .filter(({ part }) => part.elementName === elementName && !isInertElement(part.elementName))
    .sort((a, b) => b.part.qualityScale - a.part.qualityScale)
}

function ocrLinesByElement(lines: OcrCompositionLine[]): Map<string, OcrCompositionLine[]> {
  const grouped = new Map<string, OcrCompositionLine[]>()
  for (const line of lines) {
    if (isInertElement(line.elementName)) continue
    const list = grouped.get(line.elementName) ?? []
    list.push(line)
    grouped.set(line.elementName, list)
  }
  for (const list of grouped.values()) {
    list.sort((a, b) => a.scanBandRank - b.scanBandRank)
  }
  return grouped
}

function scoreProfileMatch(
  profileParts: CompositionPart[],
  ocrLines: OcrCompositionLine[]
): number {
  const ocrElements = new Set(ocrLines.map((line) => line.elementName))
  const profileElements = new Set(
    profileParts.filter((part) => !isInertElement(part.elementName)).map((part) => part.elementName)
  )

  let score = 0
  for (const element of ocrElements) {
    if (profileElements.has(element)) score += 3
  }

  const primary = ocrLines[0]?.elementName
  if (primary) {
    const primarySlots = profileParts.filter(
      (part) => part.elementName === primary && !isInertElement(part.elementName)
    )
    if (primarySlots.length >= 2) score += 5
  }

  return score
}

export function resolveOcrBasis(scan: RockScanOcrResult): OcrBasisResolution | null {
  const oreName = scan.primaryOreName
  const depositTypes = getDepositTypes(oreName)
  if (!depositTypes.length) return null

  const valuableLines = scan.compositionLines.filter((line) => !isInertElement(line.elementName))

  let best:
    | {
        depositType: DepositType
        locationValue: string
        locationLabel: string
        score: number
      }
    | null = null

  for (const depositType of depositTypes) {
    const options = getRockCalculatorLocationOptions(oreName, depositType)
    for (const option of options) {
      const profile = getRockCompositionProfile(oreName, depositType, {
        profileMode: 'location',
        locationName: option.value,
      })
      if (!profile?.compositionParts.length) continue
      const score = scoreProfileMatch(profile.compositionParts, valuableLines)
      if (!best || score > best.score) {
        best = {
          depositType,
          locationValue: option.value,
          locationLabel: option.label,
          score,
        }
      }
    }
  }

  if (!best) {
    const fallbackDeposit: DepositType = depositTypes.includes('asteroid') ? 'asteroid' : depositTypes[0]
    const options = getRockCalculatorLocationOptions(oreName, fallbackDeposit)
    if (!options.length) return null
    return {
      oreName,
      depositType: fallbackDeposit,
      locationValue: options[0].value,
      locationLabel: options[0].label,
    }
  }

  return {
    oreName,
    depositType: best.depositType,
    locationValue: best.locationValue,
    locationLabel: best.locationLabel,
  }
}

export function mapOcrToCalculatorSlots(
  scan: RockScanOcrResult,
  calculatorParts: CompositionPart[]
): {
  percentBySlot: Record<string, string>
  qualityBySlot: Record<string, string>
  unmatchedLines: string[]
} {
  const percentBySlot = buildDefaultPercentSlots(calculatorParts)
  const qualityBySlot = buildDefaultQualitySlots(calculatorParts)
  const unmatchedLines: string[] = []
  const grouped = ocrLinesByElement(scan.compositionLines)

  for (const [elementName, lines] of grouped) {
    const slots = profileSlotsByElement(calculatorParts, elementName)
    if (!slots.length) {
      for (const line of lines) {
        const qLabel = line.qualityMissing || line.quality == null ? 'Q?' : `Q${line.quality}`
        unmatchedLines.push(`${line.percent}% ${elementName} ${qLabel}`)
      }
      continue
    }

    lines.forEach((line, rank) => {
      const slot = slots[rank]
      if (!slot) {
        const qLabel = line.qualityMissing || line.quality == null ? 'Q?' : `Q${line.quality}`
        unmatchedLines.push(`${line.percent}% ${elementName} ${qLabel}`)
        return
      }
      const key = compositionSlotKey(slot.index, slot.part)
      percentBySlot[key] = String(line.percent)
      if (!line.qualityMissing && line.quality != null) {
        const resolvedQuality = resolveLedgerQuality(
          oreResourceKeyFromElementName(elementName),
          elementName,
          line.quality
        )
        qualityBySlot[key] = String(resolvedQuality)
      }
    })
  }

  return { percentBySlot, qualityBySlot, unmatchedLines }
}
