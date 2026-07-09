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

/** e.g. 12.43% BERYLLIUM (ORE) Q42 or 12.43% BERYLLIUM (ORE) 905 */
const COMPOSITION_LINE_RE =
  /(\d+(?:\.\d+)?)\s*%?\s+([A-Za-z][A-Za-z0-9\s]*?)(?:\s*\(ORE\))?\s+Q?(\d+)\s*$/i

const INERT_LINE_RE = /(\d+(?:\.\d+)?)\s*%?\s+INERT\s+MATERIALS/i

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

function extractTotalScu(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    const inline = line.match(/COMPOSITION\s*:?\s*(\d+(?:\.\d+)?)\s*SCU/i)
    if (inline) return Number.parseFloat(inline[1])

    if (/COMPOSITION/i.test(line)) {
      const valueOnLabelLine = line.match(/COMPOSITION\s*:?\s*(\d+(?:\.\d+)?)/i)
      if (valueOnLabelLine) return Number.parseFloat(valueOnLabelLine[1])

      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const candidate = lines[j]
        const scuMatch = candidate.match(/(\d+(?:\.\d+)?)\s*SCU/i)
        if (scuMatch) return Number.parseFloat(scuMatch[1])
      }
    }
  }

  for (const line of lines) {
    const loose = line.match(/(\d+(?:\.\d+)?)\s*SCU/i)
    if (loose) return Number.parseFloat(loose[1])
  }

  return null
}

function parseCompositionLine(
  line: string,
  elementRank: Map<string, number>
): { kind: 'inert'; percent: number } | { kind: 'ore'; line: OcrCompositionLine } | null {
  const inertMatch = line.match(INERT_LINE_RE)
  if (inertMatch) {
    return { kind: 'inert', percent: Number.parseFloat(inertMatch[1]) }
  }

  const strict = line.match(COMPOSITION_LINE_RE)
  if (strict) {
    const percent = Number.parseFloat(strict[1])
    const elementName = normalizeElementName(strict[2])
    const quality = Number.parseInt(strict[3], 10)
    if (!Number.isFinite(percent) || !elementName || !Number.isFinite(quality)) return null
    if (isInertElement(elementName)) return { kind: 'inert', percent }

    const rank = elementRank.get(elementName) ?? 0
    elementRank.set(elementName, rank + 1)
    return {
      kind: 'ore',
      line: { elementName, percent, quality, scanBandRank: rank },
    }
  }

  const loose = line.match(/(\d+(?:\.\d+)?)\s*%?\s+(.+?)\s+Q?(\d+)/i)
  if (!loose) return null

  const percent = Number.parseFloat(loose[1])
  const elementName = normalizeElementName(loose[2])
  const quality = Number.parseInt(loose[3], 10)
  if (!Number.isFinite(percent) || !elementName || !Number.isFinite(quality)) return null
  if (isInertElement(elementName)) return { kind: 'inert', percent }

  const rank = elementRank.get(elementName) ?? 0
  elementRank.set(elementName, rank + 1)
  return {
    kind: 'ore',
    line: { elementName, percent, quality, scanBandRank: rank },
  }
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
    if (!line || !/%/.test(line)) continue

    const parsed = parseCompositionLine(line, elementRank)
    if (!parsed) continue

    if (parsed.kind === 'inert') {
      inertPercent = parsed.percent
      continue
    }

    compositionLines.push(parsed.line)
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

    const rockHeader = trimmed.match(/^([A-Za-z][A-Za-z0-9]*)\s+ROCK/i)
    if (rockHeader) return normalizeElementName(rockHeader[1])
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
  const totalScu = extractTotalScu(lines)

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

  const warnings: string[] = []
  if (primaryFromLines && primaryFromHeader && primaryFromLines !== primaryFromHeader) {
    warnings.push(
      `Rock label shows ${primaryFromHeader} but composition High/Low bands are ${primaryFromLines} — using composition for calculator basis.`
    )
  }

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
