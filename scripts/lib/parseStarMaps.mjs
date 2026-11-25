/**
 * Bake per-system star maps from PU system containers + starmap records.
 * Writes src/data/star-maps/index.json and src/data/star-maps/<systemId>.json.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
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

function locText(localization, key, max) {
  if (!key) return null
  const raw = localization[key] || localization[key.split(',')[0]]
  if (!raw) return null
  const text = String(raw).replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text || text.startsWith('@') || text.length > max) return null
  return text
}

function locName(localization, key) {
  return locText(localization, key, 120)
}

/**
 * Body prose without the "Potential Ship Mineables / Harvestables / Creatures"
 * lists. The location card shows those from mining data instead.
 */
export function locProse(localization, key, max = 900) {
  if (!key) return null
  const raw = localization[key] || localization[key.split(',')[0]]
  if (!raw) return null
  const cut = String(raw).split(/(?:\\n|\n)\s*Potential [A-Za-z ]+:?/)[0]
  const text = cut.replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text || text.startsWith('@') || /UNINITIALIZED/i.test(text)) return null
  return text.length > max ? `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : text
}

/** Names the body description marks "(Caves)" or "(Caves only)" in its Potential lists. */
export function caveOnlyNames(localization, key) {
  const raw = key ? localization[key] || localization[key.split(',')[0]] : null
  if (!raw) return []
  const out = new Set()
  for (const line of String(raw).split(/\\n|\n/)) {
    const m = line.trim().match(/^(.+?)\s*\(caves?(?: only)?\)\s*$/i)
    if (m) out.add(m[1].trim())
  }
  return [...out]
}

/** `file://./../../libs/foundry/records/x.json` and absolute paths both key as `libs/foundry/records/x.json`. */
function recordKey(path) {
  const n = norm(String(path || ''))
  const at = n.indexOf('libs/foundry/records/')
  return at < 0 ? null : n.slice(at)
}

function loadAmenityTypes(extractedRoot, localization) {
  const path = join(extractedRoot, 'libs', 'foundry', 'records', 'starmapamenitytypes', 'starmapamenitytypes.json')
  const out = new Map()
  if (!existsSync(path)) return out
  try {
    const doc = JSON.parse(readFileSync(path, 'utf8'))
    for (const row of doc?._RecordValue_?.amenityTypes || []) {
      const id = String(row?._RecordId_ || '').toLowerCase()
      const label = locName(localization, String(row?.displayName || '').replace(/^@/, '')) || row?.name
      if (id && label && !/^event$/i.test(label)) out.set(id, label)
    }
  } catch {
    // amenities optional
  }
  return out
}

const AMENITY_ORDER = [
  'Hospital', 'Clinic',
  'Docking', 'Landing Pad (S)', 'Landing Pad (M)', 'Landing Pad (L)', 'Landing Pad (XL)',
  'Hangar (S)', 'Hangar (M)', 'Hangar (L)', 'Hangar (XL)', 'Garage', 'Vehicle Services',
  'Refinery', 'Commodity Trading', 'Loading Dock',
  'Buy Weapons', 'Buy Ship Items/Weapons', 'Buy Armor', 'Buy Clothing',
  'Buy Vehicles', 'Rent Vehicles', 'Buy/Rent Vehicles', 'Food Court',
]

function sortAmenities(list) {
  const rank = (label) => {
    const i = AMENITY_ORDER.indexOf(label)
    return i < 0 ? AMENITY_ORDER.length : i
  }
  return [...new Set(list)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

const GAS_NAMES = { HydrogenDioxide: 'Water Vapour', FineParticulateMatter: 'Fine Particulates' }

function loadRecordsById(dir) {
  const files = []
  walkFiles(dir, files)
  const out = new Map()
  for (const path of files) {
    if (!path.toLowerCase().endsWith('.json')) continue
    try {
      const doc = JSON.parse(readFileSync(path, 'utf8'))
      const id = String(doc?._RecordId_ || '').toLowerCase()
      if (id) out.set(id, doc._RecordValue_ || {})
      const key = recordKey(path)
      if (key) out.set(key, doc._RecordValue_ || {})
    } catch {
      // skip unreadable record
    }
  }
  return out
}

/** Atmosphere state + gas mix records the planet containers point at. */
function loadEnvironmentRecords(extractedRoot, localization) {
  const room = join(extractedRoot, 'libs', 'foundry', 'records', 'roomsystem')
  const gases = new Map()
  const gasFiles = []
  walkFiles(join(room, 'gasparams'), gasFiles)
  for (const path of gasFiles) {
    try {
      const value = JSON.parse(readFileSync(path, 'utf8'))?._RecordValue_ || {}
      const symKey = String(value.chemicalSymbol || '').replace(/^@/, '')
      const stem = symKey.replace(/^ui_chemsymbol_/i, '')
      if (!stem) continue
      const symbol = String(localization[symKey] || '').replace(/<[^>]+>/g, '').trim() || null
      const name = GAS_NAMES[stem] || stem.replace(/([a-z])([A-Z])/g, '$1 $2')
      gases.set(recordKey(path), { name, symbol })
    } catch {
      // skip
    }
  }
  return {
    states: loadRecordsById(join(room, 'atmospherestatetemplates')),
    mixes: loadRecordsById(join(room, 'gascompositiontemplates')),
    gases,
  }
}

const UUID_RE = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})'

/**
 * Surface conditions for a planet or moon container. Bodies whose container
 * names no atmosphere state and no gas mix are placeholders and get nothing.
 */
function bodyEnvironment(socpakPath, env) {
  const base = basename(socpakPath, '.socpak')
  const ale = readSocpakBytes(socpakPath, `${base}.ale`)?.toString('latin1') || ''
  const pivot = readSocpakBytes(socpakPath, `${base}/pivot.entxml`)?.toString('latin1') || ''
  const stateId = new RegExp(`AtmosphereStateRef\\W+stateTemplate\\W+${UUID_RE}`).exec(pivot)?.[1]
  const mixId = new RegExp(`compositionRecord\\W+${UUID_RE}`).exec(pivot)?.[1]
  const system = norm(socpakPath).match(/\/system\/([^/]+)\//)?.[1]
  const named = (dir) => `libs/foundry/records/roomsystem/${dir}/system/${system}/${base.toLowerCase()}.json`
  const state = (stateId && env.states.get(stateId)?.state) || env.states.get(named('atmospherestatetemplates'))?.state || null
  const mix = (mixId && env.mixes.get(mixId)?.composition) || env.mixes.get(named('gascompositiontemplates'))?.composition || null
  if (!state && !mix) return null
  const out = {}
  const g = Number(/"fGravity":\s*(-?[0-9.]+)/.exec(ale)?.[1])
  if (Number.isFinite(g) && g !== 0) out.gravityG = Math.round((Math.abs(g) / 9.81) * 100) / 100
  const day = Number(/"fRotationSpeed":\s*(-?[0-9.]+)/.exec(ale)?.[1])
  if (Number.isFinite(day) && day > 0) out.dayHours = Math.round(day * 100) / 100
  if (state) {
    if (typeof state.temperature === 'number') out.temperatureC = Math.round(state.temperature - 273.15)
    if (typeof state.pressure === 'number') out.pressureBar = Math.round(state.pressure * 100) / 100
    if (typeof state.humidity === 'number') out.humidityPct = Math.round(state.humidity * 100)
  }
  const byGas = new Map()
  for (const row of mix?.gases || []) {
    const gas = env.gases.get(recordKey(row?.gasParams))
    if (!gas || !(Number(row?.parts) > 0)) continue
    const prev = byGas.get(gas.name)
    byGas.set(gas.name, { ...gas, parts: (prev?.parts || 0) + Number(row.parts) })
  }
  const parts = [...byGas.values()]
  const total = parts.reduce((sum, row) => sum + row.parts, 0)
  if (total > 0 && out.pressureBar !== 0) {
    out.atmosphere = parts
      .map((row) => ({ gas: row.name, symbol: row.symbol, percent: Math.round((row.parts / total) * 1000) / 10 }))
      .sort((a, b) => b.percent - a.percent)
  }
  return Object.keys(out).length ? out : null
}

function jurisdictionName(extractedRoot, localization, ref, cache) {
  const key = recordKey(ref)
  if (!key) return null
  if (cache.has(key)) return cache.get(key)
  let name = null
  const abs = join(extractedRoot, ...key.split('/'))
  if (existsSync(abs)) {
    try {
      const doc = JSON.parse(readFileSync(abs, 'utf8'))
      name = locName(localization, String(doc?._RecordValue_?.name || '').replace(/^@/, ''))
    } catch {
      name = null
    }
  }
  cache.set(key, name)
  return name
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

function readSocpakBytes(socpakPath, member) {
  const result = spawnSync(
    'python',
    [
      '-c',
      'import sys,zipfile; from pathlib import Path\n'
        + 'p=Path(sys.argv[1]); want=sys.argv[2].replace("\\\\","/").lower()\n'
        + 'with zipfile.ZipFile(p) as z:\n'
        + '  for info in z.infolist():\n'
        + '    name=info.filename.replace("\\\\","/")\n'
        + '    if name.lower()!=want and not name.lower().endswith("/"+want): continue\n'
        + '    info.orig_filename=info.orig_filename.replace("/","\\\\")\n'
        + '    sys.stdout.buffer.write(z.read(info)); raise SystemExit(0)\n'
        + 'raise SystemExit(1)\n',
      socpakPath,
      member,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  )
  if (result.status !== 0) return null
  return result.stdout
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
    // Keep the star's own spin out of the child walk. Nav records already include
    // it, and stations are named against the unspun containers. The whole map is
    // turned by that spin once, after names are settled, so planets, stations,
    // and jump points stay together. Stanton and Nyx stars are identity.
    const basis = /star\.socpak$/i.test(String(parent.attr?.name || '')) ? [1, 0, 0, 0] : parent.rot
    const rotated = quatRot(basis, local)
    const world = {
      pos: [parent.pos[0] + rotated[0], parent.pos[1] + rotated[1], parent.pos[2] + rotated[2]],
      rot: quatMul(basis, localRot),
      attr,
    }
    visit(world)
    if (match[2] !== '/') stack.push(world)
  }
}

function slug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function systemSocpaks(extractedRoot) {
  const root = join(extractedRoot, 'Data', 'ObjectContainers', 'PU', 'system')
  const files = []
  walkFiles(root, files)
  return files.filter((path) => /\/system\/[^/]+\/[^/]+system\.socpak$/i.test(norm(path)))
}

function loadStarmapRecords(extractedRoot, localization) {
  const dir = join(extractedRoot, 'libs', 'foundry', 'records', 'starmap')
  const files = []
  walkFiles(dir, files)
  const amenityTypes = loadAmenityTypes(extractedRoot, localization)
  const jurisdictions = new Map()
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
    if (!id) continue
    const value = doc?._RecordValue_ || {}
    const nameKey = String(value.name || '').replace(/^@/, '')
    const descKey = String(value.description || '').replace(/^@/, '')
    const name = locName(localization, nameKey)
    const description = locProse(localization, descKey)
    const navIcon = String(value.navIcon || '')
    const size = typeof value.size === 'number' ? value.size : null
    const rings = Array.isArray(value.asteroidRings) ? value.asteroidRings : []
    const file = norm(path)
    const amenities = value.hideInStarmap
      ? []
      : sortAmenities(
        (Array.isArray(value.amenities) ? value.amenities : [])
          .map((row) => amenityTypes.get(String(row?._RecordId_ || '').toLowerCase()))
          .filter(Boolean),
      )
    byId.set(id, {
      id,
      name,
      description,
      navIcon,
      size,
      rings,
      file,
      key: recordKey(path),
      parentKey: recordKey(value.parent),
      amenities,
      caveOnly: caveOnlyNames(localization, descKey),
      jurisdiction: value.jurisdiction ? jurisdictionName(extractedRoot, localization, value.jurisdiction, jurisdictions) : null,
      recordName: String(doc?._RecordName_ || ''),
    })
  }
  return byId
}

function loadGatewayRecords(extractedRoot, localization) {
  const dir = join(extractedRoot, 'libs', 'foundry', 'records', 'starmap', 'pu')
  const files = []
  walkFiles(dir, files)
  const out = []
  for (const path of files) {
    if (!path.toLowerCase().endsWith('.json')) continue
    const base = basename(path).toLowerCase()
    if (!base.startsWith('rr_jp_') && !base.startsWith('jumppoint')) continue
    let doc
    try {
      doc = JSON.parse(readFileSync(path, 'utf8'))
    } catch {
      continue
    }
    const value = doc?._RecordValue_ || {}
    const name = locName(localization, String(value.name || '').replace(/^@/, ''))
    const id = String(doc?._RecordId_ || '').toLowerCase()
    const stem = base.replace(/\.json$/, '')
    const m = /(?:rr_jp_|jumppoint_)([a-z]+)([a-z]+)/i.exec(stem)
    if (!m) continue
    out.push({ id, name, from: m[1].toLowerCase(), to: m[2].toLowerCase(), file: norm(path) })
  }
  return out
}

/** In-plane outer edge of a ring background container (`<ObjectContainer maxBounds="x,y,z">`). */
function ringBgOuterRadiusM(socpakPath) {
  if (!existsSync(socpakPath)) return null
  const xml = readSocpakXml(socpakPath, `${basename(socpakPath, '.socpak')}.xml`)
  const m = xml && /maxBounds="([-0-9.eE+]+),([-0-9.eE+]+),/.exec(xml)
  if (!m) return null
  const r = Math.max(Math.abs(Number(m[1])), Math.abs(Number(m[2])))
  return Number.isFinite(r) && r > 0 ? r : null
}

function ringRadiiFromSoc(socpakPath) {
  const bytes = readSocpakBytes(socpakPath, `${basename(socpakPath, '.socpak')}.soc`)
  if (!bytes) return null
  const text = bytes.toString('latin1')
  const inner = /innerRadiusKm\x00([0-9.eE+-]+)/.exec(text) || /innerRadiusKm[^0-9]*([0-9.eE+-]+)/.exec(text)
  const outer = /outerRadiusKm\x00([0-9.eE+-]+)/.exec(text) || /outerRadiusKm[^0-9]*([0-9.eE+-]+)/.exec(text)
  if (!inner || !outer) return null
  const innerKm = Number(inner[1])
  const outerKm = Number(outer[1])
  if (!Number.isFinite(innerKm) || !Number.isFinite(outerKm)) return null
  return { innerRadiusM: innerKm * 1000, outerRadiusM: outerKm * 1000 }
}

/** Asteroid ring placed inside a planet or moon container (Yela, Pyro VI). */
function bodyRingFromSoc(socpakPath) {
  const bytes = readSocpakBytes(socpakPath, `${basename(socpakPath, '.socpak')}.soc`)
  if (!bytes) return null
  const text = bytes.toString('latin1')
  const at = text.indexOf('SAsteroidRingComponentParams')
  if (at < 0) return null
  const block = text.slice(at, at + 2000)
  const inner = /innerRadiusKm[^0-9]*([0-9.eE+-]+)/.exec(block)
  const outer = /outerRadiusKm[^0-9]*([0-9.eE+-]+)/.exec(block)
  const innerKm = Number(inner?.[1])
  const outerKm = Number(outer?.[1])
  if (!(innerKm > 0) || !(outerKm > innerKm)) return null
  return { innerRadiusM: innerKm * 1000, outerRadiusM: outerKm * 1000 }
}

function classifyMarker({ path, record, name, entity }) {
  const p = path
  const n = String(name || '').toLowerCase()
  const e = String(entity || '').toLowerCase()
  const rec = String(record?.recordName || '').toLowerCase()
  const file = String(record?.file || '')
  const nav = String(record?.navIcon || '')
  const blob = `${p} ${file} ${rec} ${n} ${e}`

  if (p.endsWith('star.socpak') || nav === 'Star') return 'star'
  if (/jumppoints\/jumppoint_/.test(p) || /jumppoint/.test(rec) || nav === 'JumpPoint') return 'jump_point'
  if (/thecollector|collector_station|wikelo/.test(blob)) return 'wikelo'
  if (/commarray|comm_array|_comm\d/.test(blob) || /comm array/.test(n)) return 'comm_array'
  if (/executive/.test(blob)) return 'executive_hangar'
  if (/outpost_olp|_olp_|orbital.?laser|\bolp\b/.test(blob)) return 'olp'
  if (/outpost_paf|_paf_|people.?s alliance|\bpaf\b/.test(blob)) return 'pa_station'
  if (/outlaw/.test(blob)) return 'outlaw'
  if (/rckcrk|rockcracker|\bbrk-|breaker station|qv breaker|qv extraction|_wtn_|\bqv /.test(blob) || /^brk-\d+/i.test(name || '')) {
    return 'qv'
  }
  // Only the ring container itself is a belt — not stations under the ring folder.
  if (
    /aaronhalo\.socpak$/.test(p)
    || /(?:^|\/)(glaciemring|keegerbelt)\.socpak$/.test(p)
    || (/asteroidring/i.test(e) && !/station|base|brk|qv/.test(blob))
  ) {
    return 'belt'
  }
  if (/\brab-/.test(n) || /asteroidcluster_\d+base_pyro_encounter|asteroidclusterbase_pyro_encounter/.test(blob)) {
    return 'rab'
  }
  // RMB / mining bases: Pyro wandering mines only (Stanton private mines stay off the map).
  if (/\brmb-/.test(n) || (/ab_mine_pyro|asteroidcluster_miningbase_pyro/.test(blob))) return 'rmb'
  if (/\/lagrangepoints\//.test(p) || /_l[1-5]\.socpak$/.test(p)) return 'station'
  if (/^(stanton|pyro|nyx)\d\.socpak$/.test(basename(p))) return 'planet'
  if (/^(stanton|pyro|nyx)\d[a-z]\.socpak$/.test(basename(p))) return 'moon'
  if (nav === 'Planet') return 'planet'
  if (nav === 'Moon') return 'moon'
  if (nav === 'Station' || /\/station\//.test(p) || /reststop|leo|grim|hex|gaslight|patch city|endgame|rats nest|ruin station/.test(blob)) {
    return 'station'
  }
  if (/asteroidcluster/.test(p) && /cluster [a-z0-9-]+/i.test(name || '')) {
    return 'cluster'
  }
  return null
}

function isSurfaceNoise(path, kind) {
  if (!path) return false
  if (/\/flagship\/|lorville|orison_all|a18_city|newbab_all|levski/.test(path)) return true
  if (/iasiplatform|hospital|distribution|fob_abandoned|privatemining|derelict|colonialism|garage|racetrack|hotel|siege|_bg|clinic/.test(path)) {
    return true
  }
  if (kind === 'city') return true
  return false
}

function bodyKey(base) {
  const match = base.match(/^(stanton|pyro|nyx)(\d[a-z]?)\.socpak$/i)
  if (!match) return null
  return match[1][0].toUpperCase() + match[1].slice(1).toLowerCase() + match[2].toLowerCase()
}

/**
 * Starmap amenities land on the marker for that record. A landing zone, city or
 * outpost that is not on the map rolls up to the nearest ancestor that is
 * (Lorville onto Hurston), listed under its own place name.
 */
function attachServices(markers, markerByRecord, starmap, systemId) {
  const byKey = new Map()
  for (const row of starmap.values()) if (row.key) byKey.set(row.key, row)
  const orb = (m) => m.kind === 'planet' || m.kind === 'moon' || m.kind === 'star'
  const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase()
  const ancestor = (row) => {
    let cur = row
    for (let depth = 0; depth < 8 && cur?.parentKey; depth++) {
      cur = byKey.get(cur.parentKey)
      if (!cur) return null
      const hit = markerByRecord.get(cur.id)
      if (hit) return hit
    }
    return null
  }

  for (const [recordId, marker] of markerByRecord) {
    const row = starmap.get(recordId)
    if (row?.jurisdiction) marker.jurisdiction = row.jurisdiction
  }

  const gatewayJump = (name) => {
    const dest = String(name || '').match(/^(\w+) Gateway$/i)?.[1]?.toLowerCase()
    if (!dest) return null
    return markers.find((m) => m.kind === 'jump_point' && (
      m.toSystem === dest
      || (dest === 'nyx' && m.toSystem === 'magnus')
      || (dest === 'stanton' && m.toSystem === 'castra')
    )) || null
  }

  for (const row of starmap.values()) {
    if (!row.amenities?.length || !row.name || /UNINITIALIZED/i.test(row.name)) continue
    let own = markerByRecord.get(row.id)
    let up = own ? null : ancestor(row)
    if (up?.kind === 'star') {
      own = gatewayJump(row.name)
      up = null
      if (!own) continue
    }
    if (!own && (up || row.file.includes(`/system/${systemId}/`))) {
      own = markers.find((m) => !orb(m) && [m.name, ...(m.aliases || [])].some((label) => same(label, row.name)))
    }
    if (own) {
      own.amenities = sortAmenities([...(own.amenities || []), ...row.amenities])
      continue
    }
    if (!up) continue
    const services = up.services || (up.services = [])
    const place = services.find((s) => same(s.place, row.name))
    if (place) place.amenities = sortAmenities([...place.amenities, ...row.amenities])
    else services.push({ place: row.name, amenities: row.amenities })
  }
  for (const marker of markers) {
    if (marker.services) marker.services.sort((a, b) => a.place.localeCompare(b.place))
  }
}

function addMarker(markers, marker) {
  const idBase = `${marker.systemId}:${slug(marker.name)}`
  let id = idBase
  let n = 2
  while (markers.some((row) => row.id === id)) id = `${idBase}-${n++}`
  markers.push({ ...marker, id })
  return id
}

function navFrameShift(markers, navPoints) {
  const pairs = []
  for (const point of navPoints) {
    if (point.kind !== 'planet' && point.kind !== 'moon') continue
    const marker = markers.find((row) => (
      (row.kind === 'planet' || row.kind === 'moon')
      && row.name.toLowerCase() === String(point.name).toLowerCase()
    ))
    if (!marker) continue
    if (Math.hypot(point.x, point.y) < 1e6 || Math.hypot(marker.x, marker.y) < 1e6) continue
    pairs.push({ point, marker })
  }
  if (pairs.length === 0) return (point) => point
  const delta = Math.atan2(pairs[0].marker.y, pairs[0].marker.x) - Math.atan2(pairs[0].point.y, pairs[0].point.x)
  const turn = (x, y) => ({
    x: x * Math.cos(delta) - y * Math.sin(delta),
    y: x * Math.sin(delta) + y * Math.cos(delta),
  })
  const aligned = pairs.every(({ point, marker }) => {
    const moved = turn(point.x, point.y)
    return Math.hypot(moved.x - marker.x, moved.y - marker.y) < 1e7
  })
  if (!aligned) return (point) => point
  return (point) => {
    const moved = turn(point.x, point.y)
    return { ...point, x: moved.x, y: moved.y }
  }
}

function layoutOverview(systems, links) {
  // Place systems on a circle using jump-graph adjacency. Fully connected = even triangle.
  const ids = systems.map((s) => s.id)
  if (ids.length === 0) return []
  if (ids.length === 1) return [{ id: ids[0], x: 0, y: 0, z: 0 }]
  const adj = new Map(ids.map((id) => [id, new Set()]))
  for (const link of links) {
    if (!adj.has(link.from) || !adj.has(link.to)) continue
    adj.get(link.from).add(link.to)
    adj.get(link.to).add(link.from)
  }
  const radius = 120
  return ids.map((id, index) => {
    const angle = (Math.PI * 2 * index) / ids.length - Math.PI / 2
    return {
      id,
      x: Math.cos(angle) * radius,
      y: 0,
      z: Math.sin(angle) * radius,
    }
  })
}

export function parseStarMaps({ extractedRoot, localization }) {
  const systemFiles = systemSocpaks(extractedRoot)
  const bySystem = new Map()
  for (const path of systemFiles) {
    const systemId = norm(path).match(/\/system\/([^/]+)\//)?.[1]
    if (!systemId || systemId === 'demo' || systemId === 'ellis') continue
    bySystem.set(systemId, path)
  }

  const starmap = loadStarmapRecords(extractedRoot, localization)
  const gateways = loadGatewayRecords(extractedRoot, localization)
  const envRecords = loadEnvironmentRecords(extractedRoot, localization)
  const systemsOut = []
  const maps = []

  for (const [systemId, systemFile] of bySystem) {
    const xml = readSocpakXml(systemFile, `${basename(systemFile, '.socpak')}.xml`)
    if (!xml) continue
    const markers = []
    let starSpin = [1, 0, 0, 0]
    const systemRoot = dirname(systemFile)
    const ringSegmentDistances = { glaciemring: [], keegerbelt: [] }
    const bodyRings = []
    const markerByRecord = new Map()

    walkChildren(xml, (world) => {
      const socpak = world.attr.name || ''
      const path = norm(socpak)
      if (!path) return
      const ringSegment = path.match(/\/(glaciemring|keegerbelt)\/[^/]*segment[^/]*\.socpak$/)
      if (ringSegment) ringSegmentDistances[ringSegment[1]].push(Math.hypot(world.pos[0], world.pos[1]))
      if (path.endsWith('skybox.socpak') || path.endsWith('system.socpak')) return
      const recordId = String(world.attr.starMapRecord || '').toLowerCase()
      const record = recordId ? starmap.get(recordId) : null
      let name = record?.name || null
      const base = basename(path)
      const key = bodyKey(base)
      if (!name && key) name = locName(localization, key)
      if (!name) {
        const entity = String(world.attr.entityName || '')
        const lagrange = entity.match(/_L([1-5])$/i)
        const body = entity.match(/(Stanton\d[a-z]?|Pyro\d[a-z]?|Nyx\d[a-z]?)/i)
        if (lagrange && body) {
          const short = locName(localization, `${body[1][0].toUpperCase()}${body[1].slice(1)}_L${lagrange[1]}`)
          name = short
        }
      }
      if (!name && /aaronhalo/.test(path)) name = 'Aaron Halo'
      if (!name && /glaciemring/.test(path) && !/segment/.test(path)) name = 'Glaciem Ring'
      if (!name && /keegerbelt/.test(path) && !/segment/.test(path)) name = 'Keeger Belt'
      let kind = classifyMarker({
        path,
        record,
        name,
        entity: world.attr.entityName,
      })
      if (!kind && /jumppoints\/jumppoint_/.test(path)) kind = 'jump_point'
      if (!kind && /star\.socpak$/.test(path)) kind = 'star'
      if (kind === 'star') starSpin = world.rot
      if (!kind && (/transitpoint/i.test(String(world.attr.entityName || '')) || /TransitPoint/.test(record?.recordName || ''))) {
        kind = 'transit'
      }
      const social = String(world.attr.entityName || '').match(/segment_social_(\d+)/i)
      if (social) {
        const socialName = locName(localization, `Nyx_SocialStation_${social[1]}`)
        if (socialName) {
          kind = 'pa_station'
          name = socialName
        }
      }
      if (!kind) return
      if (isSurfaceNoise(path, kind)) return
      if (/\/_bg\.socpak$|segment_mission|segment_levski/.test(path)) return
      if (/segment_social/.test(path) && kind !== 'pa_station') return
      // Nyx planets are placed via dummyplanet containers with real starmap records.
      // The Glaciem transit points use that same container and stay.
      if (
        /dummyplanet/.test(path)
        && kind !== 'transit'
        && !(record && (record.navIcon === 'Planet' || record.navIcon === 'Moon'))
      ) return
      // Path wins for outlaw / rockcracker / breaker segments even when the display name is generic.
      if (/outlaw/.test(path)) {
        kind = 'outlaw'
        name = name || 'Outlaw Station'
      } else if (/rckcrk/.test(path)) {
        kind = 'qv'
        name = name || 'Rockcracker Site'
      } else if (/_wtn_/.test(path)) {
        kind = 'qv'
        name = name || 'QV Breaker Station'
      }
      if (!name || /[_@]/.test(name) || name.startsWith('LOC_')) return
      // Only the numbered abandoned breakers are on the Nyx map. Extraction
      // sites, generic breakers and rockcrackers are not stored. Outlaw
      // stations are mission spawns and are not on the Nyx map either.
      if (kind === 'qv' && !/BRK-\d+/.test(name)) return
      if (kind === 'outlaw' && systemId === 'nyx') return
      let toSystem = null
      let toMarkerName = null
      if (kind === 'jump_point') {
        const gw = gateways.find((g) => g.id && g.id === recordId)
          || gateways.find((g) => g.from === systemId && path.includes(g.to))
        if (gw && gw.from === systemId) {
          toSystem = gw.to
          toMarkerName = gw.name || `${gw.to[0].toUpperCase()}${gw.to.slice(1)} Gateway`
          if (!name) name = `${gw.to[0].toUpperCase()}${gw.to.slice(1)} Gateway`
        } else {
          const dest = base.replace(/^jumppoint_[^_]+_/i, '').replace(/\.socpak$/i, '')
          toSystem = dest.toLowerCase()
          name = name || `${dest.charAt(0).toUpperCase()}${dest.slice(1)} Gateway`
          toMarkerName = name
        }
      }

      let radiusM = null
      let innerRadiusM = null
      let outerRadiusM = null
      if (kind === 'planet' || kind === 'moon' || kind === 'star') {
        radiusM = typeof record?.size === 'number' ? record.size : null
      }
      let environment = null
      if (kind === 'planet' || kind === 'moon') {
        const abs = path.startsWith('data/')
          ? join(extractedRoot, ...path.split('/'))
          : join(systemRoot, basename(path))
        const ring = existsSync(abs) ? bodyRingFromSoc(abs) : null
        if (ring) bodyRings.push({ parentName: name, pos: world.pos, ...ring })
        if (existsSync(abs)) environment = bodyEnvironment(abs, envRecords)
      }
      if (kind === 'belt') {
        const abs = path.startsWith('data/')
          ? join(extractedRoot, ...path.split('/'))
          : join(systemRoot, basename(path))
        const fromSoc = existsSync(abs) ? ringRadiiFromSoc(abs) : null
        if (fromSoc) {
          innerRadiusM = fromSoc.innerRadiusM
          outerRadiusM = fromSoc.outerRadiusM
        } else if (record?.rings?.[0]) {
          // Holo radii are fallback only when the placed ring is missing.
          innerRadiusM = record.rings[0].innerRadius
          outerRadiusM = record.rings[0].outerRadius
        }
      }

      const notes = []
      if (kind === 'qv' && /rockcracker/i.test(path + (record?.recordName || '') + name)) {
        notes.push('Moves with the belt. Access is paid before you can QT to it.')
      }

      addMarker(markers, {
        systemId,
        name,
        aliases: [],
        kind,
        description: record?.description || null,
        x: Math.round(world.pos[0]),
        y: Math.round(world.pos[1]),
        z: Math.round(world.pos[2]),
        radiusM,
        innerRadiusM,
        outerRadiusM,
        toSystem,
        toMarkerName,
        notes,
        parentName: null,
        ...(environment ? { environment } : {}),
        ...(record?.caveOnly?.length ? { caveOnly: record.caveOnly } : {}),
      })
      if (recordId) markerByRecord.set(recordId, markers[markers.length - 1])
    })

    // PYAM supervisor stations sit on an L-point (AsteroidBase_P3_L4 = PYAM-SUPVISR-3-4).
    for (const marker of markers) {
      const lpoint = marker.name.match(/^PYR(\d) L(\d)$/)
      if (!lpoint) continue
      const base = locName(localization, `AsteroidBase_P${lpoint[1]}_L${lpoint[2]}`)
      if (!base || !/SUPVISR/i.test(base)) continue
      marker.aliases = [...new Set([...marker.aliases, marker.name])]
      marker.name = base
      marker.kind = 'supervisor'
      marker.id = `${systemId}:${slug(base)}`
    }

    for (const ring of bodyRings) {
      addMarker(markers, {
        systemId,
        name: `${ring.parentName} Ring`,
        aliases: [`${ring.parentName} Asteroid Ring`],
        kind: 'belt',
        description: null,
        x: Math.round(ring.pos[0]),
        y: Math.round(ring.pos[1]),
        z: Math.round(ring.pos[2]),
        radiusM: null,
        innerRadiusM: Math.round(ring.innerRadiusM),
        outerRadiusM: Math.round(ring.outerRadiusM),
        toSystem: null,
        toMarkerName: null,
        notes: [],
        parentName: ring.parentName,
      })
    }

    // Nyx belts are segment fields, not one ring socpak. The orbit is where the
    // segments sit (Levski rides Glaciem; QV and social stations ride Keeger).
    // The outer edge comes from the ring's _bg container bounds when it ships.
    if (systemId === 'nyx') {
      for (const [label, filePart, ringKey] of [
        ['Glaciem Ring', 'glaciem', 'glaciemring'],
        ['Keeger Belt', 'keeger', 'keegerbelt'],
      ]) {
        if (markers.some((m) => m.kind === 'belt' && m.name === label)) continue
        let record = null
        for (const row of starmap.values()) {
          const f = String(row.file || '')
          if (f.includes(filePart) && (f.includes('glaciemring.json') || f.includes('keegerbelt.json') || f.endsWith(filePart + '.json'))) {
            record = row
            break
          }
        }
        if (!record) {
          for (const row of starmap.values()) {
            if (String(row.name || '').toLowerCase() === label.toLowerCase()) {
              record = row
              break
            }
          }
        }
        const ring = record?.rings?.[0]
        let innerRadiusM = ring?.innerRadius ?? null
        let outerRadiusM = ring?.outerRadius ?? null
        if (innerRadiusM == null || outerRadiusM == null) {
          const dists = ringSegmentDistances[ringKey].filter((d) => d > 1e6).sort((a, b) => a - b)
          if (dists.length) {
            const mid = dists[Math.floor(dists.length / 2)]
            const bgOuter = ringBgOuterRadiusM(join(systemRoot, ringKey, `${ringKey}_bg.socpak`))
            const half = Math.max((dists[dists.length - 1] - dists[0]) / 2, bgOuter ? bgOuter - mid : 0)
            innerRadiusM = mid - half
            outerRadiusM = mid + half
          }
        }
        if (innerRadiusM && outerRadiusM) {
          addMarker(markers, {
            systemId,
            name: label,
            aliases: [],
            kind: 'belt',
            description: record?.description || null,
            x: 0,
            y: 0,
            z: 0,
            radiusM: null,
            innerRadiusM: Math.round(innerRadiusM),
            outerRadiusM: Math.round(outerRadiusM),
            toSystem: null,
            toMarkerName: null,
            notes: [],
            parentName: null,
          })
        }
      }
    }

    // Parent moons to nearest planet for orbit rings.
    // Named stations (Checkmate, Seraphim, …) come from the nav bake. Pyro's nav
    // coordinates already include the star spin. They are turned back onto the
    // unspun containers so a short code can take the station name, then the
    // finished map is spun to the in-game starmap. A city on a
    // planet stays off the map. Levski is the station inside Delamar.
    try {
      const navPath = join(ROOT, 'src', 'data', 'nav-systems.json')
      if (existsSync(navPath)) {
        const nav = JSON.parse(readFileSync(navPath, 'utf8'))
        const navPoints = (nav.points || []).filter((point) => point.system === systemId)
        const shift = navFrameShift(markers, navPoints)
        const onBody = (point) => markers.some((m) => {
          if ((m.kind !== 'planet' && m.kind !== 'moon') || !m.radiusM) return false
          return Math.hypot(point.x - m.x, point.y - m.y, (point.z || 0) - (m.z || 0)) < m.radiusM * 4
        })
        const labelOf = (marker) => [marker.name, ...(marker.aliases || [])]
        const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase()
        const shortCode = (name) => /^(?:PYR\d[\s-]L[1-5]|[A-Z]{2,4}[\s-]L[1-5])$/.test(name || '')
        const adoptName = (marker, point, aliases) => {
          const nextId = `${systemId}:${slug(point.name)}`
          if (!markers.some((row) => row !== marker && row.id === nextId)) marker.id = nextId
          marker.aliases = [...new Set([...marker.aliases, marker.name, ...aliases].filter((alias) => alias && !same(alias, point.name)))]
          marker.name = point.name
        }
        for (const point of navPoints) {
          if (point.kind !== 'station' && point.kind !== 'city') continue
          const placed = shift(point)
          if (point.kind === 'city' && onBody(placed)) continue
          const aliases = point.aliases || []
          const frameMoved = Math.hypot(placed.x - point.x, placed.y - point.y) > 1000
          if (!frameMoved) {
            if (markers.some((marker) => same(marker.name, point.name))) continue
            addMarker(markers, {
              systemId,
              name: point.name,
              aliases,
              kind: 'station',
              description: point.name === 'Levski' ? locText(localization, 'Delamar_Desc', 400) : null,
              x: placed.x,
              y: placed.y,
              z: placed.z,
              radiusM: null,
              innerRadiusM: null,
              outerRadiusM: null,
              toSystem: null,
              toMarkerName: null,
              notes: [],
              parentName: null,
            })
            continue
          }
          const existing = markers.find((marker) => labelOf(marker).some((label) => same(label, point.name) || aliases.some((alias) => same(alias, label))))
          if (existing) {
            const close = Math.hypot(existing.x - placed.x, existing.y - placed.y, (existing.z || 0) - (placed.z || 0)) < 50000
            if (frameMoved && close && existing.kind !== 'supervisor' && shortCode(existing.name) && !shortCode(point.name)) {
              adoptName(existing, point, aliases)
            }
            continue
          }
          const near = markers.find((marker) => (
            marker.kind !== 'planet' && marker.kind !== 'moon' && marker.kind !== 'star'
            && Math.hypot(marker.x - placed.x, marker.y - placed.y, (marker.z || 0) - (placed.z || 0)) < 50000
          ))
          if (near) {
            if (frameMoved && near.kind !== 'supervisor' && shortCode(near.name) && !shortCode(point.name)) {
              adoptName(near, point, aliases)
            }
            continue
          }
          addMarker(markers, {
            systemId,
            name: point.name,
            aliases: aliases,
            kind: 'station',
            description: point.name === 'Levski' ? locText(localization, 'Delamar_Desc', 400) : null,
            x: placed.x,
            y: placed.y,
            z: placed.z,
            radiusM: null,
            innerRadiusM: null,
            outerRadiusM: null,
            toSystem: null,
            toMarkerName: null,
            notes: [],
            parentName: null,
          })
        }
      }
    } catch {
      // nav bake optional
    }

    const planets = markers.filter((m) => m.kind === 'planet')
    for (const moon of markers.filter((m) => m.kind === 'moon')) {
      let best = null
      let bestD = Infinity
      for (const planet of planets) {
        const d = Math.hypot(moon.x - planet.x, moon.y - planet.y, moon.z - planet.z)
        if (d < bestD) {
          bestD = d
          best = planet
        }
      }
      if (best) moon.parentName = best.name
    }

    attachServices(markers, markerByRecord, starmap, systemId)

    // Pyro's star quaternion is the in-game starmap frame (~85° about Z).
    // Stanton and Nyx are identity, so this leaves them where they are.
    if (Math.hypot(starSpin[1], starSpin[2], starSpin[3]) > 1e-6) {
      for (const marker of markers) {
        const moved = quatRot(starSpin, [marker.x, marker.y, marker.z || 0])
        marker.x = Math.round(moved[0])
        marker.y = Math.round(moved[1])
        marker.z = Math.round(moved[2])
      }
    }

    if (!markers.length) continue
    const displayName =
      locName(localization, `${systemId[0].toUpperCase()}${systemId.slice(1)}`) ||
      systemId[0].toUpperCase() + systemId.slice(1)
    const star = markers.find((m) => m.kind === 'star')
    const description =
      star?.description ||
      locName(localization, `${displayName}_Desc`) ||
      `The ${displayName} system.`

    systemsOut.push({ id: systemId, name: displayName, description })
    maps.push({
      id: systemId,
      name: displayName,
      description,
      markers,
    })
  }

  // Jump links for overview spacing (and Jump to targets).
  const systemIds = new Set(systemsOut.map((s) => s.id))
  const links = []
  for (const map of maps) {
    for (const marker of map.markers) {
      if (marker.kind !== 'jump_point' || !marker.toSystem || !systemIds.has(marker.toSystem)) continue
      if (links.some((l) => l.from === map.id && l.to === marker.toSystem)) continue
      const arrive = maps
        .find((m) => m.id === marker.toSystem)
        ?.markers.find((m) => m.kind === 'jump_point' && m.toSystem === map.id)
      links.push({
        from: map.id,
        to: marker.toSystem,
        depart: marker.id,
        arrive: arrive?.id || null,
        arriveName: arrive?.name || null,
      })
      if (arrive) {
        marker.toMarkerName = arrive.name
        marker.toMarkerId = arrive.id
      }
    }
  }

  const overview = layoutOverview(systemsOut, links)
  for (const system of systemsOut) {
    const pos = overview.find((row) => row.id === system.id)
    system.overview = pos ? { x: pos.x, y: pos.y, z: pos.z } : { x: 0, y: 0, z: 0 }
  }

  return {
    index: {
      version: 1,
      systems: systemsOut,
      links,
    },
    maps,
  }
}

export function writeStarMaps({ extractedRoot, localization, outDir }) {
  const baked = parseStarMaps({ extractedRoot, localization })
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'index.json'), `${JSON.stringify(baked.index, null, 2)}\n`, 'utf8')
  for (const map of baked.maps) {
    writeFileSync(join(outDir, `${map.id}.json`), `${JSON.stringify(map, null, 2)}\n`, 'utf8')
  }
  return baked
}

function loadLocalization(extractedRoot) {
  const ini = join(extractedRoot, 'Data', 'Localization', 'english', 'global.ini')
  if (!existsSync(ini)) return {}
  const localization = {}
  for (const line of readFileSync(ini, 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    localization[line.slice(0, eq).trim().split(',')[0]] = line.slice(eq + 1).trim()
  }
  return localization
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const extractedRoot = join(ROOT, 'extracted-data')
  const outDir = join(ROOT, 'src', 'data', 'star-maps')
  const baked = writeStarMaps({
    extractedRoot,
    localization: loadLocalization(extractedRoot),
    outDir,
  })
  console.log(`systems ${baked.index.systems.map((s) => s.name).join(', ')}`)
  for (const map of baked.maps) {
    const counts = {}
    for (const m of map.markers) counts[m.kind] = (counts[m.kind] || 0) + 1
    console.log(`${map.id}: ${map.markers.length} markers`, counts)
  }
}
