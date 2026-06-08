import type { BlueprintWithSlots } from './blueprintResources'

export const BLUEPRINT_SEARCH_MIN_CHARS = 3
export const BLUEPRINT_SEARCH_MAX_RESULTS = 50

export function filterBlueprintsForSearch(
  blueprints: BlueprintWithSlots[],
  query: string
): { results: BlueprintWithSlots[]; totalMatches: number } {
  const q = query.trim().toLowerCase()
  if (q.length < BLUEPRINT_SEARCH_MIN_CHARS) {
    return { results: [], totalMatches: 0 }
  }

  const matches = blueprints.filter(
    (bp) =>
      (bp.blueprintName || '').toLowerCase().includes(q) ||
      (bp.file || '').toLowerCase().includes(q)
  )

  matches.sort((a, b) =>
    (a.blueprintName || a.file || '').localeCompare(b.blueprintName || b.file || '')
  )

  return {
    results: matches.slice(0, BLUEPRINT_SEARCH_MAX_RESULTS),
    totalMatches: matches.length,
  }
}
