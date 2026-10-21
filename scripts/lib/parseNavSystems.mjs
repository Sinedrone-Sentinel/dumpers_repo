/**
 * Build the shared nav map from placed PU system containers.
 * Bodies that are not children of a system container (Nyx I–III) are omitted.
 * Levski sits on Delamar inside the Glaciem ring, so that ring segment is the city stop.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')

function walkFiles(dir, acc) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) walkFiles(path, acc)
    else acc.push(path)
  }
}

function norm(path) {
  return path.replace(/\\/g, '/').toLowerCase()
}

function locName(localization, key) {
  if (!key) return null
  const raw = localization[key] || localization[key.split(',')[0]]
  if (!raw) return null
  const text = raw.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text || text.startsWith('@') || text.length > 80) return null
  return text
}

function quatMul(a, b) {
  const [aw, ax, ay, az] = a
  const [bw, bx, by, bz] = b
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ]
}

function quatRot(q, v) {
  const [w, x, y, z] = q
  const [vx, vy, vz] = v
  const ix = w * vx + y * vz - z * vy
  const iy = w * vy + z * vx - x * vz
  const iz = w * vz + x * vy - y * vx
  const iw = -x * vx - y * vy - z * vz
  return [
    ix * w - iw * x - iy * z + iz * y,
    iy * w - iw * y - iz * x + ix * z,
    iz * w - iw * z - ix * y + iy * x,
  ]
}

function parseRot(text) {
  const parts = (text || '1,0,0,0').split(',').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return [1, 0, 0, 0]
  return parts
}

function parsePos(text) {
  const parts = (text || '0,0,0').split(',').map(Number)
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return [0, 0, 0]
  return parts
}

function attrs(tag) {
  const out = {}
  const re = /([\w:]+)="([^"]*)"/g
  let match
  while ((match = re.exec(tag))) out[match[1]] = match[2]
  return out
}

function readSocpakXml(socpakPath, member) {
  const result = spawnSync('python', [join(HERE, 'readSocpakXml.py'), socpakPath, member], {
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.status !== 0) return null
  return result.stdout.toString('utf8')
}

function systemSocpaks(extractedRoot) {
  const root = join(extractedRoot, 'Data', 'ObjectContainers', 'PU', 'system')
  const files = []
  walkFiles(root, files)
  return files.filter((path) => /\/system\/[^/]+\/[^/]+\.socpak$/i.test(norm(path)))
}

const LEVSKI_RECORD = '468d4102-a210-47b5-8bc3-084f791a173c'

function isLevskiPlacement(socpakPath, attr) {
  const path = norm(socpakPath)
  const entity = String(attr?.entityName || '').toLowerCase()
  const record = String(attr?.starMapRecord || '').toLowerCase()
  if (record === LEVSKI_RECORD) return true
  if (path.endsWith('/levski.socpak') || entity === 'levski_location') return true
  return entity === 'glaciemring_segment_levski' || path.endsWith('glaciemring_segment_levski.socpak')
}

function classifySystemChild(socpakPath) {
  const path = norm(socpakPath)
  const base = path.split('/').pop()
  if (base.endsWith('star.socpak') || base.endsWith('skybox.socpak') || base.endsWith('system.socpak')) return null
  if (path.includes('/jumppoints/jumppoint_')) return 'gateway'
  if (/\/lagrangepoints\/(stanton|pyro|nyx)\d[a-z]?_l[1-5]\.socpak$/.test(path)) return 'station'
  if (path.includes('/station/') && !path.includes('commarray')) return 'station'
  if (/^(stanton|pyro|nyx)\d\.socpak$/.test(base)) return 'planet'
  if (/^(stanton|pyro|nyx)\d[a-z]\.socpak$/.test(base)) return 'moon'
  return null
}

function bodyKey(base) {
  const match = base.match(/^(stanton|pyro|nyx)(\d[a-z]?)\.socpak$/i)
  if (!match) return null
  return match[1][0].toUpperCase() + match[1].slice(1).toLowerCase() + match[2].toLowerCase()
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function tokenOf(path) {
  return basename(path).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function loadStarmapNames(extractedRoot, localization) {
  const dir = join(extractedRoot, 'libs', 'foundry', 'records', 'starmap')
  const files = []
  walkFiles(dir, files)
  const byId = new Map()
  for (const path of files) {
    if (!path.toLowerCase().endsWith('.json')) continue
    let doc
    try {
      doc = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      continue
    }
    const id = String(doc?._RecordId_ || '').toLowerCase()
    const key = String(doc?._RecordValue_?.name || '').replace(/^@/, '')
    const name = locName(localization, key)
    if (id && name) byId.set(id, name)
  }
  return byId
}

const CITY_FILES = [
  [/lorville\.socpak$/, 'Stanton1_Lorville', 'Lorville'],
  [/orison_all\.socpak$/, 'Stanton2_Orison', 'Orison'],
  [/a18_city\.socpak$/, 'Stanton3_Area18', 'Area18'],
  [/newbab_all\.socpak$/, 'Stanton4_NewBabbage', 'New Babbage'],
]

function cityName(socpakPath, localization, recordName) {
  if (recordName) return recordName
  const file = norm(socpakPath).split('/').pop()
  for (const [pattern, key, fallback] of CITY_FILES) {
    if (pattern.test(file)) return locName(localization, key) || fallback
  }
  return null
}

function recordName(starmap, attr) {
  const id = String(attr?.starMapRecord || '').toLowerCase()
  return id ? starmap.get(id) || null : null
}

function loadRestStopNames(extractedRoot, localization) {
  const dir = join(extractedRoot, 'libs', 'foundry', 'records', 'starmap', 'pu', 'station', 'reststop')
  const files = []
  walkFiles(dir, files)
  const byStem = new Map()
  for (const path of files) {
    if (!path.toLowerCase().endsWith('.json') || path.toLowerCase().includes('clinic')) continue
    let doc
    try {
      doc = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      continue
    }
    const key = String(doc?._RecordValue_?.name || '').replace(/^@/, '')
    const name = locName(localization, key)
    const stem = basename(path, '.json').replace(/^rr_/i, '').toLowerCase()
    if (stem && name) byStem.set(stem, name)
  }
  return byStem
}

function loadGatewayRecords(extractedRoot, localization) {
  const dir = join(extractedRoot, 'libs', 'foundry', 'records', 'starmap', 'pu')
  const files = []
  walkFiles(dir, files)
  const records = []
  for (const path of files) {
    if (!/rr_jp_.*\.json$/i.test(path)) continue
    let doc
    try {
      doc = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      continue
    }
    const key = String(doc?._RecordValue_?.name || '').replace(/^@/, '')
    const parts = key.split('_')
    if (parts.length < 3 || parts[2] !== 'JPStation') continue
    const name = locName(localization, key)
    if (!name) continue
    records.push({
      token: tokenOf(path).replace(/^rrjp/, ''),
      from: parts[0].toLowerCase(),
      to: parts[1].toLowerCase(),
      name,
    })
  }
  return records
}

function matchGateway(socpakPath, records) {
  const packed = tokenOf(socpakPath)
  let best = null
  for (const record of records) {
    if (!record.token || !packed.includes(record.token)) continue
    if (!best || record.token.length > best.token.length) best = record
  }
  return best
}

function isInternalName(name) {
  return /^PYAM[-_]/i.test(name || '')
}

function isShortCode(name) {
  return /^(?:[A-Z]{2,4} L[1-5]|[A-Z]{2,4}-L[1-5]|PYR\d[\s-]L[1-5])$/.test(name || '')
}

function codeAliases(name) {
  const spaced = String(name || '').match(/^([A-Z0-9]+) L([1-5])$/)
  if (spaced) return [`${spaced[1]}-L${spaced[2]}`]
  const hyphen = String(name || '').match(/^([A-Z0-9]+)-L([1-5])\b/)
  if (hyphen) return [`${hyphen[1]} L${hyphen[2]}`]
  return []
}

function pushAlias(aliases, value, name) {
  if (!value || value.toLowerCase() === String(name || '').toLowerCase()) return
  if (aliases.some((alias) => alias.toLowerCase() === value.toLowerCase())) return
  aliases.push(value)
}

function upgradeLagrange(localization, shortName) {
  if (!shortName) return null
  const key = `RR_${shortName.replace(/\s+/g, '_')}`
  return locName(localization, key)
}

function findSuffixName(localization, suffix) {
  const end = `_${suffix}`
  let fallback = null
  for (const [key, value] of Object.entries(localization)) {
    if (!key.toLowerCase().endsWith(end.toLowerCase())) continue
    if (/_desc$|_clinic$/i.test(key)) continue
    const text = locName(localization, key)
    if (!text) continue
    if (text.toLowerCase() === suffix.toLowerCase()) return text
    if (!fallback) fallback = text
  }
  return fallback
}

function transferName(localization, parentKey, socpakPath) {
  const path = norm(socpakPath)
  const keys = Object.keys(localization).filter((key) => {
    if (!key.startsWith(`${parentKey}_Transfer`)) return false
    if (/_desc$|_clinic$/i.test(key)) return false
    return Boolean(locName(localization, key))
  })
  if (keys.length === 0) return null
  const exact = keys.find((key) => key === `${parentKey}_Transfer`)
  if (path.includes('seraphim') || path.includes('cru-leo') || path.includes('_cru')) {
    const seraphim = keys.find((key) => /seraphim/i.test(key))
    if (seraphim) return locName(localization, seraphim)
  }
  if (exact) return locName(localization, exact)
  return locName(localization, keys[0])
}

function entityTail(entityName) {
  const parts = String(entityName || '').split('_').filter(Boolean)
  const last = parts[parts.length - 1]
  if (!last || /^(ooc|objectcontainer|loc|city)$/i.test(last)) {
    return parts[parts.length - 2] || last || ''
  }
  return last
}

function walkChildren(xml, visit) {
  const re = /<Child\b([^>]*?)(\/?)>|<\/Child>/g
  const stack = [{ pos: [0, 0, 0], rot: [1, 0, 0, 0] }]
  let match
  while ((match = re.exec(xml))) {
    if (match[0].startsWith('</')) {
      if (stack.length > 1) stack.pop()
      continue
    }
    const parent = stack[stack.length - 1]
    const attr = attrs(match[1])
    const local = parsePos(attr.pos)
    const localRot = parseRot(attr.rot)
    const rotated = quatRot(parent.rot, local)
    const world = {
      pos: [parent.pos[0] + rotated[0], parent.pos[1] + rotated[1], parent.pos[2] + rotated[2]],
      rot: quatMul(parent.rot, localRot),
      attr,
    }
    visit(world)
    if (match[2] !== '/') stack.push(world)
  }
}

function addPoint(points, point) {
  const idBase = `${point.system}:${slug(point.name)}`
  let id = idBase
  let n = 2
  while (points.some((row) => row.id === id)) id = `${idBase}-${n++}`
  points.push({ ...point, id })
  return id
}

function childPoints(xml, systemId, localization, gateways, starmap, restStops, points, parentKey) {
  walkChildren(xml, (world) => {
    const socpak = world.attr.name || ''
    if (isLevskiPlacement(socpak, world.attr)) {
      if (!points.some((row) => row.system === systemId && row.name === 'Levski')) {
        addPoint(points, {
          name: 'Levski',
          aliases: ['Delamar'],
          system: systemId,
          kind: 'city',
          surface: true,
          x: world.pos[0],
          y: world.pos[1],
          z: world.pos[2],
          toSystem: null,
          socpak: norm(socpak),
          rot: world.rot,
        })
      }
      return
    }
    const kind = classifySystemChild(socpak)
    if (!kind) return
    const base = basename(socpak)
    const fromRecord = recordName(starmap, world.attr)
    let name = null
    let aliases = []
    let toSystem = null
    if (kind === 'planet' || kind === 'moon') {
      const key = bodyKey(base)
      name = (key && locName(localization, key)) || fromRecord
      const tail = entityTail(world.attr.entityName)
      if (name && tail && tail.toLowerCase() !== name.toLowerCase() && !/^(stanton|pyro|nyx)\d/i.test(tail)) aliases = [tail]
      if (name === 'Arial') pushAlias(aliases, 'Ariel', name)
    } else if (kind === 'gateway') {
      const record = matchGateway(socpak, gateways)
      if (record && record.from === systemId) {
        name = record.name
        toSystem = record.to
      } else {
        const dest = base.replace(/^jumppoint_[^_]+_/i, '').replace(/\.socpak$/i, '')
        name = `${dest.charAt(0).toUpperCase()}${dest.slice(1)} Gateway`
        toSystem = dest.toLowerCase()
      }
    } else if (kind === 'station') {
      const entity = world.attr.entityName || ''
      const lagrange = entity.match(/_L([1-5])$/i)
      const body = entity.match(/(Stanton\d[a-z]?|Pyro\d[a-z]?|Nyx\d[a-z]?)/i)
      let short = null
      if (lagrange && body) {
        const key = `${body[1][0].toUpperCase()}${body[1].slice(1)}_L${lagrange[1]}`
        short = locName(localization, key)
        name = upgradeLagrange(localization, short) || short
      }
      if (!name && parentKey && norm(socpak).includes('leo')) {
        name = transferName(localization, parentKey, socpak)
      }
      if (fromRecord && !isShortCode(fromRecord) && !isInternalName(fromRecord)) {
        if (name && name.toLowerCase() !== fromRecord.toLowerCase()) pushAlias(aliases, name, fromRecord)
        if (short) pushAlias(aliases, short, fromRecord)
        name = fromRecord
      }
      if (!name && fromRecord && !isInternalName(fromRecord)) name = fromRecord
      if (!name) {
        const tail = entityTail(entity).replace(/([a-z])([A-Z])/g, '$1 $2')
        name = findSuffixName(localization, tail.replace(/\s+/g, '')) || null
      }
      const fileRest = base.match(/pyro(\d)_l([1-5])\.socpak$/i)
      if (fileRest) {
        const proper = restStops.get(`p${fileRest[1]}_l${fileRest[2]}`)
        if (proper && !isShortCode(proper) && !isInternalName(proper)) {
          pushAlias(aliases, name, proper)
          pushAlias(aliases, short, proper)
          name = proper
        }
      }
      for (const alias of codeAliases(name)) pushAlias(aliases, alias, name)
      if (short) pushAlias(aliases, short, name)
      for (const alias of codeAliases(short)) pushAlias(aliases, alias, name)
    }
    if (!name || isInternalName(name) || /[_@]/.test(name)) return
    addPoint(points, {
      name,
      aliases,
      system: systemId,
      kind,
      surface: kind === 'planet' || kind === 'moon',
      x: world.pos[0],
      y: world.pos[1],
      z: world.pos[2],
      toSystem,
      socpak: norm(socpak),
      rot: world.rot,
    })
  })
}

function interiorPoints(socpakFile, parent, localization, starmap, points) {
  const member = `${basename(socpakFile, '.socpak')}.xml`
  const xml = readSocpakXml(socpakFile, member)
  if (!xml) return
  const parentKey = bodyKey(`${basename(socpakFile).toLowerCase()}`)
  walkChildren(xml, (world) => {
    const socpak = world.attr.name || ''
    const path = norm(socpak)
    if (path.includes('commarray') || path.includes('cluster') || path.includes('hotel') || path.includes('siege') || path.includes('racetrack') || path.includes('_bg')) return
    const file = path.split('/').pop()
    const fromRecord = recordName(starmap, world.attr)
    let kind = null
    if (path.includes('/station/') && (path.includes('leo') || path.includes('reststop') || path.includes('grim') || path.includes('hex'))) {
      kind = 'station'
    } else if (path.includes('/flagship/') && CITY_FILES.some(([pattern]) => pattern.test(file))) {
      kind = 'city'
    }
    if (!kind) return
    const rotated = quatRot(parent.rot, world.pos)
    const pos = [parent.x + rotated[0], parent.y + rotated[1], parent.z + rotated[2]]
    let name = null
    if (kind === 'city') name = cityName(socpak, localization, fromRecord)
    if (kind === 'station' && parentKey && path.includes('leo')) name = transferName(localization, parentKey, socpak)
      if (!name && fromRecord && !isInternalName(fromRecord)) name = fromRecord
    if (!name) return
    if (points.some((row) => row.system === parent.system && row.name.toLowerCase() === name.toLowerCase())) return
    addPoint(points, {
      name,
      aliases: [],
      system: parent.system,
      kind,
      surface: kind === 'city',
      x: pos[0],
      y: pos[1],
      z: pos[2],
      toSystem: null,
      socpak: path,
      rot: [1, 0, 0, 0],
    })
  })
}

export function parseNavSystems({ extractedRoot, localization }) {
  const socpaks = systemSocpaks(extractedRoot)
  const bySystem = new Map()
  for (const path of socpaks) {
    const systemId = norm(path).match(/\/system\/([^/]+)\//)[1]
    if (!bySystem.has(systemId)) bySystem.set(systemId, [])
    bySystem.get(systemId).push(path)
  }
  const gateways = loadGatewayRecords(extractedRoot, localization)
  const starmap = loadStarmapNames(extractedRoot, localization)
  const restStops = loadRestStopNames(extractedRoot, localization)
  const points = []
  for (const [systemId, files] of bySystem) {
    const systemFile = files.find((path) => /system\.socpak$/i.test(path))
    if (!systemFile) continue
    const xml = readSocpakXml(systemFile, `${basename(systemFile, '.socpak')}.xml`)
    if (!xml) continue
    childPoints(xml, systemId, localization, gateways, starmap, restStops, points, null)
  }
  const bodies = points.filter((point) => point.kind === 'planet' || point.kind === 'moon')
  for (const body of bodies) {
    const file = socpaks.find((path) => norm(path).endsWith(body.socpak.split('/').pop()))
    if (!file) continue
    interiorPoints(file, body, localization, starmap, points)
  }
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const point = points[i]
    const twin = points.find((row, index) => index < i && row.system === point.system && row.name.toLowerCase() === point.name.toLowerCase())
    if (!twin) continue
    const apart = Math.hypot(twin.x - point.x, twin.y - point.y, twin.z - point.z)
    if (apart < 100000) points.splice(i, 1)
  }
  const systems = [...bySystem.keys()]
    .filter((id) => points.some((point) => point.system === id))
    .map((id) => ({
      id,
      name: locName(localization, `${id[0].toUpperCase()}${id.slice(1)}Star`) || locName(localization, id[0].toUpperCase() + id.slice(1)) || id[0].toUpperCase() + id.slice(1),
    }))
  const systemIds = new Set(systems.map((row) => row.id))
  const links = []
  for (const depart of points) {
    if (depart.kind !== 'gateway' || !depart.toSystem || !systemIds.has(depart.toSystem)) continue
    const arrive = points.find((point) => point.kind === 'gateway' && point.system === depart.toSystem && point.toSystem === depart.system)
    if (!arrive) continue
    if (links.some((link) => link.from === depart.system && link.to === depart.toSystem)) continue
    links.push({ from: depart.system, to: depart.toSystem, depart: depart.id, arrive: arrive.id })
  }
  const publicPoints = points
    .filter((point) => point.kind !== 'gateway' || point.name)
    .map((point) => ({
      id: point.id,
      name: point.name,
      aliases: point.aliases,
      system: point.system,
      kind: point.kind,
      surface: point.surface,
      x: Math.round(point.x),
      y: Math.round(point.y),
      z: Math.round(point.z),
    }))
  return { systems, points: publicPoints, links }
}

function loadLocalization(extractedRoot) {
  const ini = join(extractedRoot, 'Data', 'Localization', 'english', 'global.ini')
  if (!existsSync(ini)) return {}
  const localization = {}
  for (const line of readFileSync(ini, 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    localization[key.split(',')[0]] = line.slice(eq + 1).trim()
  }
  return localization
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const nav = parseNavSystems({ extractedRoot: join(ROOT, 'extracted-data'), localization: loadLocalization(join(ROOT, 'extracted-data')) })
  const out = join(ROOT, 'src', 'data', 'nav-systems.json')
  writeFileSync(out, `${JSON.stringify(nav, null, 2)}\n`, 'utf8')
  console.log(`systems ${nav.systems.map((row) => row.name).join(', ')}`)
  console.log(`points ${nav.points.length}`)
  console.log(`links ${nav.links.map((link) => `${link.from}->${link.to}`).join(', ')}`)
  console.log(`wrote ${out}`)
}
