import { resolveOcrOreName } from './miningOreCanonical'
import { stripMineableLabel } from './miningOreLabel'
import { isInertElement, oreResourceKeyFromElementName } from './rockCalculator'
import { getDefaultBandQuality, resolveLedgerQuality } from './qualityBands'

// ---------------------------------------------------------------------------
// Public types (unchanged — consumed by RockCalculator + apply layer)
// ---------------------------------------------------------------------------

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

export interface OcrWordBox {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
}

// ---------------------------------------------------------------------------
// SCAN RESULTS panel schema (in-game top → bottom):
//   primary ore → MASS → RES → INST → COMP (SCU) → composition % rows
//
// Parser strategy (order-independent):
//   1. Cluster OCR words into spatial rows (true HUD order when boxes exist)
//   2. Flatten rows into a searchable corpus for label regex extraction
//   3. Collect composition % rows separately (order among % rows irrelevant)
// ---------------------------------------------------------------------------

interface HudRows {
  rows: string[]
  corpus: string
}

interface PanelStats {
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
  'SCU',
])

const COMPOSITION_LINE_WITH_Q_RE =
  /(\d+(?:\.\d+)?)\s*%?\s+([A-Za-z][A-Za-z0-9\s]*?)(?:\s*\((?:ORE|RAW)\))?\s+Q?(\d{1,2})\s*$/i

const INERT_LINE_RE = /(\d+(?:\.\d+)?)\s*%?\s+INERT\s+MATERIALS/i

const COMPOSITION_PERCENT_LINE_RE =
  /(\d+(?:\.\d+)?)\s*%?\s+(.+?)(?:\s+\d{3,})?\s*$/i

// ---------------------------------------------------------------------------
// Text normalization
// ---------------------------------------------------------------------------

function cleanOcrText(text: string): string {
  return text.replace(/\r/g, '\n').replace(/[|]/g, ' ')
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

function parseNumberToken(raw: string): number | null {
  const cleaned = raw.replace(/[^\d.,-]/g, '').replace(/,/g, '.')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const value = Number.parseFloat(cleaned)
  return Number.isFinite(value) ? value : null
}

function buildHudRows(rawText: string, words?: OcrWordBox[]): HudRows {
  const rows = words?.length ? clusterWordsIntoRows(words) : splitTextLines(rawText)
  const corpus = rows.join(' ').replace(/\s+/g, ' ').trim()
  return { rows, corpus }
}

function splitTextLines(rawText: string): string[] {
  return cleanOcrText(rawText)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** Sort OCR words by position, group into horizontal rows, join left-to-right. */
function clusterWordsIntoRows(words: OcrWordBox[]): string[] {
  const sorted = [...words]
    .map((word) => ({
      text: word.text.trim(),
      x0: word.x0,
      y0: word.y0,
      y1: word.y1,
    }))
    .filter((word) => word.text.length > 0)
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)

  if (!sorted.length) return []

  const heights = sorted.map((word) => Math.max(1, word.y1 - word.y0))
  const medianHeight = heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)] ?? 12
  const rowThreshold = Math.max(8, medianHeight * 0.65)

  const rowGroups: Array<Array<{ text: string; x0: number }>> = []
  let currentGroup: Array<{ text: string; x0: number; y0: number }> = []
  let currentY = sorted[0].y0

  for (const word of sorted) {
    if (currentGroup.length && Math.abs(word.y0 - currentY) > rowThreshold) {
      rowGroups.push(currentGroup.sort((a, b) => a.x0 - b.x0))
      currentGroup = []
    }
    currentGroup.push(word)
    currentY = currentGroup.reduce((sum, item) => sum + item.y0, 0) / currentGroup.length
  }
  if (currentGroup.length) {
    rowGroups.push(currentGroup.sort((a, b) => a.x0 - b.x0))
  }

  return rowGroups
    .map((group) => group.map((word) => word.text).join(' ').trim())
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Panel stat extraction — regex on flat corpus (immune to newline splits)
// ---------------------------------------------------------------------------

function firstMatchingNumber(corpus: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = corpus.match(pattern)
    if (!match?.[1]) continue
    const value = parseNumberToken(match[1])
    if (value != null) return value
  }
  return null
}

function extractMass(corpus: string, rows: string[]): number | null {
  const fromCorpus = firstMatchingNumber(corpus, [
    /\bMASS\s*[:.]?\s*(-?\d[\d,]*\.?\d*)/i,
    /\bM[A4@]SS\s*[:.]?\s*(-?\d[\d,]*\.?\d*)/i,
  ])
  if (fromCorpus != null && fromCorpus >= 50) return fromCorpus

  let best: number | null = null
  for (const row of rows) {
    if (isCompositionPercentRow(row) || rowHasHudStatLabel(row)) continue
    const value = lastNumberInRow(row)
    if (value == null || value < 50 || value > 1_000_000) continue
    if (best == null || value > best) best = value
  }
  return best
}

function extractResistance(
  corpus: string,
  rows: string[],
  known: { mass: number | null; instability: number | null; totalScu: number | null }
): number | null {
  const fromCorpus = firstMatchingNumber(corpus, [
    /\bRESISTANCE\s*[:./\\-]*\s*(-?\d[\d,]*\.?\d*)/i,
    /\bRE5\s*[:./\\-]*\s*(-?\d[\d,]*\.?\d*)/i,
    /(?:^|\s)RES(?![A-Z])\s*[:./\\-]*\s*(-?\d[\d,]*\.?\d*)/i,
  ])
  if (fromCorpus != null && isResistanceValue(fromCorpus, known)) return fromCorpus

  return extractStatFromRows(rows, isResRow, (value) => isResistanceValue(value, known))
}

function extractInstability(
  corpus: string,
  rows: string[],
  known: { mass: number | null; resistancePercent: number | null; totalScu: number | null }
): number | null {
  const fromCorpus = firstMatchingNumber(corpus, [
    /\bINSTABILITY\s*[:.]?\s*(-?\d[\d,]*\.?\d*)/i,
    /\bINST\s*[:.]?\s*(-?\d[\d,]*\.?\d*)/i,
    /\b1NST\s*[:.]?\s*(-?\d[\d,]*\.?\d*)/i,
    /\bIN5T\s*[:.]?\s*(-?\d[\d,]*\.?\d*)/i,
    /\bLNST\s*[:.]?\s*(-?\d[\d,]*\.?\d*)/i,
  ])
  if (fromCorpus != null && isInstabilityValue(fromCorpus, known)) return fromCorpus

  return extractStatFromRows(rows, isInstRow, (value) => isInstabilityValue(value, known))
}

function extractTotalScu(corpus: string, rows: string[]): number | null {
  const fromCorpus = firstMatchingNumber(corpus, [
    /\bCOMP(?:OSITION)?\s*(?:\([^)]*SCU[^)]*\))?\s*[:.]?\s*(-?\d[\d,]*\.?\d*)/i,
    /(-?\d[\d,]*\.?\d*)\s*SCU/i,
  ])
  if (fromCorpus != null && fromCorpus > 0) return fromCorpus

  for (const row of rows) {
    if (!/\bCOMP(?:OSITION)?\b/i.test(row) && !/\bSCU\b/i.test(row)) continue
    const value = lastNumberInRow(row)
    if (value != null && value > 0) return value
  }
  return null
}

function extractPanelStats(rows: HudRows): PanelStats {
  const mass = extractMass(rows.corpus, rows.rows)
  const resistancePercent = extractResistance(rows.corpus, rows.rows, {
    mass,
    instability: null,
    totalScu: null,
  })
  const instability = extractInstability(rows.corpus, rows.rows, {
    mass,
    resistancePercent,
    totalScu: null,
  })
  const totalScu = extractTotalScu(rows.corpus, rows.rows)

  return { mass, resistancePercent, instability, totalScu }
}

function lastNumberInRow(row: string): number | null {
  const matches = [...row.matchAll(/-?\d+(?:[.,]\d+)?/g)]
  if (!matches.length) return null
  return parseNumberToken(matches[matches.length - 1][0])
}

function valueFromLabelRow(row: string, lines: string[], index: number): number | null {
  const inline = lastNumberInRow(row)
  if (inline != null) return inline
  for (let j = index + 1; j < Math.min(index + 2, lines.length); j++) {
    const next = parseNumberToken(lines[j])
    if (next != null) return next
  }
  return null
}

function extractStatFromRows(
  rows: string[],
  rowMatcher: (row: string) => boolean,
  validate: (value: number) => boolean
): number | null {
  for (let i = 0; i < rows.length; i++) {
    if (!rowMatcher(rows[i])) continue
    const value = valueFromLabelRow(rows[i], rows, i)
    if (value != null && validate(value)) return value
  }
  return null
}

function isResistanceValue(
  value: number,
  known: { mass: number | null; instability: number | null; totalScu: number | null }
): boolean {
  if (!Number.isFinite(value) || value < 0) return false
  if (known.mass != null && Math.abs(value - known.mass) < 0.01) return false
  if (known.instability != null && Math.abs(value - known.instability) < 0.01) return false
  if (known.totalScu != null && value > 200 && Math.abs(value - known.totalScu) < 1) return false
  if (value > 0 && value <= 1) return true
  return value <= 100
}

function isInstabilityValue(
  value: number,
  known: { mass: number | null; resistancePercent: number | null; totalScu: number | null }
): boolean {
  if (!Number.isFinite(value) || value < 0) return false
  if (known.mass != null && Math.abs(value - known.mass) < 0.01) return false
  if (known.resistancePercent != null && Math.abs(value - known.resistancePercent) < 0.01) return false
  if (known.totalScu != null && value > 200 && Math.abs(value - known.totalScu) < 1) return false
  return value <= 100
}

function isResRow(row: string): boolean {
  if (/\bRESULTS?\b/i.test(row)) return false
  if (/\bRESISTANCE\b/i.test(row)) return true
  if (/\bRE5\b/i.test(row)) return true
  if (/(?:^|\s)RES\s*[:./\\-]/i.test(row)) return true

  const letters = ocrHeaderLetters(row)
  if (!letters || letters.startsWith('RESULT')) return false
  if (letters.startsWith('RESISTANCE')) return true
  if (letters.startsWith('RES')) return true
  return false
}

function isInstRow(row: string): boolean {
  if (/\bINST(?:ABILITY)?\b/i.test(row)) return true
  const letters = ocrHeaderLetters(row)
  if (!letters) return false
  if (letters.startsWith('INST') || letters.includes('INSTABIL')) return true
  return /^1NST|^IN5T|^LNST/.test(letters)
}

function isMassRow(row: string): boolean {
  if (/\bMASS\b/i.test(row)) return true
  const letters = ocrHeaderLetters(row)
  return letters.startsWith('MASS')
}

function rowHasHudStatLabel(row: string): boolean {
  return (
    isMassRow(row) ||
    isResRow(row) ||
    isInstRow(row) ||
    (/\bCOMP(?:OSITION)?\b/i.test(row) && /\bSCU\b/i.test(row)) ||
    /\bCOMP(?:OSITION)?\b/i.test(row)
  )
}

function normalizeResistancePercent(value: number): number {
  if (value > 0 && value <= 1) return Math.round(value * 100)
  return Math.round(value)
}

// ---------------------------------------------------------------------------
// Composition rows
// ---------------------------------------------------------------------------

function isCompositionPercentRow(row: string): boolean {
  if (rowHasHudStatLabel(row)) return false
  return /(\d+(?:\.\d+)?)\s*%/.test(row)
}

function normalizeElementName(raw: string): string {
  const stripped = stripMineableLabel(raw.replace(/\((?:ORE|RAW)\)/gi, '').trim())
  if (!stripped) return stripped
  if (/^inert/i.test(stripped)) return 'Inert'
  return resolveOcrOreName(stripped).name
}

function hasTrailingQuality(row: string): boolean {
  return /\s+Q?\d{1,4}\s*$/i.test(row.trim())
}

function readOrphanQualityRow(row: string | undefined): number | null {
  if (!row) return null
  const match = row.trim().match(/^Q?(\d{1,4})$/i)
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

function buildQualityMissingWarning(elementName: string, rawRow: string): string {
  const defaultQ = defaultLedgerQualityForElement(elementName)
  const trimmed = rawRow.trim()
  const longNameLikely =
    elementName.length >= 12 || (trimmed.length >= 28 && !hasTrailingQuality(trimmed))
  if (longNameLikely) {
    return `${elementName} — Q may be hidden on the HUD; left at default Q${defaultQ}. Set manually if needed.`
  }
  return `${elementName} — Q not read from scan; left at default Q${defaultQ}. Set manually if needed.`
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
  if (qualityMissing) warnings.push(buildQualityMissingWarning(elementName, rawOcrLine))

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

function parseCompositionRow(
  row: string,
  elementRank: Map<string, number>,
  compositionLines: OcrCompositionLine[],
  warnings: string[],
  allRows: string[],
  rowIndex: number,
  consumedIndices: Set<number>
): { kind: 'inert'; percent: number } | null {
  const inertMatch = row.match(INERT_LINE_RE)
  if (inertMatch) return { kind: 'inert', percent: Number.parseFloat(inertMatch[1]) }

  const strict = row.match(COMPOSITION_LINE_WITH_Q_RE)
  if (strict) {
    const percent = Number.parseFloat(strict[1])
    const elementName = normalizeElementName(strict[2])
    const quality = Number.parseInt(strict[3], 10)
    if (!Number.isFinite(percent) || !elementName || !Number.isFinite(quality)) return null
    if (isInertElement(elementName)) return { kind: 'inert', percent }
    pushOreLine(elementName, percent, quality, false, row, elementRank, compositionLines, warnings)
    return null
  }

  const percentOnly = row.match(COMPOSITION_PERCENT_LINE_RE)
  if (percentOnly && /%/.test(row)) {
    const percent = Number.parseFloat(percentOnly[1])
    const elementName = normalizeElementName(percentOnly[2])
    if (!Number.isFinite(percent) || !elementName) return null
    if (isInertElement(elementName)) return { kind: 'inert', percent }

    const orphanQuality = readOrphanQualityRow(allRows[rowIndex + 1])
    if (orphanQuality != null) {
      consumedIndices.add(rowIndex + 1)
      pushOreLine(
        elementName,
        percent,
        orphanQuality,
        false,
        `${row.trim()} / ${allRows[rowIndex + 1].trim()}`,
        elementRank,
        compositionLines,
        warnings
      )
      return null
    }

    pushOreLine(elementName, percent, null, true, row, elementRank, compositionLines, warnings)
    return null
  }

  if (!hasTrailingQuality(row)) return null
  const loose = row.match(/(\d+(?:\.\d+)?)\s*%?\s+(.+?)\s+Q?(\d+)/i)
  if (!loose) return null

  const percent = Number.parseFloat(loose[1])
  const elementName = normalizeElementName(loose[2])
  const quality = Number.parseInt(loose[3], 10)
  if (!Number.isFinite(percent) || !elementName || !Number.isFinite(quality)) return null
  if (isInertElement(elementName)) return { kind: 'inert', percent }
  pushOreLine(elementName, percent, quality, false, row, elementRank, compositionLines, warnings)
  return null
}

function parseCompositionRows(
  rows: string[],
  warnings: string[]
): { lines: OcrCompositionLine[]; inertPercent: number | null } {
  const compositionLines: OcrCompositionLine[] = []
  let inertPercent: number | null = null
  const elementRank = new Map<string, number>()
  const consumedIndices = new Set<number>()

  for (let i = 0; i < rows.length; i++) {
    if (consumedIndices.has(i)) continue
    const row = rows[i].trim()
    if (!row || !isCompositionPercentRow(row)) continue

    const parsed = parseCompositionRow(
      row,
      elementRank,
      compositionLines,
      warnings,
      rows,
      i,
      consumedIndices
    )
    if (parsed?.kind === 'inert') inertPercent = parsed.percent
  }

  return { lines: compositionLines, inertPercent }
}

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

// ---------------------------------------------------------------------------
// Primary ore
// ---------------------------------------------------------------------------

function parseOreNameFromRow(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const oreTagged = trimmed.match(/^([A-Za-z][A-Za-z0-9\s]*?)\s*\((?:ORE|RAW)\)/i)
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

function resolvePrimaryOreName(
  rows: string[],
  compositionLines: OcrCompositionLine[]
): string | null {
  let massIndex = -1
  for (let i = 0; i < rows.length; i++) {
    if (isMassRow(rows[i])) {
      massIndex = i
      break
    }
  }

  if (massIndex >= 0) {
    for (let i = 0; i < massIndex; i++) {
      if (/\bRESULTS?\b/i.test(rows[i])) continue
      const oreName = parseOreNameFromRow(rows[i])
      if (oreName) return oreName
    }
  }

  for (const row of rows) {
    if (/\bRESULTS?\b/i.test(row)) continue
    if (rowHasHudStatLabel(row) || isCompositionPercentRow(row)) continue
    const oreName = parseOreNameFromRow(row)
    if (oreName) return oreName
  }

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

// ---------------------------------------------------------------------------
// Main parse entry points
// ---------------------------------------------------------------------------

function parseRockScanHud(rows: HudRows): RockScanOcrParseResult {
  if (!rows.rows.length) {
    return { ok: false, error: 'OCR returned no readable text — try a tighter crop around SCAN RESULTS.' }
  }

  const warnings: string[] = []
  const panel = extractPanelStats(rows)
  const { lines: compositionLines, inertPercent } = parseCompositionRows(rows.rows, warnings)
  assignBandRanksByPercent(compositionLines)

  const resolvedPrimary = resolvePrimaryOreName(rows.rows, compositionLines)
  if (!resolvedPrimary) {
    return {
      ok: false,
      error: 'Could not read the primary ore — include the ore name (e.g. BORASE) above MASS or both composition bands in the crop.',
    }
  }
  const primaryOreName = resolveOcrOreName(resolvedPrimary).name

  if (panel.mass == null) {
    return { ok: false, error: 'Could not read Mass from the crop — include the MASS line.' }
  }
  if (panel.resistancePercent == null) {
    return { ok: false, error: 'Could not read Resistance from the crop — include the RES line.' }
  }
  if (panel.instability == null) {
    return { ok: false, error: 'Could not read Instability from the crop — include the INST line.' }
  }
  if (panel.totalScu == null || panel.totalScu <= 0) {
    return { ok: false, error: 'Could not read total SCU from COMPOSITION — include that header line.' }
  }
  if (compositionLines.length < 2) {
    return {
      ok: false,
      error: 'Need at least two composition lines in the crop — include the full COMPOSITION list.',
    }
  }

  const primaryBandCount = compositionLines.filter((line) => line.elementName === primaryOreName).length
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
      mass: Math.round(panel.mass),
      resistancePercent: normalizeResistancePercent(panel.resistancePercent),
      instability: panel.instability,
      totalScu: panel.totalScu,
      compositionLines,
      inertPercentScanned: inertPercent,
      warnings,
    },
  }
}

/** Parse from raw OCR text (fallback when word boxes unavailable). */
export function parseRockScanOcrText(rawText: string): RockScanOcrParseResult {
  return parseRockScanHud(buildHudRows(rawText))
}

/** Parse from Tesseract word boxes — preferred; preserves spatial HUD order. */
export function parseRockScanOcrWords(rawText: string, words: OcrWordBox[]): RockScanOcrParseResult {
  return parseRockScanHud(buildHudRows(rawText, words))
}

/** Higher = more of the scan was understood. Used to pick the best OCR pass. */
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
