/**
 * Collect CIG typo → canonical corrections applied during parse.
 */

/** @type {Map<string, { from: string, to: string, context: string }>} */
const applied = new Map()

export function clearAppliedSpellingCorrections() {
  applied.clear()
}

export function recordSpellingCorrection(from, to, context = 'localization') {
  if (!from || !to || from === to) return
  const key = `${from}→${to}|${context}`
  if (!applied.has(key)) {
    applied.set(key, { from, to, context })
  }
}

export function getAppliedSpellingCorrections() {
  return [...applied.values()]
}
