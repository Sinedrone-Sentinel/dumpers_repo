/**
 * Shared SEO display helpers for public blueprint pages.
 * Keep in sync with src/lib/blueprintSeoContent.ts (same label / amount / title rules).
 */

export function seoMaterialLabel(opt) {
  if (!opt) return 'Material'
  return opt.resourceName || opt.entityName || opt.displayName || opt.itemName || 'Material'
}

export function seoMaterialAmount(opt) {
  if (!opt) return '—'
  if (opt.standardCargoUnits != null && Number(opt.standardCargoUnits) > 0) {
    return `${Number(opt.standardCargoUnits)} SCU`
  }
  const count = opt.quantity ?? opt.count
  if (count != null && Number(count) > 0) {
    const n = Number(count)
    return `${n} item${n === 1 ? '' : 's'}`
  }
  return '—'
}

export function cleanSeoMissionTitle(raw) {
  if (raw == null) return ''
  return String(raw)
    .replace(/~mission\s*\([^)]*\)/gi, '')
    .replace(/~\w+\([^)]*\)/g, '')
    .replace(/\s*\|\s*/g, ' · ')
    .replace(/\s*:\s*(\s|$)/g, ': ')
    .replace(/\s+/g, ' ')
    .replace(/\s+at\s*$/i, '')
    .replace(/^\s*Rank\s*-\s*/i, '')
    .replace(/:\s*$/g, '')
    .trim()
}

export function looksInternalSeoLabel(label) {
  if (!label) return false
  const s = String(label).trim()
  const sl = s.toLowerCase()
  if (sl.startsWith('@')) return true
  if (sl.includes('harvestable_')) return true
  if (sl.startsWith('item_name') || sl.startsWith('items_commodities_')) return true
  if (sl.includes('item_name')) return true
  if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(sl) && (sl.includes('_1h_') || /\d/.test(sl))) {
    return true
  }
  return false
}

export function looksInternalSeoMissionTitle(title) {
  if (!title) return false
  return /~mission\s*\(/i.test(String(title)) || /~\w+\([^)]*\)/.test(String(title))
}

export function pickSeoMaterialOption(slot) {
  const opts = slot?.options || []
  return opts.find((o) => o.type === 'resource' || o.resourceName) || opts[0] || null
}
