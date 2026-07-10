import { resolveOcrOreName } from './miningOreCanonical'
import { stripMineableLabel } from './miningOreLabel'
import { isInertElement, oreResourceKeyFromElementName } from './rockCalculator'
import { getDefaultBandQuality, resolveLedgerQuality } from './qualityBands'
import {
  allDecimalsInRow,
  extractMassFromBlock,
  MAX_ROCK_SCANNER_MASS,
  MIN_ROCK_SCANNER_MASS,
  parseCompositionLeadingPercent,
  parseLeadingPercentFromWordTokens,
} from './rockCalculatorOcrCorrect'

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
// Mole pilot-seat RESULTS panel (crop the right-side HUD block):
//   RESULTS → ore (ORE) → MASS → RES → INST → COMP xx SCU → xx% ORE (ORE) Q###
//
// Parser strategy (order-independent):
//   1. Cluster OCR words into spatial rows (true HUD order when boxes exist)
//   2. Flatten rows into a searchable corpus for label regex extraction
//   3. Collect composition % rows separately (order among % rows irrelevant)
// ---------------------------------------------------------------------------

interface HudRows {
  rows: string[]
  corpus: string
  rowGroups?: RowWord[][]
}

interface RowWord {
  text: string
  x0: number
  x1: number
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
  'INS',
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

/** e.g. 12.48% SAVRILIUM (ORE) 905 or 12.43% BORASE (ORE) Q54 — HUD omits "Q" on many patches */
const COMPOSITION_LINE_WITH_Q_RE =
  /(\d+(?:\.\d+)?)\s*%?\s+([A-Za-z][A-Za-z0-9\s]*?)(?:\s*\((?:ORE|RAW)\))?\s+(?:Q)?(\d{1,4})\s*$/i

const INERT_LINE_RE = /(\d+(?:\.\d+)?)\s*%?\s+INERT\s+MATERIALS(?:\s+\d{1,4})?\s*$/i

const COMPOSITION_PERCENT_LINE_RE = /(\d+(?:\.\d+)?)\s*%?\s+(.+?)\s*$/i

/** Alternate composition format: `ELEMENT: 43.5%` — kept as fallback only. */
const COLON_COMPOSITION_LINE_RE =
  /^([A-Za-z][A-Za-z0-9\s]*?)\s*:\s*(\d+(?:\.\d+)?)\s*%?\s*$/i

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
  if (words?.length) {
    const rowGroups = clusterWordsIntoRowGroups(words)
    const rawRows = rowGroups
      .map((group) => group.map((word) => word.text).join(' ').trim())
      .filter(Boolean)
    const rows = splitMergedCompositionRows(rawRows)
    return {
      rows,
      corpus: rows.join(' ').replace(/\s+/g, ' ').trim(),
      rowGroups,
    }
  }
  const rows = splitMergedCompositionRows(splitTextLines(rawText))
  return {
    rows,
    corpus: rows.join(' ').replace(/\s+/g, ' ').trim(),
  }
}

function splitTextLines(rawText: string): string[] {
  return cleanOcrText(rawText)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

/** Split OCR rows where two composition lines were merged (multiple % tokens). */
function splitMergedCompositionRows(rows: string[]): string[] {
  const split: string[] = []
  for (const row of rows) {
    const matches = [...row.matchAll(/(\d+(?:\.\d+)?)\s*%/g)]
    if (matches.length <= 1) {
      split.push(row)
      continue
    }
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index ?? 0
      const end = i + 1 < matches.length ? (matches[i + 1].index ?? row.length) : row.length
      const segment = row.slice(start, end).trim()
      if (segment) split.push(segment)
    }
  }
  return split
}

/** Sort OCR words by position, group into horizontal rows, join left-to-right. */
function clusterWordsIntoRowGroups(words: OcrWordBox[]): RowWord[][] {
  const sorted = [...words]
    .map((word) => ({
      text: word.text.trim(),
      x0: word.x0,
      x1: word.x1,
      y0: word.y0,
      y1: word.y1,
    }))
    .filter((word) => word.text.length > 0)
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)

  if (!sorted.length) return []

  const heights = sorted.map((word) => Math.max(1, word.y1 - word.y0))
  const medianHeight = heights.sort((a, b) => a - b)[Math.floor(heights.length / 2)] ?? 12
  const rowThreshold = Math.max(8, medianHeight * 0.65)

  const rowGroups: Array<Array<{ text: string; x0: number; x1: number; y0: number }>> = []
  let currentGroup: Array<{ text: string; x0: number; x1: number; y0: number }> = []
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
    .map((group) => group.map((word) => ({ text: word.text, x0: word.x0, x1: word.x1 })))
    .filter((group) => group.length > 0)
}

const DIFFICULTY_ROW_RE =
  /\b(?:IMPOSSIBLE|DIFFICULT|CHALLENGING|MODERATE|LOW|TRIVIAL|EASY|RISK|HAZARD)\b/i

const MAX_INSTABILITY = 10_000
const MAX_RESISTANCE_PERCENT = 100

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
  for (let i = 0; i < rows.length; i++) {
    if (!isMassRow(rows[i])) continue

    const block = [rows[i], rows[i + 1], rows[i + 2]].filter(Boolean).join(' ')
    const fromBlock = extractMassFromBlock(block)
    if (fromBlock != null) return fromBlock

    const inline = valueFromLabelRow(rows[i], rows, i)
    if (inline != null && inline >= MIN_ROCK_SCANNER_MASS && inline <= MAX_ROCK_SCANNER_MASS) {
      return Math.round(inline)
    }
  }

  const fromCorpus = firstMatchingNumber(corpus, [
    /\bMASS\s*[:.]?\s*(-?\d[\d,]*\.?\d*)/i,
    /\bM[A4@]SS\s*[:.]?\s*(-?\d[\d,]*\.?\d*)/i,
  ])
  if (
    fromCorpus != null &&
    fromCorpus >= MIN_ROCK_SCANNER_MASS &&
    fromCorpus <= MAX_ROCK_SCANNER_MASS
  ) {
    return Math.round(fromCorpus)
  }

  let best: number | null = null
  for (const row of rows) {
    if (isCompositionPercentRow(row) || rowHasHudStatLabel(row)) continue
    const value = lastNumberInRow(row)
    if (
      value == null ||
      value < MIN_ROCK_SCANNER_MASS ||
      value > MAX_ROCK_SCANNER_MASS
    ) {
      continue
    }
    if (best == null || value > best) best = value
  }
  return best != null ? Math.round(best) : null
}

function extractResistance(
  corpus: string,
  rows: string[],
  known: { mass: number | null; instability: number | null; totalScu: number | null }
): number | null {
  const fromCorpus = firstMatchingNumber(corpus, [
    /\bRESISTANCE\s*[:./\\-]*\s*(-?\d[\d,]*\.?\d*)\s*%?/i,
    /\bRE5\s*[:./\\-]*\s*(-?\d[\d,]*\.?\d*)\s*%?/i,
    /(?:^|\s)RES(?![A-Z])\s*[:./\\-]*\s*(-?\d[\d,]*\.?\d*)\s*%?/i,
    /\bRST\s*[:./\\-]*\s*(-?\d[\d,]*\.?\d*)\s*%?/i,
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
    /\bINSTABILITY\s*[:.]?\s*(-?\d[\d,]*\.?\d*)\s*%?/i,
    /\bINST\s*[:.]?\s*(-?\d[\d,]*\.?\d*)\s*%?/i,
    /\bINS\s*[:.]?\s*(-?\d[\d,]*\.?\d*)\s*%?/i,
    /\b1NST(?:ABILITY)?\s*[:.]?\s*(-?\d[\d,]*\.?\d*)\s*%?/i,
    /\bIN5T(?:ABILITY)?\s*[:.]?\s*(-?\d[\d,]*\.?\d*)\s*%?/i,
    /\bLNST(?:ABILITY)?\s*[:.]?\s*(-?\d[\d,]*\.?\d*)\s*%?/i,
  ])
  if (fromCorpus != null && isInstabilityValue(fromCorpus, known)) return fromCorpus

  return extractStatFromRows(rows, isInstRow, (value) => isInstabilityValue(value, known))
}

function isCompHeaderRow(row: string): boolean {
  return /\bCOMP(?:OSITION)?\b/i.test(row)
}

function isDifficultyRow(row: string): boolean {
  return DIFFICULTY_ROW_RE.test(row)
}

function isRockScuRow(row: string): boolean {
  return /\bROCK\s+SCU\b/i.test(row)
}

/** HUD order between MASS and COMPOSITION header: RES then INST. */
function extractResistanceInstabilityByPosition(
  rows: string[],
  mass: number | null
): { resistancePercent: number | null; instability: number | null } {
  let massIdx = -1
  let compIdx = rows.length

  for (let i = 0; i < rows.length; i++) {
    if (massIdx < 0 && isMassRow(rows[i])) massIdx = i
    if (compIdx === rows.length && isCompHeaderRow(rows[i])) compIdx = i
  }
  if (compIdx === rows.length) {
    for (let i = 0; i < rows.length; i++) {
      if (isCompositionPercentRow(rows[i])) {
        compIdx = i
        break
      }
    }
  }

  if (massIdx < 0) return { resistancePercent: null, instability: null }

  const statValues: number[] = []
  for (let i = massIdx + 1; i < compIdx; i++) {
    const row = rows[i]
    if (
      isCompositionPercentRow(row) ||
      isDifficultyRow(row) ||
      isRockScuRow(row) ||
      isCargoRow(row)
    ) {
      continue
    }
    if (parseOreNameFromRow(row) && !rowHasHudStatLabel(row)) continue

    const value = valueFromLabelRow(row, rows, i)
    if (value == null || !isBetweenMassAndCompStat(value, mass)) continue
    if (knownRockScuValue(rows, value)) continue
    statValues.push(value)
  }

  if (statValues.length >= 2) {
    return { resistancePercent: statValues[0], instability: statValues[1] }
  }
  if (statValues.length === 1) {
    const sole = statValues[0]
    const hasFraction = Math.abs(sole - Math.round(sole)) > 0.001
    if (hasFraction && sole < 20) {
      return { resistancePercent: null, instability: sole }
    }
    if (sole <= MAX_RESISTANCE_PERCENT && Number.isInteger(sole)) {
      return { resistancePercent: sole, instability: null }
    }
    return { resistancePercent: null, instability: sole }
  }
  return { resistancePercent: null, instability: null }
}

function knownRockScuValue(rows: string[], value: number): boolean {
  for (const row of rows) {
    if (!isRockScuRow(row)) continue
    const last = lastNumberInRow(row)
    if (last != null && Math.abs(last - value) < 0.01) return true
  }
  return false
}

function isCargoRow(row: string): boolean {
  return /\bCARGO\b/i.test(row)
}

function isPlausibleRockTotalScu(value: number): boolean {
  return Number.isFinite(value) && value >= 0.5 && value <= 500
}

function extractTotalScu(corpus: string, rows: string[]): number | null {
  const candidates: number[] = []

  for (const row of rows) {
    if (!isRockScuRow(row)) continue
    const tagged = row.match(/\bROCK\s+SCU\s*[:.]?\s*(\d+(?:\.\d+)?)/i)
    if (tagged) {
      const value = Number.parseFloat(tagged[1])
      if (isPlausibleRockTotalScu(value)) return value
    }
    const last = lastNumberInRow(row)
    if (last != null && isPlausibleRockTotalScu(last)) return last
  }

  for (const row of rows) {
    if (isCargoRow(row)) continue
    if (!isCompHeaderRow(row) && !/\bCOMP\b/i.test(row)) continue

    const tagged = row.match(/\bCOMP(?:OSITION)?\.?\s*(\d+(?:\.\d+)?)/i)
    if (tagged) {
      const value = Number.parseFloat(tagged[1])
      if (isPlausibleRockTotalScu(value)) candidates.push(value)
    }

    for (const value of allDecimalsInRow(row)) {
      if (isPlausibleRockTotalScu(value)) candidates.push(value)
    }

    const last = lastNumberInRow(row)
    if (last != null && isPlausibleRockTotalScu(last)) candidates.push(last)
  }

  if (candidates.length) {
    return candidates.find((value) => !Number.isInteger(value)) ?? candidates[candidates.length - 1]
  }

  for (const row of rows) {
    if (isCargoRow(row) || isCompositionPercentRow(row)) continue
    if (!/\bSCU\b/i.test(row)) continue
    const last = lastNumberInRow(row)
    if (last != null && isPlausibleRockTotalScu(last)) candidates.push(last)
  }

  if (candidates.length) return candidates[candidates.length - 1]

  const fromCorpus = firstMatchingNumber(corpus, [
    /\bCOMP(?:OSITION)?\.?\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*SCU/i,
  ])
  if (fromCorpus != null && isPlausibleRockTotalScu(fromCorpus)) return fromCorpus

  return null
}

function extractPanelStats(rows: HudRows): PanelStats {
  const mass = extractMass(rows.corpus, rows.rows)
  let resistancePercent = extractResistance(rows.corpus, rows.rows, {
    mass,
    instability: null,
    totalScu: null,
  })
  let instability = extractInstability(rows.corpus, rows.rows, {
    mass,
    resistancePercent,
    totalScu: null,
  })

  const positional = extractResistanceInstabilityByPosition(rows.rows, mass)
  if (resistancePercent == null) resistancePercent = positional.resistancePercent
  if (instability == null) instability = positional.instability

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

function isBetweenMassAndCompStat(value: number, mass: number | null): boolean {
  if (!Number.isFinite(value) || value < 0) return false
  if (mass != null && Math.abs(value - mass) < 0.01) return false
  if (value > 50_000) return false
  return true
}

function isResistanceValue(
  value: number,
  known: { mass: number | null; instability: number | null; totalScu: number | null }
): boolean {
  if (!isBetweenMassAndCompStat(value, known.mass)) return false
  if (known.instability != null && Math.abs(value - known.instability) < 0.01) return false
  if (known.totalScu != null && Math.abs(value - known.totalScu) < 1) return false
  const hasFraction = Math.abs(value - Math.round(value)) > 0.001
  if (hasFraction && value < 20) return false
  if (value > 0 && value <= 1) return true
  return value <= MAX_RESISTANCE_PERCENT
}

function isInstabilityValue(
  value: number,
  known: { mass: number | null; resistancePercent: number | null; totalScu: number | null }
): boolean {
  if (!isBetweenMassAndCompStat(value, known.mass)) return false
  if (
    known.resistancePercent != null &&
    value <= MAX_RESISTANCE_PERCENT &&
    Math.abs(value - known.resistancePercent) < 0.01
  ) {
    return false
  }
  if (known.totalScu != null && value > 500 && Math.abs(value - known.totalScu) < 1) return false
  return value <= MAX_INSTABILITY
}

function isResRow(row: string): boolean {
  if (/\bRESULTS?\b/i.test(row)) return false
  if (/\bRESISTANCE\b/i.test(row)) return true
  if (/\bRE5\b/i.test(row)) return true
  if (/\bRST\b/i.test(row)) return true
  if (/(?:^|\s)RES\s*[:./\\-]/i.test(row)) return true

  const letters = ocrHeaderLetters(row)
  if (!letters || letters.startsWith('RESULT')) return false
  if (letters.startsWith('RESISTANCE') || letters.startsWith('RES') || letters.startsWith('RST')) {
    return true
  }
  return false
}

function isInstRow(row: string): boolean {
  if (/\bINSTABILITY\b/i.test(row)) return true
  if (/\bINST\b/i.test(row)) return true
  if (/\bINS\b/i.test(row)) return true

  const letters = ocrHeaderLetters(row)
  if (!letters) return false
  if (letters.startsWith('INSTABILITY') || letters.startsWith('INST') || letters === 'INS') {
    return true
  }
  if (letters.includes('INSTABIL')) return true
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
    (isCompHeaderRow(row) && /\bSCU\b/i.test(row)) ||
    isCompHeaderRow(row)
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
  if (rowHasHudStatLabel(row) || isRockScuRow(row)) return false
  if (COLON_COMPOSITION_LINE_RE.test(row)) return true
  return /(\d+(?:\.\d+)?)\s*%/.test(row)
}

function normalizeElementName(raw: string): string {
  const tagged = raw.match(/^(.+?)\s*\((?:ORE|RAW)\)/i)
  if (tagged) {
    const stripped = stripMineableLabel(tagged[1].trim())
    if (!stripped) return stripped
    if (/^inert/i.test(stripped)) return 'Inert'
    return resolveOcrOreName(stripped).name
  }

  const stripped = stripMineableLabel(raw.replace(/\((?:ORE|RAW)\)/gi, '').trim())
  if (!stripped) return stripped
  if (/^inert/i.test(stripped)) return 'Inert'
  const firstToken = stripped.match(/^([A-Za-z][A-Za-z0-9]*)/)?.[1]
  if (firstToken) return resolveOcrOreName(firstToken).name
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

  const duplicate = compositionLines.some(
    (line) =>
      line.elementName === elementName && Math.abs(line.percent - percent) < 0.11
  )
  if (duplicate) return

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

function isPlausibleScanQuality(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 9999
}

function isPlausibleCompositionPercent(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 100
}

function leadingPercentFromRowWords(words: RowWord[]): number | null {
  return parseLeadingPercentFromWordTokens(words.map((word) => word.text))
}

function trailingQualityFromRowWords(words: RowWord[]): number | null {
  if (!words.length) return null
  const rowMinX = Math.min(...words.map((word) => word.x0))
  const rowMaxX = Math.max(...words.map((word) => word.x1))
  const qZoneStart = rowMinX + (rowMaxX - rowMinX) * 0.5

  const sorted = [...words].sort((a, b) => b.x0 - a.x0)
  for (const word of sorted) {
    if (word.x0 < qZoneStart) break
    const match = word.text.match(/^Q?(\d{1,4})$/i)
    if (!match) continue
    const quality = Number.parseInt(match[1], 10)
    if (isPlausibleScanQuality(quality) && quality > 0) return quality
  }
  return null
}

function elementTextFromRowWords(
  words: RowWord[],
  percentEndX: number,
  qualityStartX: number | null
): string {
  const sorted = [...words].sort((a, b) => a.x0 - b.x0)
  const endX = qualityStartX ?? Math.max(...words.map((word) => word.x1))
  return sorted
    .filter((word) => word.x0 >= percentEndX - 2 && word.x1 <= endX + 2)
    .map((word) => word.text)
    .join(' ')
    .trim()
}

function splitRowGroupByPercents(group: RowWord[]): RowWord[][] {
  const sorted = [...group].sort((a, b) => a.x0 - b.x0)
  const percentStarts: number[] = []
  for (let i = 0; i < sorted.length; i++) {
    const token = sorted[i].text
    if (/(\d+(?:\.\d+)?)\s*%/.test(token) || (/^\d+(?:\.\d+)?$/.test(token) && sorted[i + 1]?.text === '%')) {
      percentStarts.push(i)
    }
  }
  if (percentStarts.length <= 1) return [group]

  const segments: RowWord[][] = []
  for (let p = 0; p < percentStarts.length; p++) {
    const start = percentStarts[p]
    const end = p + 1 < percentStarts.length ? percentStarts[p + 1] : sorted.length
    segments.push(sorted.slice(start, end))
  }
  return segments
}

function parseCompositionSpatial(
  words: RowWord[],
  rowText: string
): { elementName: string; percent: number; quality: number | null; qualityMissing: boolean } | { kind: 'inert'; percent: number } | null {
  if (/INERT/i.test(rowText)) {
    const percent = leadingPercentFromRowWords(words)
    return percent != null && isPlausibleCompositionPercent(percent) ? { kind: 'inert', percent } : null
  }

  const percent = leadingPercentFromRowWords(words)
  if (percent == null || !isPlausibleCompositionPercent(percent)) return null

  const sorted = [...words].sort((a, b) => a.x0 - b.x0)
  let percentEndX = sorted[0]?.x1 ?? 0
  for (let i = 0; i < sorted.length; i++) {
    const token = sorted[i].text
    if (/(\d+(?:\.\d+)?)\s*%/.test(token) || (/^\d+(?:\.\d+)?$/.test(token) && sorted[i + 1]?.text === '%')) {
      percentEndX = sorted[i + 1]?.text === '%' ? sorted[i + 1].x1 : sorted[i].x1
      break
    }
  }

  const quality = trailingQualityFromRowWords(words)
  const qualityWord = [...words]
    .sort((a, b) => b.x0 - a.x0)
    .find((word) => {
      const rowMinX = Math.min(...words.map((item) => item.x0))
      const rowMaxX = Math.max(...words.map((item) => item.x1))
      const qZoneStart = rowMinX + (rowMaxX - rowMinX) * 0.5
      return word.x0 >= qZoneStart && /^Q?\d{1,4}$/i.test(word.text)
    })

  const elementRaw = elementTextFromRowWords(words, percentEndX, qualityWord?.x0 ?? null)
  const elementName = normalizeElementName(elementRaw)
  if (!elementName || isInertElement(elementName)) {
    return percent != null && isPlausibleCompositionPercent(percent) ? { kind: 'inert', percent } : null
  }

  return {
    elementName,
    percent,
    quality,
    qualityMissing: quality == null,
  }
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
  if (/\bINERT\b/i.test(row)) {
    const percent =
      parseCompositionLeadingPercent(row) ??
      (() => {
        const inertMatch = row.match(INERT_LINE_RE)
        return inertMatch ? Number.parseFloat(inertMatch[1]) : null
      })()
    if (percent != null && Number.isFinite(percent)) {
      return { kind: 'inert', percent }
    }
  }

  const colon = row.match(COLON_COMPOSITION_LINE_RE)
  if (colon) {
    const elementName = normalizeElementName(colon[1])
    const percent = Number.parseFloat(colon[2])
    if (!Number.isFinite(percent) || !elementName) return null
    if (isInertElement(elementName)) return { kind: 'inert', percent }
    pushOreLine(elementName, percent, null, true, row, elementRank, compositionLines, warnings)
    return null
  }

  const strict = row.match(COMPOSITION_LINE_WITH_Q_RE)
  if (strict) {
    const percent =
      parseCompositionLeadingPercent(row) ?? Number.parseFloat(strict[1])
    const elementName = normalizeElementName(strict[2])
    const quality = Number.parseInt(strict[3], 10)
    if (
      !Number.isFinite(percent) ||
      !elementName ||
      !isPlausibleScanQuality(quality)
    ) {
      return null
    }
    if (isInertElement(elementName)) return { kind: 'inert', percent }
    pushOreLine(elementName, percent, quality, false, row, elementRank, compositionLines, warnings)
    return null
  }

  const percentOnly = row.match(COMPOSITION_PERCENT_LINE_RE)
  if (percentOnly && /%/.test(row)) {
    const percent =
      parseCompositionLeadingPercent(row) ?? Number.parseFloat(percentOnly[1])
    let elementRaw = percentOnly[2].trim()
    let inlineQuality: number | null = null

    const trailingQ = elementRaw.match(/^(.*?)(?:\s+(?:Q)?(\d{1,4}))\s*$/i)
    if (trailingQ && isPlausibleScanQuality(Number.parseInt(trailingQ[2], 10))) {
      elementRaw = trailingQ[1].trim()
      inlineQuality = Number.parseInt(trailingQ[2], 10)
    }

    const elementName = normalizeElementName(elementRaw)
    if (!Number.isFinite(percent) || !elementName) return null
    if (isInertElement(elementName)) return { kind: 'inert', percent }

    if (inlineQuality != null) {
      pushOreLine(
        elementName,
        percent,
        inlineQuality,
        false,
        row,
        elementRank,
        compositionLines,
        warnings
      )
      return null
    }

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
  const loose = row.match(/(\d+(?:\.\d+)?)\s*%?\s+(.+?)\s+(?:Q)?(\d{1,4})\s*$/i)
  if (!loose) return null

  const percent = parseCompositionLeadingPercent(row) ?? Number.parseFloat(loose[1])
  const elementName = normalizeElementName(loose[2])
  const quality = Number.parseInt(loose[3], 10)
  if (
    !Number.isFinite(percent) ||
    !elementName ||
    !isPlausibleScanQuality(quality)
  ) {
    return null
  }
  if (isInertElement(elementName)) return { kind: 'inert', percent }
  pushOreLine(elementName, percent, quality, false, row, elementRank, compositionLines, warnings)
  return null
}

function acceptInertPercent(
  percent: number,
  compositionLines: OcrCompositionLine[]
): boolean {
  const valuableTotal = compositionLines.reduce((sum, line) => sum + line.percent, 0)
  return percent + valuableTotal <= 101.5
}

function enrichMissingQualityFromSpatial(
  compositionLines: OcrCompositionLine[],
  rowGroups: RowWord[][] | undefined
): void {
  if (!rowGroups?.length) return

  for (const group of rowGroups) {
    for (const segment of splitRowGroupByPercents(group)) {
      const rowText = segment.map((word) => word.text).join(' ').trim()
      if (!rowText || !isCompositionPercentRow(rowText)) continue

      const spatial = parseCompositionSpatial(segment, rowText)
      if (!spatial || ('kind' in spatial && spatial.kind === 'inert')) continue
      if (spatial.qualityMissing || spatial.quality == null) continue

      const match = compositionLines.find(
        (line) =>
          line.elementName === spatial.elementName &&
          Math.abs(line.percent - spatial.percent) < 0.25 &&
          line.qualityMissing
      )
      if (!match) continue

      match.quality = spatial.quality
      match.qualityMissing = false
      match.rawOcrLine = `${match.rawOcrLine} / spatial Q${spatial.quality}`
    }
  }
}

function parseCompositionRows(
  rows: string[],
  warnings: string[],
  rowGroups?: RowWord[][]
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
    if (parsed?.kind === 'inert' && acceptInertPercent(parsed.percent, compositionLines)) {
      inertPercent = parsed.percent
    }
  }

  enrichMissingQualityFromSpatial(compositionLines, rowGroups)

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
  if (best) return best

  if (compositionLines.length) {
    return compositionLines.reduce((top, line) =>
      line.percent > top.percent ? line : top
    ).elementName
  }
  return null
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
  const { lines: compositionLines, inertPercent } = parseCompositionRows(
    rows.rows,
    warnings,
    rows.rowGroups
  )
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
    return {
      ok: false,
      error: 'Could not read Resistance — include the RES line between MASS and INST in the crop.',
    }
  }
  if (panel.instability == null) {
    return {
      ok: false,
      error: 'Could not read Instability — include the INST line between RES and COMP in the crop.',
    }
  }
  if (panel.totalScu == null || panel.totalScu <= 0) {
    return {
      ok: false,
      error: 'Could not read total SCU — include the COMP xx SCU line in the crop.',
    }
  }
  if (compositionLines.length < 2) {
    return {
      ok: false,
      error: 'Need at least two composition lines in the crop — include the full composition list.',
    }
  }

  const primaryBandCount = compositionLines.filter((line) => line.elementName === primaryOreName).length
  if (primaryBandCount < 2) {
    return {
      ok: false,
      error: `Found ${primaryOreName} but could not read both High and Low composition bands — include the full composition list.`,
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
  if (result.ok) {
    let score = 1000
    for (const line of result.data.compositionLines) {
      if (line.qualityMissing) score -= 12
      else score += 8
    }
    const valuableTotal = result.data.compositionLines.reduce((sum, line) => sum + line.percent, 0)
    if (result.data.inertPercentScanned != null) {
      if (Math.abs(valuableTotal + result.data.inertPercentScanned - 100) < 1.5) score += 25
      else if (result.data.inertPercentScanned > 60 && valuableTotal > 35) score -= 30
    } else if (Math.abs(valuableTotal - 100) < 2) {
      score += 10
    }
    if (result.data.totalScu != null && isPlausibleRockTotalScu(result.data.totalScu)) {
      score += 30
      if (!Number.isInteger(result.data.totalScu)) score += 10
    } else {
      score -= 40
    }
    if (result.data.totalScu === 1 && result.data.mass > 5000) score -= 80
    return score
  }

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
