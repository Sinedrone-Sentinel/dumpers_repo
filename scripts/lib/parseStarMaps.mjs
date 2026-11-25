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

function locName(localization, key) {
  if (!key) return null
  const raw = localization[key] || localization[key.split(',')[0]]
  if (!raw) return null
  const text = String(raw).replace(/\\n/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text || text.startsWith('@') || text.length > 120) return null
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
    const description = locName(localization, descKey)
    const navIcon = String(value.navIcon || '')
    const size = typeof value.size === 'number' ? value.size : null
    const rings = Array.isArray(value.asteroidRings) ? value.asteroidRings : []
    const file = norm(path)
    byId.set(id, {
      id,
      name,
      description,
      navIcon,
      size,
      rings,
      file,
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
  if (/\b(checkmate|orbituary)\b/.test(n) || /checkmate|orbituary/.test(rec + file)) return 'admin_base'
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
  if (/akirocluster\.socpak$/.test(p) || (/asteroidcluster/.test(p) && /cluster [a-z0-9-]+/i.test(name || ''))) {
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

function addMarker(markers, marker) {
  const idBase = `${marker.systemId}:${slug(marker.name)}`
  let id = idBase
  let n = 2
  while (markers.some((row) => row.id === id)) id = `${idBase}-${n++}`
  markers.push({ ...marker, id })
  return id
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
  const systemsOut = []
  const maps = []

  for (const [systemId, systemFile] of bySystem) {
    const xml = readSocpakXml(systemFile, `${basename(systemFile, '.socpak')}.xml`)
    if (!xml) continue
    const markers = []
    const systemRoot = dirname(systemFile)
    const ringSegmentDistances = { glaciemring: [], keegerbelt: [] }

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
      if (!name && /akiro/.test(path)) name = 'Akiro Cluster'

      let kind = classifyMarker({
        path,
        record,
        name,
        entity: world.attr.entityName,
      })
      if (!kind && /jumppoints\/jumppoint_/.test(path)) kind = 'jump_point'
      if (!kind && /star\.socpak$/.test(path)) kind = 'star'
      if (!kind) return
      if (isSurfaceNoise(path, kind)) return
      if (/\/_bg\.socpak$|segment_mission|segment_social|segment_levski/.test(path)) return
      // Nyx planets are placed via dummyplanet containers with real starmap records.
      if (/dummyplanet/.test(path) && !(record && (record.navIcon === 'Planet' || record.navIcon === 'Moon'))) return
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
      if (/^(checkmate|orbituary)$/i.test(name)) kind = 'admin_base'

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
      })
    })

    // Nyx belts are segment fields, not one ring socpak. The orbit is where the
    // segments sit (Levski rides Glaciem; QV / outlaw / social stations ride Keeger).
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
    // Fill manned stations that live under planet interiors (Checkmate, Seraphim, …).
    try {
      const navPath = join(ROOT, 'src', 'data', 'nav-systems.json')
      if (existsSync(navPath)) {
        const nav = JSON.parse(readFileSync(navPath, 'utf8'))
        for (const point of nav.points || []) {
          if (point.system !== systemId || point.kind !== 'station') continue
          if (markers.some((m) => m.name.toLowerCase() === String(point.name).toLowerCase())) continue
          let kind = 'station'
          if (/^(checkmate|orbituary)$/i.test(point.name)) kind = 'admin_base'
          addMarker(markers, {
            systemId,
            name: point.name,
            aliases: point.aliases || [],
            kind,
            description: null,
            x: point.x,
            y: point.y,
            z: point.z,
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
