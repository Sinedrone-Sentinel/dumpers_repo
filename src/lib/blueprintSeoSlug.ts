/** Stable public SEO slugs for `/blueprints/{slug}/` pages. */

export type BlueprintSeoSlugInput = {
  blueprintName?: string | null
  internalName?: string | null
  file?: string | null
  entityClass?: string | null
}

export function hasBlueprintSeoEntity(bp: { entityClass?: string | null }): boolean {
  return Boolean(bp.entityClass && String(bp.entityClass).trim())
}

/** Kebab-case slug from a display name (or internal id). */
export function slugifyBlueprintLabel(label: string): string {
  const raw = String(label || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
  return raw || 'blueprint'
}

export function blueprintDisplayName(bp: BlueprintSeoSlugInput): string {
  return (bp.blueprintName || bp.internalName || bp.file || 'Blueprint').trim() || 'Blueprint'
}

export function blueprintInternalKey(bp: BlueprintSeoSlugInput): string {
  return (bp.internalName || bp.file || '').trim()
}

/**
 * Assign unique slugs: prefer display-name slug; on collision append `-{internal}`.
 * Returns Map internalName → slug (only for blueprints with entityClass).
 */
export function buildBlueprintSeoSlugMap(
  blueprints: BlueprintSeoSlugInput[]
): Map<string, string> {
  const used = new Set<string>()
  const map = new Map<string, string>()

  const eligible = blueprints
    .filter(hasBlueprintSeoEntity)
    .map((bp) => ({
      key: blueprintInternalKey(bp),
      name: blueprintDisplayName(bp),
      internal: blueprintInternalKey(bp),
    }))
    .filter((row) => row.key)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))

  for (const row of eligible) {
    let slug = slugifyBlueprintLabel(row.name)
    if (used.has(slug)) {
      const suffix = slugifyBlueprintLabel(row.internal)
      slug = suffix && suffix !== slug ? `${slug}-${suffix}` : `${slug}-${map.size + 1}`
    }
    // Still colliding (rare): force unique with counter
    if (used.has(slug)) {
      let n = 2
      while (used.has(`${slug}-${n}`)) n += 1
      slug = `${slug}-${n}`
    }
    used.add(slug)
    map.set(row.key, slug)
  }

  return map
}

export function blueprintSeoPath(slug: string): string {
  const clean = String(slug || '')
    .replace(/^\/+|\/+$/g, '')
    .trim()
  return clean ? `/blueprints/${clean}/` : '/blueprints/'
}
