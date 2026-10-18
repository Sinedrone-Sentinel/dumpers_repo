/**
 * Patch-day ship-part rules.
 *
 * parseShipShop applies these while it builds the catalog. The shop uses the
 * same hull rule when it lists parts for a hardpoint.
 *
 * A part with no required tags is exclusive to the hull named in its entity
 * name or display name. Parts that already list required tags stay on that
 * tag rule.
 */

const GENERIC_TAGS = new Set(['flightready', 'weaponmountusable'])

function requirementTags(value) {
  return String(value || '')
    .split(/\s+/)
    .map((tag) => tag.replace(/^\$/, ''))
    .filter((tag) => tag && !GENERIC_TAGS.has(tag.toLowerCase()))
}

export function hullTokensForShip(shipId, makerCodes) {
  let token = String(shipId || '').toLowerCase()
  const maker = [...makerCodes].sort((a, b) => b.length - a.length).find((code) => token.startsWith(`${code}_`))
  if (maker) token = token.slice(maker.length + 1)
  if (token.length < 3) return []
  const tokens = [token]
  const series = token.match(/^(.*\d)[a-z]$/)
  if (series && series[1].length >= 3) tokens.push(series[1])
  const split = token.match(/^(.*)_([a-z])$/)
  if (split && split[1].length >= 3) tokens.push(split[1])
  const parts = token.split('_').filter(Boolean)
  for (let index = parts.length - 1; index >= 1; index -= 1) {
    const stem = parts.slice(0, index).join('_')
    if (stem.length >= 3) tokens.push(stem)
  }
  return [...new Set(tokens)]
}

/** Maker codes, plus a leading id token shared by more than one hull (Esperia ships omit the code). */
export function makerCodesFor(ships) {
  const makers = new Set(
    ships.map((ship) => String(ship.manufacturerCode || '').toLowerCase()).filter((code) => code.length >= 3),
  )
  const heads = new Map()
  for (const ship of ships) {
    const head = String(ship.id || '').toLowerCase().split('_')[0]
    if (head.length < 3) continue
    heads.set(head, (heads.get(head) || 0) + 1)
  }
  for (const [head, count] of heads) {
    if (count >= 2) makers.add(head)
  }
  return makers
}

export function hullTokenList(ships) {
  const makers = makerCodesFor(ships)
  return [...new Set(ships.flatMap((ship) => hullTokensForShip(ship.id, makers)))].sort((a, b) => b.length - a.length)
}

export function tokenInName(value, tokens) {
  const normalized = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_')
  const hay = `_${normalized}_`
  for (const token of tokens) {
    if (hay.includes(`_${token}_`)) return token
  }
  return null
}

/** Hull a part is locked to, or null when it can fit any ship that accepts its type. */
export function exclusiveHullFor(item, tokens) {
  if (requirementTags(item?.requiredTags).length > 0) return null
  return tokenInName(item?.entityClass, tokens) || tokenInName(item?.displayName, tokens)
}

export function applyShipPartRules(ships, catalog) {
  const tokens = hullTokenList(ships)
  for (const item of catalog) {
    const hull = exclusiveHullFor(item, tokens)
    if (hull) item.exclusiveHull = hull
    else delete item.exclusiveHull
  }
  return catalog
}
