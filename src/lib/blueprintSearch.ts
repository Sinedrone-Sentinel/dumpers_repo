import type { BlueprintWithSlots } from './blueprintResources'

export const BLUEPRINT_SEARCH_MAX_RESULTS = 50

export function filterBlueprintsForSearch(
  blueprints: BlueprintWithSlots[],
  query: string
): { results: BlueprintWithSlots[]; totalMatches: number } {
  const q = query.trim().toLowerCase()

  const matches = q.length === 0
    ? blueprints
    : blueprints.filter(
        (bp) =>
          (bp.blueprintName || '').toLowerCase().includes(q) ||
          (bp.file || '').toLowerCase().includes(q)
      )

  const sorted = [...matches].sort((a, b) =>
    (a.blueprintName || a.file || '').localeCompare(b.blueprintName || b.file || '')
  )

  return {
    results: sorted.slice(0, BLUEPRINT_SEARCH_MAX_RESULTS),
    totalMatches: sorted.length,
  }
}
