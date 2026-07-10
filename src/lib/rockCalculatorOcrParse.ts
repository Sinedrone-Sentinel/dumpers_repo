import { resolveOcrOreName } from './miningOreCanonical'
import { stripMineableLabel } from './miningOreLabel'
import { isInertElement, oreResourceKeyFromElementName } from './rockCalculator'
import { getDefaultBandQuality, resolveLedgerQuality } from './qualityBands'

export interface OcrCompositionLine {
  elementName: string
  percent: number
  quality: number | null
  qualityMissing: boolean
  scanBandRank: number
  rawOcrLine: string
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
  | { ok: false; error: string; hints?: string[] }

/** e.g. 12.43% BERYLLIUM (ORE) Q42 — trailing SCU counts (3+ digits) are handled separately */
const COMPOSITION_LINE_WITH_Q_RE =
  /(\d+(?:\.\d+)?)\s*%?\s+([A-Za-z][A-Za-z0-9\s]*?)(?:\s*\((?:ORE|RAW)\))?\s+Q?(\d{1,2})\s*$/i

const INERT_LINE_RE = /(\d+(?:\.\d+)?)\s*%?\s+INERT\s+MATERIALS/i

const COMPOSITION_PERCENT_LINE_RE =
  /(\d+(?:\.\d+)?)\s*%?\s+(.+?)(?:\s+\d{3,})?\s*$/i

const PRIMARY_ORE_ERROR =
  'Could not read the primary ore — include the ore name (e.g. BORASE) above MASS or both composition bands in the crop.'

/**
 * In-game SCAN RESULTS panel order (top → bottom):
 *   primary ore → MASS → RES → INST → COMP (SCU)
 * Mineral composition % rows follow COMP; their OCR line order does not matter.
 *
 * OCR text line order is not trusted. Each stat above COMP is resolved by scanning
 * all lines for its label. Composition rows are collected as an unordered set.
 */

interface ScanPanelStats {
  mass: number | null
  resistancePercent: number | null
  instability: number | null
  totalScu: number | null
}

const HUD_LABEL_WORDS = new Set([
  'MASS',
  'RES',
  'RESISTANCE',
  'INST',
  'INSTABILITY',
  'COMPOSITION',
  'COMP',
  'DISTANCE',
  'LOCK',
  'TARG',
  'AUTO',
  'CARGO',
  'SCAN',
  'RESULTS',
  'RESULT',
])

function normalizeOcrLetters(line: string): string {
  return line.toUpperCase().replace(/[^A-Z]/g, '')
}

function ocrHeaderLetters(line: string): string {
  return line
    .toUpperCase()
    .replace(/5/g, 'S')
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/8/g, 'B')
    .replace(/[^A-Z]/g, '')
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 0; i < a.length; i++) {
    let prevDiag = prev[0]
    prev[0] = i + 1
    for (let j = 0; j < b.length; j++) {
      const temp = prev[j + 1]
      const cost = a[i] === b[j] ? 0 : 1
      prev[j + 1] = Math.min(prev[j + 1] + 1, prev[j] + 1, prevDiag + cost)
      prevDiag = temp
    }
  }
  return prev[b.length]
}

function lineLooksLikeResultsHeader(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (/\bRESULTS?\b/i.test(trimmed)) return true

  const letters = normalizeOcrLetters(trimmed)
  if (!letters) return false
  if (letters.includes('RESULTS') || letters.startsWith('RESULT')) return true
  if (/^RESU.*LTS/.test(letters) || /^RE.*SULTS/.test(letters)) return true

  const headerLetters = ocrHeaderLetters(trimmed)
  if (headerLetters.length >= 5 && headerLetters.length <= 14) {
    if (levenshteinDistance(headerLetters, 'RESULTS') <= 2) return true
    if (levenshteinDistance(headerLetters, 'RESULT') <= 1) return true
  }

  return false
}

function hasTrailingQuality(line: string): boolean {
  return /\s+Q?\d{1,4}\s*$/i.test(line.trim())
}

function readOrphanQualityLine(line: string | undefined): number | null {
  if (!line) return null
  const match = line.trim().match(/^Q?(\d{1,4})$/i)
  if (!match) return null
  const quality = Number.parseInt(match[1], 10)
  return Number.isFinite(quality) ? quality : null
}

function defaultLedgerQualityForElement(elementName: string): number {
  return resolveLedgerQuality(
    oreResourceKeyFromElementName(elementName),
    elementName,
    getDefaultBandQuality(elementName)
  )
}

function buildQualityMissingWarning(elementName: string, rawLine: string): string {
  const defaultQ = defaultLedgerQualityForElement(elementName)
  const trimmed = rawLine.trim()
  const longNameLikely =
    elementName.length >= 12 ||
    (trimmed.length >= 28 && !hasTrailingQuality(trimmed))
  if (longNameLikely) {
    return `${elementName} — Q may be hidden on the HUD; left at default Q${defaultQ}. Set manually if needed.`
  }
  return `${elementName} — Q not read from scan; left at default Q${defaultQ}. Set manually if needed.`
}

function normalizeElementName(raw: string): string {
  const stripped = stripMineableLabel(raw.replace(/\((?:ORE|RAW)\)/gi, '').trim())
  if (!stripped) return stripped
  if (/^inert/i.test(stripped)) return 'Inert'

  const resolved = resolveOcrOreName(stripped)
  return resolved.name
}

function cleanOcrText(text: string): string {
  return text.replace(/\r/g, '\n').replace(/[|]/g, ' ')
}

function parseNumberToken(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, '').replace(/,/g, '.')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const value = Number.parseFloat(cleaned)
  return Number.isFinite(value) ? value : null
}

function readNumericFromLabelLine(line: string): number | null {
  const matches = [...line.matchAll(/-?\d+(?:[.,]\d+)?/g)]
  if (!matches.length) return null
  const last = matches[matches.length - 1]?.[0]
  return last ? parseNumberToken(last) : null
}

function lineLooksLikeMassLabel(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (/\bMASS\b/i.test(trimmed)) return true

  const letters = ocrHeaderLetters(trimmed)
  if (!letters) return false
  if (letters.startsWith('MASS')) return true
  if (letters.length >= 3 && letters.length <= 8 && levenshteinDistance(letters, 'MASS') <= 1) {
    return true
  }
  return false
}

function isCompScuHeaderLine(line: string): boolean {
  return /\bCOMP(?:OSITION)?\b/i.test(line) && /\bSCU\b/i.test(line)
}

/** Mineral composition rows — not HUD stat labels or the COMP SCU header. */
function isCompositionPercentLine(line: string): boolean {
  if (lineLooksLikeMassLabel(line) || lineLooksLikeResLabel(line) || lineLooksLikeInstLabel(line)) {
    return false
  }
  if (isCompScuHeaderLine(line)) return false
  return /(\d+(?:\.\d+)?)\s*%/.test(line)
}

function normalizeResistancePercent(value: number): number {
  if (value > 0 && value <= 1) return Math.round(value * 100)
  return Math.round(value)
}

function lineLooksLikeResLabel(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (lineLooksLikeResultsHeader(trimmed)) return false
  if (/\bRES(?:ISTANCE)?\b/i.test(trimmed)) return true
  if (/^RE\s*[:/\\-]?\s*[-/\\]?\s*\d/i.test(trimmed)) return true

  const letters = ocrHeaderLetters(trimmed)
  if (!letters) return false
  if (letters.startsWith('RESULT')) return false
  if (letters.startsWith('RES')) return true
  if (letters.length >= 2 && letters.length <= 12) {
    if (levenshteinDistance(letters.slice(0, 3), 'RES') <= 1) return true
    if (levenshteinDistance(letters, 'RESISTANCE') <= 3) return true
  }
  return false
}

function isResistanceCandidateValue(
  value: number,
  mass: number | null,
  instability: number | null,
  totalScu: number | null
): boolean {
  if (!Number.isFinite(value) || value < 0) return false
  if (mass != null && Math.abs(value - mass) < 0.01) return false
  if (instability != null && Math.abs(value - instability) < 0.01) return false
  if (totalScu != null && value > 200 && Math.abs(value - totalScu) < 1) return false
  if (value > 0 && value <= 1) return true
  return value <= 100
}

/** RES is often garbled or clipped to the bottom of the crop — infer from position or orphan values. */
function extractResistanceFallback(
  lines: string[],
  known: { mass: number | null; instability: number | null; totalScu: number | null }
): number | null {
  let massIdx = -1
  let instIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (massIdx < 0 && lineLooksLikeMassLabel(lines[i])) massIdx = i
    if (lineLooksLikeInstLabel(lines[i])) instIdx = i
  }

  if (massIdx >= 0 && instIdx > massIdx) {
    for (let i = massIdx + 1; i < instIdx; i++) {
      if (isCompositionPercentLine(lines[i]) || lineHasStatLabel(lines[i])) continue
      const value = readNumericFromLabelLine(lines[i])
      if (value != null && isResistanceCandidateValue(value, known.mass, known.instability, known.totalScu)) {
        return value
      }
    }
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line || isCompositionPercentLine(line)) continue
    if (lineLooksLikeMassLabel(line) || lineLooksLikeInstLabel(line)) continue
    if (isCompScuHeaderLine(line)) continue
    if (lineLooksLikeResultsHeader(line)) continue

    if (lineLooksLikeResLabel(line)) {
      const value = readHudStatValue(line, lines, i)
      if (value != null && isResistanceCandidateValue(value, known.mass, known.instability, known.totalScu)) {
        return value
      }
    }

    if (!/%/.test(line) && /^[^A-Za-z]*\d/.test(line)) {
      const value = readNumericFromLabelLine(line)
      if (value != null && isResistanceCandidateValue(value, known.mass, known.instability, known.totalScu)) {
        return value
      }
    }
  }

  return null
}

function lineLooksLikeInstLabel(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (/\bINST(?:ABILITY)?\b/i.test(trimmed)) return true

  const letters = ocrHeaderLetters(trimmed)
  if (!letters) return false
  if (letters.startsWith('INST') || letters.includes('INSTABIL')) return true
  if (/^1N5T|^IN5T|^1NST|^LNST/.test(letters)) return true
  if (letters.length >= 4 && letters.length <= 14 && levenshteinDistance(letters, 'INSTABILITY') <= 3) {
    return true
  }
  if (letters.length >= 3 && letters.length <= 6 && levenshteinDistance(letters, 'INST') <= 1) {
    return true
  }
  return false
}

function readHudStatValue(line: string, lines: string[], index: number): number | null {
  const inline = readNumericFromLabelLine(line)
  if (inline != null) return inline

  for (let j = index + 1; j < Math.min(index + 3, lines.length); j++) {
    const next = parseNumberToken(lines[j])
    if (next != null) return next
  }

  return null
}

function extractLabeledStat(
  lines: string[],
  matcher: (line: string) => boolean
): number | null {
  for (let i = 0; i < lines.length; i++) {
    if (!matcher(lines[i])) continue
    const value = readHudStatValue(lines[i], lines, i)
    if (value != null) return value
  }
  return null
}

function lineHasStatLabel(line: string): boolean {
  return (
    lineLooksLikeMassLabel(line) ||
    lineLooksLikeResLabel(line) ||
    lineLooksLikeInstLabel(line) ||
    isCompScuHeaderLine(line) ||
    /(?:COMP(?:OSITION)?)/i.test(line)
  )
}

/** Largest non-composition number in the panel — fallback when MASS label is garbled. */
function extractMassFallback(lines: string[]): number | null {
  let best: number | null = null

  for (const line of lines) {
    if (isCompositionPercentLine(line) || lineHasStatLabel(line)) continue
    const value = readNumericFromLabelLine(line)
    if (value == null || value < 50 || value > 1_000_000) continue
    if (best == null || value > best) best = value
  }

  return best
}

function extractCompScu(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!isCompScuHeaderLine(line) && !/(?:COMP(?:OSITION)?)/i.test(line)) continue

    const inline = line.match(/(?:COMP(?:OSITION)?)\s*:?\s*(\d+(?:\.\d+)?)\s*SCU/i)
    if (inline) return Number.parseFloat(inline[1])

    const value = readHudStatValue(line, lines, i)
    if (value != null) return value
  }

  for (const line of lines) {
    const loose = line.match(/(\d+(?:\.\d+)?)\s*SCU/i)
    if (loose) return Number.parseFloat(loose[1])
  }

  return null
}

/** Resolve MASS → RES → INST → COMP by label across all OCR lines (order-independent). */
function extractOrderedScanPanelStats(lines: string[]): ScanPanelStats {
  const mass =
    extractLabeledStat(lines, lineLooksLikeMassLabel) ??
    extractLabeledValue(lines, ['MASS']) ??
    extractMassFallback(lines)
  const instability =
    extractLabeledStat(lines, lineLooksLikeInstLabel) ??
    extractLabeledValue(lines, ['INSTABILITY']) ??
    extractLabeledValue(lines, ['INST'], { wordBoundary: true })
  const totalScu = extractCompScu(lines)
  const resistancePercent =
    extractLabeledStat(lines, lineLooksLikeResLabel) ??
    extractLabeledValue(lines, ['RESISTANCE']) ??
    extractLabeledValue(lines, ['RES'], { wordBoundary: true }) ??
    extractResistanceFallback(lines, { mass, instability, totalScu })

  return {
    mass,
    resistancePercent,
    instability,
    totalScu,
  }
}

function extractLabeledValue(
  lines: string[],
  labels: string[],
  options?: { wordBoundary?: boolean }
): number | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    const upper = line.toUpperCase()
    for (const label of labels) {
      const matched = options?.wordBoundary
        ? new RegExp(`\\b${label}\\b`, 'i').test(upper)
        : upper.includes(label)
      if (!matched) continue
      const labelIndex = upper.search(new RegExp(label, 'i'))
      const inline = line.slice(labelIndex + label.length)
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
  return extractCompScu(lines)
}

function pushOreLine(
  elementName: string,
  percent: number,
  quality: number | null,
  qualityMissing: boolean,
  rawOcrLine: string,
  elementRank: Map<string, number>,
  compositionLines: OcrCompositionLine[],
  warnings: string[]
): void {
  if (isInertElement(elementName)) return

  if (qualityMissing) {
    warnings.push(buildQualityMissingWarning(elementName, rawOcrLine))
  }

  const rank = elementRank.get(elementName) ?? 0
  elementRank.set(elementName, rank + 1)
  compositionLines.push({
    elementName,
    percent,
    quality,
    qualityMissing,
    scanBandRank: rank,
    rawOcrLine,
  })
}

function parseCompositionLine(
  line: string,
  elementRank: Map<string, number>,
  compositionLines: OcrCompositionLine[],
  warnings: string[],
  allLines: string[],
  lineIndex: number,
  consumedLineIndices: Set<number>
): { kind: 'inert'; percent: number } | null {
  const inertMatch = line.match(INERT_LINE_RE)
  if (inertMatch) {
    return { kind: 'inert', percent: Number.parseFloat(inertMatch[1]) }
  }

  const strict = line.match(COMPOSITION_LINE_WITH_Q_RE)
  if (strict) {
    const percent = Number.parseFloat(strict[1])
    const elementName = normalizeElementName(strict[2])
    const quality = Number.parseInt(strict[3], 10)
    if (!Number.isFinite(percent) || !elementName || !Number.isFinite(quality)) return null
    if (isInertElement(elementName)) return { kind: 'inert', percent }

    pushOreLine(elementName, percent, quality, false, line, elementRank, compositionLines, warnings)
    return null
  }

  const percentOnly = line.match(COMPOSITION_PERCENT_LINE_RE)
  if (percentOnly && /%/.test(line)) {
    const percent = Number.parseFloat(percentOnly[1])
    const elementName = normalizeElementName(percentOnly[2])
    if (!Number.isFinite(percent) || !elementName) return null
    if (isInertElement(elementName)) return { kind: 'inert', percent }

    const nextIndex = lineIndex + 1
    const orphanQuality = readOrphanQualityLine(allLines[nextIndex])
    if (orphanQuality != null) {
      consumedLineIndices.add(nextIndex)
      pushOreLine(
        elementName,
        percent,
        orphanQuality,
        false,
        `${line.trim()} / ${allLines[nextIndex].trim()}`,
        elementRank,
        compositionLines,
        warnings
      )
      return null
    }

    pushOreLine(elementName, percent, null, true, line, elementRank, compositionLines, warnings)
    return null
  }

  if (!hasTrailingQuality(line)) {
    return null
  }

  const loose = line.match(/(\d+(?:\.\d+)?)\s*%?\s+(.+?)\s+Q?(\d+)/i)
  if (!loose) return null

  const percent = Number.parseFloat(loose[1])
  const elementName = normalizeElementName(loose[2])
  const quality = Number.parseInt(loose[3], 10)
  if (!Number.isFinite(percent) || !elementName || !Number.isFinite(quality)) return null
  if (isInertElement(elementName)) return { kind: 'inert', percent }

  pushOreLine(elementName, percent, quality, false, line, elementRank, compositionLines, warnings)
  return null
}

function parseCompositionLines(
  lines: string[],
  warnings: string[]
): {
  lines: OcrCompositionLine[]
  inertPercent: number | null
} {
  const compositionLines: OcrCompositionLine[] = []
  let inertPercent: number | null = null
  const elementRank = new Map<string, number>()
  const consumedLineIndices = new Set<number>()

  for (let i = 0; i < lines.length; i++) {
    if (consumedLineIndices.has(i)) continue
    const line = lines[i].trim()
    if (!line || !isCompositionPercentLine(line)) continue

    const parsed = parseCompositionLine(
      line,
      elementRank,
      compositionLines,
      warnings,
      lines,
      i,
      consumedLineIndices
    )
    if (parsed?.kind === 'inert') {
      inertPercent = parsed.percent
    }
  }

  return { lines: compositionLines, inertPercent }
}

/** Smaller composition % = High band (rank 0); larger % = Low band (rank 1). */
function assignBandRanksByPercent(compositionLines: OcrCompositionLine[]): void {
  const indicesByElement = new Map<string, number[]>()
  compositionLines.forEach((line, index) => {
    const indices = indicesByElement.get(line.elementName) ?? []
    indices.push(index)
    indicesByElement.set(line.elementName, indices)
  })

  for (const indices of indicesByElement.values()) {
    if (indices.length < 2) continue
    const sorted = [...indices].sort(
      (a, b) => compositionLines[a].percent - compositionLines[b].percent
    )
    sorted.forEach((lineIndex, rank) => {
      compositionLines[lineIndex].scanBandRank = rank
    })
  }
}

function parseOreNameFromResultsLine(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const oreTagged = trimmed.match(/^([A-Za-z][A-Za-z0-9\s]*?)\s*\(ORE\)/i)
  if (oreTagged) return normalizeElementName(oreTagged[1])

  const rockTagged = trimmed.match(/^([A-Za-z][A-Za-z0-9]*)\s+ROCK/i)
  if (rockTagged) return normalizeElementName(rockTagged[1])

  const plain = trimmed.match(/^([A-Za-z][A-Za-z0-9]{2,})/)
  if (plain) {
    const token = plain[1].toUpperCase()
    if (HUD_LABEL_WORDS.has(token)) return null
    return normalizeElementName(plain[1])
  }

  return null
}

function parsePrimaryOreAboveMass(lines: string[]): string | null {
  let massIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (lineLooksLikeMassLabel(lines[i])) {
      massIndex = i
      break
    }
  }
  if (massIndex < 0) return null

  for (let i = 0; i < massIndex; i++) {
    if (lineLooksLikeResultsHeader(lines[i])) continue
    const oreName = parseOreNameFromResultsLine(lines[i])
    if (oreName) return oreName
  }

  return null
}

function parseStandaloneOreLine(lines: string[]): string | null {
  for (const line of lines) {
    if (!line.trim()) continue
    if (lineLooksLikeResultsHeader(line)) continue
    if (lineHasStatLabel(line) || isCompositionPercentLine(line)) continue
    const oreName = parseOreNameFromResultsLine(line)
    if (oreName) return oreName
  }
  return null
}

function inferPrimaryOreFromComposition(compositionLines: OcrCompositionLine[]): string | null {
  const bandCounts = new Map<string, number>()
  for (const line of compositionLines) {
    bandCounts.set(line.elementName, (bandCounts.get(line.elementName) ?? 0) + 1)
  }

  let best: string | null = null
  let bestCount = 0
  for (const [name, count] of bandCounts) {
    if (count >= 2 && count > bestCount) {
      best = name
      bestCount = count
    }
  }
  return best
}

function resolvePrimaryOreName(
  lines: string[],
  compositionLines: OcrCompositionLine[]
): string | null {
  return (
    parseResultsHeaderOre(lines) ??
    parsePrimaryOreAboveMass(lines) ??
    parseStandaloneOreLine(lines) ??
    inferPrimaryOreFromComposition(compositionLines)
  )
}

function parseResultsHeaderOre(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i++) {
    if (!lineLooksLikeResultsHeader(lines[i])) continue

    const inlineOre = lines[i].replace(/^.*\bRESULTS?\b\s*/i, '').trim()
    const inlineName = parseOreNameFromResultsLine(inlineOre)
    if (inlineName) return inlineName

    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
      const oreName = parseOreNameFromResultsLine(lines[j])
      if (oreName) return oreName
    }
    return null
  }
  return null
}

function countPrimaryOreBands(
  compositionLines: OcrCompositionLine[],
  primaryOreName: string
): number {
  return compositionLines.filter((line) => line.elementName === primaryOreName).length
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

  const warnings: string[] = []

  const panel = extractOrderedScanPanelStats(lines)
  const mass = panel.mass
  const resistancePercent = panel.resistancePercent
  const instability = panel.instability
  const totalScu = panel.totalScu

  const { lines: compositionLines, inertPercent } = parseCompositionLines(lines, warnings)
  assignBandRanksByPercent(compositionLines)

  const resolvedPrimary = resolvePrimaryOreName(lines, compositionLines)
  if (!resolvedPrimary) {
    return { ok: false, error: PRIMARY_ORE_ERROR }
  }
  const primaryOreName = resolveOcrOreName(resolvedPrimary).name

  if (mass == null) {
    return { ok: false, error: 'Could not read Mass from the crop — include the MASS line.' }
  }
  if (resistancePercent == null) {
    return { ok: false, error: 'Could not read Resistance from the crop — include the RES line.' }
  }
  if (instability == null) {
    return { ok: false, error: 'Could not read Instability from the crop — include the INST or INSTABILITY line.' }
  }
  if (totalScu == null || totalScu <= 0) {
    return { ok: false, error: 'Could not read total SCU from COMPOSITION — include that header line.' }
  }
  if (compositionLines.length < 2) {
    return { ok: false, error: 'Need at least two composition lines in the crop — include the full COMPOSITION list.' }
  }

  const primaryBandCount = countPrimaryOreBands(compositionLines, primaryOreName)
  if (primaryBandCount < 2) {
    return {
      ok: false,
      error: `Found ${primaryOreName} but could not read both High and Low composition bands — include the full COMPOSITION list.`,
    }
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
      resistancePercent: normalizeResistancePercent(resistancePercent),
      instability,
      totalScu,
      compositionLines,
      inertPercentScanned: inertPercent,
      warnings,
    },
  }
}

/** Higher = more of the scan was understood. Used to decide whether to upscale OCR retries. */
export function scoreRockScanOcrParseAttempt(result: RockScanOcrParseResult): number {
  if (result.ok) return 1000

  const error = result.error
  if (error.includes('no readable text')) return 0
  if (error.includes('primary ore')) return 20
  if (error.includes('Mass')) return 30
  if (error.includes('Resistance')) return 40
  if (error.includes('Instability')) return 50
  if (error.includes('SCU')) return 60
  if (error.includes('composition lines')) return 70
  if (error.includes('High and Low')) return 80
  return 5
}
