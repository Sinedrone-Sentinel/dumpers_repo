/** Join a game record to a UEX row. A shared uuid only matches when the names agree. */

export function shopNameKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * @param {Array<{ uuid?: string, name?: string, nameFull?: string }>} rows
 * @param {{ uuid?: string, displayName?: string }} record
 */
export function matchShopRow(rows, record) {
  const uuid = String(record.uuid || '').trim().toLowerCase()
  const wanted = shopNameKey(record.displayName)
  const named = (row) => {
    const name = shopNameKey(row.name)
    const full = shopNameKey(row.nameFull)
    return Boolean(wanted) && (name === wanted || full === wanted)
  }
  if (uuid) {
    const hits = rows.filter((row) => String(row.uuid || '').trim().toLowerCase() === uuid)
    if (hits.length === 1) return hits[0]
    if (hits.length > 1) return hits.find(named) || null
  }
  // UEX often stores a different uuid than the game record. A single matching name is still that item.
  const byName = rows.filter(named)
  if (byName.length === 1) return byName[0]
  return null
}
