/**
 * Catalog-key remaps for stored blueprint_id values.
 * Same CIG record UUID, stripped internalName changed (typo / rename / prefix).
 * 1:1 only. If the old key is still a live catalog id, skip.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { dirname } from 'path'

export function buildCatalogKeyRenames(oldBlueprints = [], newBlueprints = []) {
  const oldById = new Map()
  const newById = new Map()
  const oldDupes = new Set()
  const newDupes = new Set()

  const index = (list, map, dupes) => {
    for (const bp of list || []) {
      const id = String(bp?.id || '').trim().toLowerCase()
      const key = String(bp?.internalName || '').trim()
      if (!id || !key) continue
      if (map.has(id)) dupes.add(id)
      else map.set(id, key)
    }
  }
  index(oldBlueprints, oldById, oldDupes)
  index(newBlueprints, newById, newDupes)

  const liveKeys = new Set([...newById.values()])
  const usedFrom = new Set()
  const usedTo = new Set()
  const remaps = []

  for (const [id, from] of oldById) {
    if (oldDupes.has(id) || newDupes.has(id)) continue
    const to = newById.get(id)
    if (!to || to === from) continue
    if (liveKeys.has(from)) continue
    if (usedFrom.has(from) || usedTo.has(to)) continue
    usedFrom.add(from)
    usedTo.add(to)
    remaps.push({ from, to, id, rule: 'catalog_key_change' })
  }
  return remaps
}

export function writeCatalogKeyRenames(outPath, remaps) {
  mkdirSync(dirname(outPath), { recursive: true })
  const payload = {
    generatedAt: new Date().toISOString(),
    note: 'Same-record internalName changes (prefix/suffix-stripped catalog key). Applied by npm run relink-acquired-blueprint-ids.',
    remaps,
  }
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + '\n')
}
