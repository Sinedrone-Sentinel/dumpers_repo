/** Exact-only acquired-id remaps. No display-name or fuzzy matching. */

export type ExactRelinkRule =
  | 'exact'
  | 'case'
  | 'legacy_path'
  | 'strip_scitem'
  | 'add_bp_prefix'

export type ExactRelinkResult =
  | { ok: true; canon: string; rule: ExactRelinkRule }
  | { ok: false; rule: 'unknown' }

function extractCraftFileId(storedId: string): string | null {
  const normalized = storedId.replace(/\\/g, '/').toLowerCase()
  const scitem = normalized.match(/bp_craft_([^/]+?)_scitem\.json$/i)
  if (scitem) return scitem[1]
  const simple = normalized.match(/bp_craft_([^/]+?)\.json$/i)
  if (simple) return simple[1]
  return null
}

function uniqueCatalogHit(catalogIds: ReadonlySet<string>, candidate: string): string | null {
  if (catalogIds.has(candidate)) return candidate
  const lower = candidate.toLowerCase()
  let hit: string | null = null
  for (const id of catalogIds) {
    if (id.toLowerCase() !== lower) continue
    if (hit && hit !== id) return null
    hit = id
  }
  return hit
}

/**
 * Map a stored blueprint_id onto a catalog internalName only when the transform
 * is unique and mechanical (path / case / trailing _scitem / missing bp_ prefix).
 */
export function exactRelinkBlueprintId(
  storedId: string,
  catalogIds: ReadonlySet<string>
): ExactRelinkResult {
  const raw = storedId.trim()
  if (!raw) return { ok: false, rule: 'unknown' }

  const exact = uniqueCatalogHit(catalogIds, raw)
  if (exact) return { ok: true, canon: exact, rule: exact === raw ? 'exact' : 'case' }

  const fromPath = extractCraftFileId(raw)
  if (fromPath) {
    const pathHit = uniqueCatalogHit(catalogIds, fromPath)
    if (pathHit) return { ok: true, canon: pathHit, rule: 'legacy_path' }
  }

  const lower = raw.toLowerCase()
  if (lower.endsWith('_scitem')) {
    const stripped = raw.slice(0, -'_scitem'.length)
    const stripHit = uniqueCatalogHit(catalogIds, stripped)
    if (stripHit) return { ok: true, canon: stripHit, rule: 'strip_scitem' }
  }

  if (!lower.startsWith('bp_')) {
    const prefixed = uniqueCatalogHit(catalogIds, 'bp_' + raw)
    if (prefixed) return { ok: true, canon: prefixed, rule: 'add_bp_prefix' }
  }

  return { ok: false, rule: 'unknown' }
}
