/**
 * Keep in sync with src/lib/blueprintSeoSlug.ts
 * Used by generate-blueprint-seo-pages.mjs / generate-sitemap.mjs at build time.
 */

export function hasBlueprintSeoEntity(bp) {
  return Boolean(bp?.entityClass && String(bp.entityClass).trim())
}

export function slugifyBlueprintLabel(label) {
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

export function blueprintDisplayName(bp) {
  return (bp.blueprintName || bp.internalName || bp.file || 'Blueprint').trim() || 'Blueprint'
}

export function blueprintInternalKey(bp) {
  return (bp.internalName || bp.file || '').trim()
}

export function buildBlueprintSeoSlugMap(blueprints) {
  const used = new Set()
  const map = new Map()

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

export function blueprintSeoPath(slug) {
  const clean = String(slug || '')
    .replace(/^\/+|\/+$/g, '')
    .trim()
  return clean ? `/blueprints/${clean}/` : '/blueprints/'
}
