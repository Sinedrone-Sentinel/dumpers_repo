/**
 * HUD percent parsing — OCR often splits `2.00%` into `2`, `00`, `%` (no period token).
 * We must not glue that into `200%`.
 */

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100
}

/** Parse the leading composition % from a RESULTS panel line. */
export function parseCompositionLeadingPercent(row: string): number | null {
  const trimmed = row.trim()
  if (!trimmed) return null

  const explicit = trimmed.match(/^(\d+\.\d{1,2})\s*%/)
  if (explicit) {
    const value = Number.parseFloat(explicit[1])
    if (value > 0 && value <= 100) return roundPercent(value)
  }

  const spacedCents = trimmed.match(/^(\d{1,2})\s+(\d{2})\s*%/)
  if (spacedCents) {
    const value = Number.parseFloat(`${spacedCents[1]}.${spacedCents[2]}`)
    if (value > 0 && value <= 100) return roundPercent(value)
  }

  const gluedCents = trimmed.match(/^(\d{3,4})\s*%/)
  if (gluedCents) {
    const digits = gluedCents[1]
    if (digits.length === 3) {
      const value = Number.parseFloat(`${digits[0]}.${digits.slice(1)}`)
      if (value > 0 && value <= 100) return roundPercent(value)
    }
    if (digits.length === 4) {
      const value = Number.parseFloat(`${digits.slice(0, 2)}.${digits.slice(2)}`)
      if (value > 0 && value <= 100) return roundPercent(value)
    }
  }

  const whole = trimmed.match(/^(\d{1,2})\s*%/)
  if (whole) {
    const value = Number.parseFloat(whole[1])
    if (value > 0 && value <= 100) return roundPercent(value)
  }

  return null
}

export function parseLeadingPercentFromWordTokens(tokens: string[]): number | null {
  if (!tokens.length) return null

  const joinedLine = tokens.slice(0, 8).join(' ')
  const fromLine = parseCompositionLeadingPercent(joinedLine)
  if (fromLine != null) return fromLine

  const compact = tokens.slice(0, 6).join('')
  const compactExplicit = compact.match(/^(\d+\.\d{1,2})%/)
  if (compactExplicit) {
    const value = Number.parseFloat(compactExplicit[1])
    if (value > 0 && value <= 100) return roundPercent(value)
  }

  for (let i = 0; i < Math.min(tokens.length, 5); i++) {
    const token = tokens[i]
    const glued = token.match(/^(\d+\.\d{1,2})%$/)
    if (glued) {
      const value = Number.parseFloat(glued[1])
      if (value > 0 && value <= 100) return roundPercent(value)
    }

    if (/^\d{1,2}$/.test(token) && tokens[i + 1] === '%') {
      const value = Number.parseFloat(token)
      if (value > 0 && value <= 100) return roundPercent(value)
    }

    if (/^\d{1,2}$/.test(token) && /^\d{2}$/.test(tokens[i + 1] ?? '') && tokens[i + 2] === '%') {
      const value = Number.parseFloat(`${token}.${tokens[i + 1]}`)
      if (value > 0 && value <= 100) return roundPercent(value)
    }
  }

  const gluedCents = compact.match(/^(\d{3,4})%/)
  if (gluedCents) {
    return parseCompositionLeadingPercent(`${gluedCents[1]}%`)
  }

  return null
}

export const MIN_ROCK_SCANNER_MASS = 1_000
export const MAX_ROCK_SCANNER_MASS = 999_999

function isPlausibleScannerMass(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= MIN_ROCK_SCANNER_MASS &&
    value <= MAX_ROCK_SCANNER_MASS
  )
}

export function allIntegersInRow(row: string): number[] {
  return [...row.matchAll(/\b(\d{3,6})\b/g)]
    .map((match) => Number.parseInt(match[1], 10))
    .filter((value) => Number.isFinite(value))
}

export function pickBestMassCandidate(candidates: number[]): number | null {
  const plausible = candidates.filter(isPlausibleScannerMass)
  if (!plausible.length) return null
  return plausible.sort((a, b) => b - a)[0]
}

/** Join split OCR mass (e.g. `150 001`) and prefer 4–6 digit reads on the MASS block. */
export function extractMassFromBlock(block: string): number | null {
  const candidates: number[] = []

  for (const match of block.matchAll(/\b(\d{4,6})\b/g)) {
    const value = Number.parseInt(match[1], 10)
    if (isPlausibleScannerMass(value)) candidates.push(value)
  }

  for (const match of block.matchAll(/\b(\d{1,3})\s+(\d{3,5})\b/g)) {
    const combined = `${match[1]}${match[2]}`
    if (combined.length < 4 || combined.length > 6) continue
    const value = Number.parseInt(combined, 10)
    if (isPlausibleScannerMass(value)) candidates.push(value)
  }

  candidates.push(...allIntegersInRow(block).filter(isPlausibleScannerMass))

  return pickBestMassCandidate(candidates)
}

export function allDecimalsInRow(row: string): number[] {
  return [...row.matchAll(/(\d+\.\d{1,3})/g)]
    .map((match) => Number.parseFloat(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0)
}
