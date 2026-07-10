/**
 * Heuristics for HUD OCR misreads: dropped decimal points, glued digits, inflated trace %.
 * See Mole RESULTS lines like `12.80%` → `1280%` or `2.80%` → `280%`.
 */

export function inferDecimalPercentFromRaw(rawLine: string): number | null {
  const row = rawLine.trim()
  if (!row) return null

  const explicit = row.match(/(\d+\.\d{1,2})\s*%/)
  if (explicit) {
    const value = Number.parseFloat(explicit[1])
    if (value > 0 && value <= 100) return value
  }

  const spaced = row.match(/(\d)\s+(\d{2})\s*%/)
  if (spaced) {
    const value = Number.parseFloat(`${spaced[1]}.${spaced[2]}`)
    if (value > 0 && value <= 100) return value
  }

  const gluedAtStart = row.match(/^(\d{3,4})\s*%/)
  if (gluedAtStart) {
    const digits = gluedAtStart[1]
    if (digits.length === 4) {
      const value = Number.parseFloat(`${digits.slice(0, 2)}.${digits.slice(2)}`)
      if (value > 0 && value <= 100) return value
    }
    if (digits.length === 3) {
      const value = Number.parseFloat(`${digits[0]}.${digits.slice(1)}`)
      if (value > 0 && value <= 100) return value
    }
  }

  return null
}

export function correctCompositionPercent(percent: number, rawLine: string): number {
  const inferred = inferDecimalPercentFromRaw(rawLine)
  if (inferred != null) {
    if (Math.abs(inferred - percent) > 0.05) return inferred
    return percent
  }

  if (percent > 100 && percent < 10_000) {
    const divided = Math.round((percent / 100) * 100) / 100
    if (divided > 0 && divided <= 100) return divided
  }

  if (percent >= 100 && percent < 1000) {
    const asDecimal = Number.parseFloat(`${Math.floor(percent / 100)}.${String(percent % 100).padStart(2, '0')}`)
    if (asDecimal > 0 && asDecimal <= 60) return asDecimal
  }

  return percent
}

export function isSuspiciousTracePercent(percent: number, elementBandCount: number): boolean {
  if (elementBandCount >= 2) return false
  return percent > 15
}

export function decimalCandidatesFromGluedPercent(percent: number): number[] {
  if (!Number.isFinite(percent) || percent < 100 || percent >= 10_000) return []
  const digits = String(Math.round(percent))
  const candidates: number[] = []

  if (digits.length === 3) {
    candidates.push(Number.parseFloat(`${digits[0]}.${digits.slice(1)}`))
  }
  if (digits.length === 4) {
    candidates.push(Number.parseFloat(`${digits.slice(0, 2)}.${digits.slice(2)}`))
  }

  return candidates.filter((value) => value > 0 && value <= 100)
}

/** Pick alternate % values that bring the valuable sum closest to the expected total. */
export function rebalanceCompositionPercents(
  lines: Array<{ elementName: string; percent: number; rawOcrLine: string }>,
  isInert: (name: string) => boolean,
  inertPercent: number | null = null
): boolean {
  const valuable = lines.filter((line) => !isInert(line.elementName))
  const bandCounts = new Map<string, number>()
  for (const line of valuable) {
    bandCounts.set(line.elementName, (bandCounts.get(line.elementName) ?? 0) + 1)
  }

  const targetValuable =
    inertPercent != null && inertPercent >= 0 && inertPercent <= 100
      ? Math.round((100 - inertPercent) * 100) / 100
      : 100

  const total = () => valuable.reduce((sum, line) => sum + line.percent, 0)
  if (Math.abs(total() - targetValuable) <= 1.5) return false

  let changed = false

  for (const line of valuable) {
    const inferred = inferDecimalPercentFromRaw(line.rawOcrLine)
    if (inferred != null && Math.abs(inferred - line.percent) > 0.05) {
      line.percent = inferred
      changed = true
    }
  }

  if (Math.abs(total() - targetValuable) <= 1.5) return changed

  for (const line of valuable) {
    if (line.percent <= 100) continue
    const fixed = correctCompositionPercent(line.percent, line.rawOcrLine)
    if (Math.abs(fixed - line.percent) > 0.05) {
      line.percent = fixed
      changed = true
    }
  }

  if (Math.abs(total() - targetValuable) <= 1.5) return changed

  for (const line of valuable) {
    const bands = bandCounts.get(line.elementName) ?? 1
    if (!isSuspiciousTracePercent(line.percent, bands)) continue

    const glued = decimalCandidatesFromGluedPercent(line.percent)
    const candidates = [
      line.percent,
      ...glued,
      line.percent / 100,
      ...glued.map((value) => Number.parseFloat(value.toFixed(2))),
    ]
    if (line.percent >= 180 && line.percent <= 299) {
      candidates.push(Number.parseFloat(`${Math.floor(line.percent / 100)}.80`))
    }

    const unique = candidates.filter(
      (value, index, array) => value > 0 && value <= 100 && array.indexOf(value) === index
    )

    let best = line.percent
    let bestTotalDelta = Math.abs(total() - targetValuable)
    for (const candidate of unique) {
      const old = line.percent
      line.percent = Math.round(candidate * 100) / 100
      const delta = Math.abs(total() - targetValuable)
      if (delta < bestTotalDelta) {
        bestTotalDelta = delta
        best = line.percent
      }
      line.percent = old
    }

    if (Math.abs(best - line.percent) > 0.05) {
      line.percent = best
      changed = true
    }
  }

  return changed
}

export function allIntegersInRow(row: string): number[] {
  return [...row.matchAll(/\b(\d{3,6})\b/g)]
    .map((match) => Number.parseInt(match[1], 10))
    .filter((value) => Number.isFinite(value))
}

export function pickBestMassCandidate(candidates: number[]): number | null {
  const plausible = candidates.filter((value) => value >= 1_000 && value <= 250_000)
  if (!plausible.length) return null
  return plausible.sort((a, b) => b - a)[0]
}

export function allDecimalsInRow(row: string): number[] {
  return [...row.matchAll(/(\d+\.\d{1,3})/g)]
    .map((match) => Number.parseFloat(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0)
}
