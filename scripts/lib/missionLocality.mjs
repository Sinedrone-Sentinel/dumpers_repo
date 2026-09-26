import { basename } from 'path'

/** System implied by a MissionLocality record name when a rest stop path has none. */
export function fallbackSystemForLocalityKey(key) {
  const normalized = String(key || '').toLowerCase()
  if (normalized.startsWith('pyro') || /^region[a-d]$/.test(normalized)) return 'pyro'
  if (normalized.startsWith('stanton')) return 'stanton'
  if (normalized.startsWith('nyx')) return 'nyx'
  return null
}

function titleSystem(system) {
  if (!system) return null
  return system.charAt(0).toUpperCase() + system.slice(1)
}

/**
 * One starmap ref → the planet it belongs to.
 * kind `body` means the planet (or one of its moons) is in the gate.
 * kind `point` is a single Lagrange or orbit stop, not the whole planet.
 */
export function classifyLocationRef(ref, fallbackSystem) {
  const refPath = String(ref || '').replace(/\\/g, '/').toLowerCase()
  const base = basename(refPath, '.json').replace(/^starmapobject\./, '')
  const systemInPath = refPath.match(/\/system\/(stanton|pyro|nyx)\//)?.[1] || null

  let match = base.match(/^(stanton|pyro|nyx)(\d+)$/)
  if (match) {
    return { token: `${match[1]}${match[2]}`, kind: 'body', system: match[1] }
  }

  match = base.match(/^(stanton|pyro|nyx)(\d+)_l(\d+)$/)
  if (match) {
    return {
      token: `${match[1]}${match[2]}`,
      kind: 'point',
      point: `L${match[3]}`,
      system: match[1],
    }
  }

  // Moons (stanton2a, pyro5b) are that planet's area, not a separate gate.
  match = base.match(/^(stanton|pyro|nyx)(\d+)[a-z]$/)
  if (match) {
    return { token: `${match[1]}${match[2]}`, kind: 'body', system: match[1] }
  }

  match = base.match(/^rr_p(\d+)_(leo|l(\d+))/)
  if (match) {
    const system = systemInPath || fallbackSystem
    if (!system) return null
    return {
      token: `${system}${match[1]}`,
      kind: 'point',
      point: match[2] === 'leo' ? 'orbit' : `L${match[3]}`,
      system,
    }
  }

  if (/^(stanton|pyro|nyx)_?star$/.test(base)) {
    const system = systemInPath || base.replace(/_?star$/, '')
    return { token: null, kind: 'star', system }
  }

  if (systemInPath) return { token: null, kind: 'other', system: systemInPath }
  return null
}

export function joinPlaceNames(names) {
  const list = names.filter(Boolean)
  if (list.length <= 1) return list[0] || ''
  if (list.length === 2) return `${list[0]} and ${list[1]}`
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`
}

function pointLabel(points) {
  const list = [...points].sort((a, b) => {
    const rank = (point) => (point === 'orbit' ? 0 : Number(point.slice(1)))
    return rank(a) - rank(b)
  })
  const lags = list.filter((point) => point.startsWith('L')).map((point) => Number(point.slice(1)))
  const consecutive = lags.length > 2 && lags.every((num, index) => index === 0 || num === lags[index - 1] + 1)
  const lagText = consecutive ? `L${lags[0]}-L${lags[lags.length - 1]}` : joinPlaceNames(lags.map((num) => `L${num}`))
  const parts = []
  if (list.includes('orbit')) parts.push('orbit')
  if (lagText) parts.push(lagText)
  return joinPlaceNames(parts)
}

export function describeLocalityPlaces(refs, localityKey, locName) {
  const fallback = fallbackSystemForLocalityKey(localityKey)
  const planets = new Map()
  const systems = new Set()
  let hasStar = false

  for (const ref of refs ?? []) {
    const info = classifyLocationRef(ref, fallback)
    if (!info) continue
    const systemLabel = titleSystem(info.system)
    if (systemLabel) systems.add(systemLabel)
    if (info.kind === 'star') {
      hasStar = true
      continue
    }
    if (!info.token) continue
    let row = planets.get(info.token)
    if (!row) {
      row = {
        hasBody: false,
        points: new Set(),
        system: info.system,
        index: Number(info.token.replace(/\D/g, '')) || 0,
      }
      planets.set(info.token, row)
    }
    if (info.kind === 'body') row.hasBody = true
    else if (info.point) row.points.add(info.point)
  }

  const primary = String(localityKey || '').toLowerCase().match(/^(stanton|pyro|nyx)\d+$/)?.[0] || null
  const ordered = [...planets.entries()].sort((a, b) => {
    if (primary) {
      if (a[0] === primary) return -1
      if (b[0] === primary) return 1
    }
    if (a[1].system !== b[1].system) return String(a[1].system).localeCompare(String(b[1].system))
    return a[1].index - b[1].index
  })

  const placeNames = ordered.map(([token, row]) => {
    const name = locName(token) || token
    if (row.hasBody || row.points.size === 0) return name
    return `${name} ${pointLabel(row.points)}`
  })

  return { placeNames, systems: [...systems], hasStar }
}

/** Member-facing locality chip. Names every planet the gate actually includes. */
export function buildLocalityLabel(key, refs, locName) {
  const { placeNames, systems, hasStar } = describeLocalityPlaces(refs, key, locName)
  const regionMatch = String(key || '').toLowerCase().match(/^region([a-d])$/)
  if (regionMatch) {
    const around = placeNames.length > 0 ? ` (near ${joinPlaceNames(placeNames)})` : ''
    return `Pyro region ${regionMatch[1].toUpperCase()}${around}`
  }
  if (hasStar || placeNames.length === 0) {
    return systems.length > 0 ? `Anywhere in ${systems.join(' or ')}` : null
  }
  if (placeNames.length === 1 && !/ L\d|\sorbit/.test(` ${placeNames[0]}`)) {
    return `${placeNames[0]} area`
  }
  return joinPlaceNames(placeNames)
}
