import { resolveCanonicalOreName } from './miningOreCanonical'
import { stripMineableLabel } from './miningOreLabel'
import { isInertElement } from './rockCalculator'

export interface OcrCompositionLine {
  elementName: string
  percent: number
  quality: number
  scanBandRank: number
}

export interface RockScanOcrResult {
  primaryOreName: string
  mass: number
  resistancePercent: number
  instability: number
  totalScu: number
  compositionLines: OcrCompositionLine[]
  inertPercentScanned: number | null
  warnings: string[]
}

export type RockScanOcrParseResult =
  | { ok: true; data: RockScanOcrResult }
  | { ok: false; error: string }

const COMPOSITION_LINE_RE =
  /(\d+(?:\.\d+)?)\s*%?\s+([A-Za-z][A-Za-z0-9\s]*?)(?:\s*\(ORE\))?\s+(\d+)\s*$/i

function normalizeElementName(raw: string): string {
  const stripped = stripMineableLabel(raw.replace(/\(ORE\)/gi, '').trim())
  if (!stripped) return stripped
  if (/^inert/i.test(stripped)) return 'Inert'
  return resolveCanonicalOreName(stripped)
}

function cleanOcrText(text: string): string {
  return text.replace(/\r/g, '\n').replace(/[|]/g, ' ')
}

function parseNumberToken(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.]/g, '')
  if (!cleaned) return null
  const value = Number.parseFloat(cleaned)
  return Number.isFinite(value) ? value : null
}

function extractLabeledValue(lines: string[], labels: string[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const upper = line.toUpperCase()
    for (const label of labels) {
      if (!upper.includes(label)) continue
      const inline = line.slice(upper.indexOf(label) + label.length)
      const inlineValue = parseNumberToken(inline)
      if (inlineValue != null) return inlineValue
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const nextValue = parseNumberToken(lines[j])
        if (nextValue != null) return nextValue
      }
    }
  }
  return null
}

function parseCompositionLines(lines: string[]): {
  lines: OcrCompositionLine[]
  inertPercent: number | null
} {
  const compositionLines: OcrCompositionLine[] = []
  let inertPercent: number | null = null
  const elementRank = new Map<string, number>()

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const match = line.match(COMPOSITION_LINE_RE)
    if (!match) {
      const loose = line.match(/(\d+(?:\.\d+)?)\s*%?\s+(.+?)\s+(\d+)/i)
      if (!loose) continue
      const percent = Number.parseFloat(loose[1])
      const elementName = normalizeElementName(loose[2])
      const quality = Number.parseInt(loose[3], 10)
      if (!Number.isFinite(percent) || !elementName || !Number.isFinite(quality)) continue

      if (isInertElement(elementName)) {
        inertPercent = percent
        continue
      }

      const rank = elementRank.get(elementName) ?? 0
      elementRank.set(elementName, rank + 1)
      compositionLines.push({ elementName, percent, quality, scanBandRank: rank })
      continue
    }

    const percent = Number.parseFloat(match[1])
    const elementName = normalizeElementName(match[2])
    const quality = Number.parseInt(match[3], 10)
    if (!Number.isFinite(percent) || !elementName || !Number.isFinite(quality)) continue

    if (isInertElement(elementName)) {
      inertPercent = percent
      continue
    }

    const rank = elementRank.get(elementName) ?? 0
    elementRank.set(elementName, rank + 1)
    compositionLines.push({ elementName, percent, quality, scanBandRank: rank })
  }

  return { lines: compositionLines, inertPercent }
}

function detectPrimaryOre(compositionLines: OcrCompositionLine[]): string | null {
  if (compositionLines.length < 2) return null
  const first = compositionLines[0].elementName
  const second = compositionLines[1].elementName
  if (first && first === second) return first
  return null
}

function detectHeaderOre(lines: string[]): string | null {
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || /^(SCAN|MASS|RESISTANCE|INSTABILITY|COMPOSITION)/i.test(trimmed)) continue
    const oreHeader = trimmed.match(/^([A-Za-z][A-Za-z0-9]*)\s*\(ORE\)/i)
    if (oreHeader) return normalizeElementName(oreHeader[1])
  }
  return null
}

export function parseRockScanOcrText(rawText: string): RockScanOcrParseResult {
  const text = cleanOcrText(rawText)
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    return { ok: false, error: 'OCR returned no readable text — try a tighter crop around SCAN RESULTS.' }
  }

  const mass = extractLabeledValue(lines, ['MASS'])
  const resistancePercent = extractLabeledValue(lines, ['RESISTANCE'])
  const instability = extractLabeledValue(lines, ['INSTABILITY'])

  let totalScu: number | null = null
  for (const line of lines) {
    const scuMatch = line.match(/COMPOSITION\s+(\d+(?:\.\d+)?)\s*SCU/i)
    if (scuMatch) {
      totalScu = Number.parseFloat(scuMatch[1])
      break
    }
  }

  const { lines: compositionLines, inertPercent } = parseCompositionLines(lines)

  if (mass == null) {
    return { ok: false, error: 'Could not read Mass from the crop — include the MASS line.' }
  }
  if (resistancePercent == null) {
    return { ok: false, error: 'Could not read Resistance from the crop — include the RESISTANCE line.' }
  }
  if (instability == null) {
    return { ok: false, error: 'Could not read Instability from the crop — include the INSTABILITY line.' }
  }
  if (totalScu == null || totalScu <= 0) {
    return { ok: false, error: 'Could not read total SCU from COMPOSITION — include that header line.' }
  }
  if (compositionLines.length < 2) {
    return { ok: false, error: 'Need at least two composition ore lines (High and Low) in the crop.' }
  }

  const primaryFromLines = detectPrimaryOre(compositionLines)
  const primaryFromHeader = detectHeaderOre(lines)
  const primaryOreName = primaryFromLines ?? primaryFromHeader

  if (!primaryOreName) {
    return {
      ok: false,
      error:
        'First two composition lines must be the same ore (High/Low bands) — check your crop includes the full COMPOSITION list.',
    }
  }

  if (primaryFromLines && primaryFromHeader && primaryFromLines !== primaryFromHeader) {
    return {
      ok: false,
      error: `Composition lines point to ${primaryFromLines} but the header shows ${primaryFromHeader} — crop may be misaligned.`,
    }
  }

  const warnings: string[] = []
  const valuableTotal = compositionLines.reduce((sum, line) => sum + line.percent, 0)
  if (inertPercent != null) {
    const derivedInert = Math.max(0, Math.round((100 - valuableTotal) * 10) / 10)
    if (Math.abs(derivedInert - inertPercent) > 1.5) {
      warnings.push(
        `Scanned inert (${inertPercent}%) differs from auto-derived (${derivedInert}%) — calculator will use auto-derived inert.`
      )
    }
  }

  return {
    ok: true,
    data: {
      primaryOreName,
      mass: Math.round(mass),
      resistancePercent: Math.round(resistancePercent),
      instability,
      totalScu,
      compositionLines,
      inertPercentScanned: inertPercent,
      warnings,
    },
  }
}
