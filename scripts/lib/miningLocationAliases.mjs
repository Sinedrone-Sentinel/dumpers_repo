/**
 * Build locationAliases from extracted localization + HPP audit.
 * Used by parse-extracted-data.mjs and parseMiningSpawns.mjs.
 */

import { loadHppProviderPresets } from './hppProviderPresets.mjs'

/** Spawn code → primary compendium / guide name (from localization + compendium). */
export const SPAWN_CODE_GUIDE_NAMES = {
  Stanton1: 'Hurston',
  Stanton1a: 'Ita',
  Stanton1b: 'Aberdeen',
  Stanton1c: 'Arial',
  Stanton1d: 'Magda',
  Stanton2a: 'Cellin',
  Stanton2b: 'Daymar',
  Stanton2c: 'Yela',
  'Stanton2c Belt': 'Yela Ring',
  Stanton3a: 'Lyria',
  Stanton3b: 'Wala',
  Stanton4: 'microTech',
  Stanton4a: 'Calliope',
  Stanton4b: 'Clio',
  Stanton4c: 'Euterpe',
  Pyro1: 'Pyro I',
  Pyro2: 'Monox',
  Pyro3: 'Bloom',
  Pyro4: 'Pyro IV',
  Pyro6: 'Terminus',
  Pyro5a: 'Ignis',
  Pyro5b: 'Vatra',
  Pyro5c: 'Adir',
  Pyro5d: 'Fairo',
  Pyro5e: 'Fuego',
  Pyro5f: 'Vuur',
  'Aaron Halo': 'Aaron Halo',
  'Akiro Cluster': 'Akiro Cluster',
  'Glaciem Ring': 'Glaciem Ring',
  'Keeger Belt': 'Keeger Belt',
}

/** Compendium Lagrange station → internal belt template (ore-overlap verified; not in game files). */
export const GUIDE_TO_SPAWN_KEYS = {
  'ARC-L1': ['Lagrange F'],
  'ARC-L2': ['Lagrange F'],
  'ARC-L3': ['Lagrange D'],
  'ARC-L4': ['Lagrange F'],
  'ARC-L5': ['Lagrange B'],
  'CRU-L1': ['Lagrange E'],
  'CRU-L2': ['Lagrange E'],
  'CRU-L3': ['Lagrange C'],
  'CRU-L4': ['Lagrange B'],
  'CRU-L5': ['Lagrange D'],
  'HUR-L1': ['Lagrange A'],
  'HUR-L2': ['Lagrange F'],
  'HUR-L3': ['Lagrange E'],
  'HUR-L4': ['Lagrange A'],
  'HUR-L5': ['Lagrange A'],
  'MIC-L1': ['Lagrange C'],
  'MIC-L2': ['Lagrange C'],
  'MIC-L3': ['Lagrange B'],
  'MIC-L4': ['Lagrange D'],
  'MIC-L5': ['Lagrange C'],
}

/** Compendium entries that map to multiple spawn profile keys. */
export const COMPOUND_GUIDE_TO_SPAWN_KEYS = {
  Hurston: ['Stanton1', 'Stanton1a', 'Stanton1b', 'Stanton1c', 'Stanton1d'],
  Monox: ['Pyro2'],
  microTech: ['Stanton4', 'Stanton4a', 'Stanton4b', 'Stanton4c'],
  'Yela Ring': ['Stanton2c Belt', 'Stanton2c'],
  'Magda Sand Caves': ['Stanton1d'],
}

/**
 * Compendium subsite labels that map to the same spawn key as a parent moon
 * (e.g. "Magda Sand Caves" → Stanton1d, same as Magda). Not browsable locations.
 */
export function buildRedundantSubsiteGuideLocations() {
  const redundant = new Set()
  for (const [guideName, spawnKeys] of Object.entries(COMPOUND_GUIDE_TO_SPAWN_KEYS)) {
    if (spawnKeys.length !== 1) continue
    const primary = SPAWN_CODE_GUIDE_NAMES[spawnKeys[0]]
    if (primary && primary !== guideName) redundant.add(guideName)
  }
  return redundant
}

export const REDUNDANT_SUBSITE_GUIDE_LOCATIONS = buildRedundantSubsiteGuideLocations()

function pyrLagrangeNames(planetNum) {
  return [1, 2, 3, 4, 5].map((n) => `PYR${planetNum} L${n}`)
}

/**
 * HPP belt templates → starmap Lagrange site names.
 * Verified from game location→preset assignments (Warm = inner belts, Cool = outer).
 */
export const SPAWN_TEMPLATE_SITE_GUIDE_NAMES = {
  'Pyro Warm01': [...pyrLagrangeNames(1), ...pyrLagrangeNames(2)],
  'Pyro Warm02': pyrLagrangeNames(3),
  'Pyro Cool01': pyrLagrangeNames(5),
  'Pyro Cool02': pyrLagrangeNames(6),
}

/** Member-facing labels for internal belt/body templates (never Warm01/Cool02 slugs). */
export const SPAWN_TEMPLATE_DISPLAY_NAMES = {
  'Pyro Warm01': 'Pyro I–II Lagrange belts',
  'Pyro Warm02': 'Pyro III Lagrange belts',
  'Pyro Cool01': 'Pyro V Lagrange belts',
  'Pyro Cool02': 'Pyro VI Lagrange belts',
  'Pyro Deepspaceasteroids': 'Pyro Asteroid Clusters',
}

const SPAWN_KEY_SKIP_DESC_SUFFIXES = new Set([
  'Outpost',
  'ASD',
  'Delving',
  'Facility',
  'Cave',
  'MiningCompound',
  'OLP',
  'HurDyn',
  'ArcCorp',
  'DrugLab',
  'DrugUGF',
  'IndyMine',
  'Racetrack',
  'Stash',
  'Prison',
  'JPStation',
  'entrance',
])

/** Explicit slug overrides removed — see hppRecordToSpawnKey() heuristics. */

function splitCamelCaseToken(token) {
  return token
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

/** Normalize HPP record name to spawnKey (matches legacy game-mining-spawns.json). */
export function hppRecordToSpawnKey(hppRecordName) {
  const raw = String(hppRecordName || '').replace(/^HarvestableProviderPreset\.HPP_/i, '')

  if (/^(Stanton|Pyro)\d+[a-f]?$/i.test(raw)) {
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  }

  const systemSiteMatch = raw.match(/^(Pyro|Nyx)_(.+)$/i)
  if (systemSiteMatch) {
    const [, system, sitePart] = systemSiteMatch
    const systemLabel = `${system.charAt(0).toUpperCase()}${system.slice(1).toLowerCase()}`
    if (/^(Warm|Cool)\d/i.test(sitePart)) {
      return `${systemLabel} ${sitePart.charAt(0).toUpperCase()}${sitePart.slice(1)}`
    }
    if (/^DeepSpace/i.test(sitePart)) {
      return `${systemLabel} ${sitePart.charAt(0).toUpperCase()}${sitePart.slice(1).toLowerCase()}`
    }
    return splitCamelCaseToken(sitePart).join(' ')
  }

  if (!raw.includes('_')) {
    return splitCamelCaseToken(raw).join(' ')
  }

  return raw
    .split('_')
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ')
}

export function inferSystemFromSpawnKey(spawnKey) {
  if (!spawnKey) return 'Unknown'
  if (/^Pyro/i.test(spawnKey)) return 'Pyro'
  if (/^Stanton|^Lagrange|^Aaron Halo/i.test(spawnKey)) return 'Stanton'
  if (/^Nyx|^Glaciem|^Keeger/i.test(spawnKey)) return 'Nyx'
  return 'Unknown'
}

/**
 * Parse localization desc key into spawn code + optional guide name.
 * @param {string} key e.g. Stanton1b_Aberdeen_desc, Pyro1_desc, Pyro5c_Adir_desc
 */
export function parseLocationDescKey(key) {
  if (!/_desc$/i.test(key)) return null
  const base = key.replace(/_desc$/i, '')
  const parts = base.split('_')
  const head = parts[0]
  if (!/^(Stanton|Pyro|Nyx)\d/i.test(head)) return null

  const spawnKey = head
  let guideName = null

  if (parts.length >= 2) {
    const tailParts = parts.slice(1)
    const tail = tailParts.join('_')
    const skip = [...SPAWN_KEY_SKIP_DESC_SUFFIXES].some((s) => tail.includes(s))
    if (!skip && tailParts.length === 1 && /^[A-Z][a-zA-Z]+$/.test(tail)) {
      guideName = tail
    }
  }

  return {
    spawnKey,
    guideName,
    system: inferSystemFromSpawnKey(spawnKey),
  }
}

function buildSpawnKeyToGuideNames() {
  const map = new Map()
  for (const [guideName, spawnKeys] of Object.entries(GUIDE_TO_SPAWN_KEYS)) {
    for (const spawnKey of spawnKeys) {
      if (!map.has(spawnKey)) map.set(spawnKey, new Set())
      map.get(spawnKey).add(guideName)
    }
  }
  for (const [spawnKey, guideName] of Object.entries(SPAWN_CODE_GUIDE_NAMES)) {
    if (!map.has(spawnKey)) map.set(spawnKey, new Set())
    map.get(spawnKey).add(guideName)
  }
  for (const [spawnKey, siteNames] of Object.entries(SPAWN_TEMPLATE_SITE_GUIDE_NAMES)) {
    if (!map.has(spawnKey)) map.set(spawnKey, new Set())
    const set = map.get(spawnKey)
    set.add('Pyro Asteroid Clusters')
    for (const name of siteNames) set.add(name)
  }
  return map
}

const SPAWN_TO_GUIDE_NAMES = buildSpawnKeyToGuideNames()

function lagrangeDisplayName(spawnKey, guideNames) {
  if (guideNames?.length) return [...guideNames].sort()[0]
  const letter = spawnKey.replace(/^Lagrange\s+/i, '')
  if (letter === 'Occupied') return 'Occupied Lagrange belt'
  return `Aaron Halo belt · ${letter}`
}

function resolveDisplayName(spawnKey, guideName, guideNames) {
  if (SPAWN_TEMPLATE_DISPLAY_NAMES[spawnKey]) return SPAWN_TEMPLATE_DISPLAY_NAMES[spawnKey]
  if (guideName && (!guideNames || guideNames.length <= 1)) return guideName
  if (guideNames?.length === 1) return guideNames[0]
  if (/^Lagrange/i.test(spawnKey)) return lagrangeDisplayName(spawnKey, guideNames)
  if (guideNames?.length > 1) return guideNames[0]
  return spawnKey
}

function upsertAlias(map, spawnKey, patch) {
  const existing = map.get(spawnKey) ?? { spawnKey }
  map.set(spawnKey, { ...existing, ...patch, spawnKey })
}

/**
 * Build locationAliases map keyed by spawnKey.
 * @param {Record<string, string>} localization
 * @param {string} extractedDataRoot
 */
export function buildLocationAliases(localization, extractedDataRoot) {
  const aliases = new Map()

  for (const [key, value] of Object.entries(localization)) {
    if (key === '_lowerMap') continue
    if (!value.includes('Potential')) continue
    const parsed = parseLocationDescKey(key)
    if (!parsed) continue
    const guideName = parsed.guideName ?? SPAWN_CODE_GUIDE_NAMES[parsed.spawnKey] ?? null
    const guideNames = SPAWN_TO_GUIDE_NAMES.get(parsed.spawnKey)
      ? [...SPAWN_TO_GUIDE_NAMES.get(parsed.spawnKey)]
      : guideName
        ? [guideName]
        : undefined
    upsertAlias(aliases, parsed.spawnKey, {
      guideName: guideName ?? undefined,
      guideNames,
      displayName: resolveDisplayName(parsed.spawnKey, guideName, guideNames),
      system: parsed.system,
      source: 'localization_desc',
    })
  }

  for (const [spawnKey, guideName] of Object.entries(SPAWN_CODE_GUIDE_NAMES)) {
    if (aliases.has(spawnKey)) continue
    const guideNames = SPAWN_TO_GUIDE_NAMES.get(spawnKey)
      ? [...SPAWN_TO_GUIDE_NAMES.get(spawnKey)]
      : [guideName]
    upsertAlias(aliases, spawnKey, {
      guideName,
      guideNames,
      displayName: resolveDisplayName(spawnKey, guideName, guideNames),
      system: inferSystemFromSpawnKey(spawnKey),
      source: 'spawn_code_table',
    })
  }

  applyVerifiedOverlays(aliases)
  auditHppProviderPresets(extractedDataRoot, aliases)
  applyNavHints(aliases, localization)

  return Object.fromEntries(
    [...aliases.entries()].sort(([a], [b]) => a.localeCompare(b))
  )
}

/**
 * Compendium / guide name → spawn profile keys (runtime lookup table).
 * Excludes broad buckets and PYR nav labels used only for belt template display.
 */
export function buildGuideToSpawnKeys(locationAliases = {}) {
  const map = {}

  for (const [guideName, spawnKeys] of Object.entries(GUIDE_TO_SPAWN_KEYS)) {
    map[guideName] = [...spawnKeys]
  }
  for (const [guideName, spawnKeys] of Object.entries(COMPOUND_GUIDE_TO_SPAWN_KEYS)) {
    map[guideName] = [...spawnKeys]
  }
  for (const [spawnKey, guideName] of Object.entries(SPAWN_CODE_GUIDE_NAMES)) {
    if (!map[guideName]) map[guideName] = []
    if (!map[guideName].includes(spawnKey)) map[guideName].push(spawnKey)
  }

  for (const [spawnKey, alias] of Object.entries(locationAliases)) {
    const names = alias.guideNames ?? (alias.guideName ? [alias.guideName] : [])
    for (const name of names) {
      if (name === 'Pyro Asteroid Clusters') continue
      if (/^PYR\d/i.test(name)) continue
      if (!map[name]) map[name] = []
      if (!map[name].includes(spawnKey)) map[name].push(spawnKey)
    }
  }

  for (const keys of Object.values(map)) {
    keys.sort()
  }

  return Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)))
}

function applyVerifiedOverlays(aliases) {
  for (const [spawnKey, siteNames] of Object.entries(SPAWN_TEMPLATE_SITE_GUIDE_NAMES)) {
    upsertAlias(aliases, spawnKey, {
      guideNames: ['Pyro Asteroid Clusters', ...siteNames],
      displayName: SPAWN_TEMPLATE_DISPLAY_NAMES[spawnKey] ?? spawnKey,
      system: 'Pyro',
      source: 'verified_overlay',
    })
  }

  upsertAlias(aliases, 'Pyro Deepspaceasteroids', {
    guideNames: ['Pyro Asteroid Clusters'],
    displayName: SPAWN_TEMPLATE_DISPLAY_NAMES['Pyro Deepspaceasteroids'],
    system: 'Pyro',
    source: 'verified_overlay',
  })

  upsertAlias(aliases, 'Pyro2', {
    guideNames: ['Monox', 'Pyro II'],
    guideName: 'Monox',
    displayName: 'Monox',
    system: 'Pyro',
    source: 'verified_overlay',
  })

  for (const spawnKey of [
    'Lagrange A',
    'Lagrange B',
    'Lagrange C',
    'Lagrange D',
    'Lagrange E',
    'Lagrange F',
    'Lagrange G',
    'Lagrange Occupied',
  ]) {
    const guideNames = SPAWN_TO_GUIDE_NAMES.get(spawnKey)
      ? [...SPAWN_TO_GUIDE_NAMES.get(spawnKey)].sort()
      : undefined
    upsertAlias(aliases, spawnKey, {
      guideNames,
      displayName: lagrangeDisplayName(spawnKey, guideNames),
      system: 'Stanton',
      source: 'verified_overlay',
    })
  }
}

function locValue(localization, key) {
  return localization[key] ?? localization[`${key},P`] ?? null
}

/** "QV Breaker Station BRK-204" → "BRK-204" (starmap search works with either). */
function shortBreakerName(value) {
  const m = /(BRK-\d+)/.exec(value)
  return m ? m[1] : value
}

function collectLocValues(localization, keyPattern, limit = Infinity) {
  const out = []
  for (const [key, value] of Object.entries(localization)) {
    if (key === '_lowerMap') continue
    if (!keyPattern.test(key.replace(/,P$/, ''))) continue
    out.push(value)
    if (out.length >= limit) break
  }
  return out
}

const PYRO_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']

/**
 * One belt group per Pyro planet: L1–L5 with any named station at each point.
 * Station names come from RR_P{n}_L{m} / AsteroidBase_P{n}_L{m} loc keys
 * (clinics and planet-orbit stations without an L index are not belt markers).
 */
function pyroBeltGroup(localization, planetNum) {
  const markers = []
  for (let l = 1; l <= 5; l++) {
    const stations = [
      locValue(localization, `RR_P${planetNum}_L${l}`),
      locValue(localization, `AsteroidBase_P${planetNum}_L${l}`),
    ].filter(Boolean)
    markers.push(stations.length ? `L${l} · ${stations.join(', ')}` : `L${l}`)
  }
  return {
    label: `Pyro ${PYRO_ROMAN[planetNum - 1]} belt — QT markers PYR${planetNum} L1–L5`,
    markers,
  }
}

/** RAB/RMB wandering-cluster bases grouped by Pyro region A–D. */
function pyroRegionGroups(localization) {
  const byRegion = { A: [], B: [], C: [], D: [] }
  for (const [rawKey, value] of Object.entries(localization)) {
    if (rawKey === '_lowerMap') continue
    const key = rawKey.replace(/,P$/, '')
    const rab = /^AsteroidCluster_\d+Base_Pyro_Encounter_Region([A-D](?:and[A-D])?)_\d+$/i.exec(key)
    if (rab) {
      for (const region of rab[1].toUpperCase().split('AND')) byRegion[region]?.push(value)
      continue
    }
    const rmb = /^ab_mine_pyro_region([a-d])_(?:med|sml)_\d+$/i.exec(key)
    if (rmb) byRegion[rmb[1].toUpperCase()]?.push(value)
  }
  // RAB bases first, then RMB mines, alphabetical within each family.
  const sortMarkers = (a, b) => {
    const aRab = a.startsWith('RAB-')
    const bRab = b.startsWith('RAB-')
    if (aRab !== bRab) return aRab ? -1 : 1
    return a.localeCompare(b)
  }
  return ['A', 'B', 'C', 'D']
    .filter((region) => byRegion[region].length > 0)
    .map((region) => ({
      label: `Pyro Region ${region} — wandering cluster bases`,
      note: 'Clusters drift around the system; starmap-search any of these markers to QT into that region',
      markers: byRegion[region].sort(sortMarkers),
    }))
}

/**
 * In-game navigation data per spawn key — a short one-line hint (tooltips) and
 * optional structured marker groups (location view). Station names are resolved
 * from game localization so patch renames flow through automatically; only the
 * geography (which belt sits at which Lagrange point) is curated.
 */
export function buildNavHints(localization) {
  const val = (key) => locValue(localization, key)
  const nav = {}

  // ── Pyro Lagrange belts (PYR# L# markers on the starmap) ──────────────────
  nav['Pyro Warm01'] = {
    navHint: 'QT to the PYR1 / PYR2 L1–L5 Lagrange markers — belt asteroids cluster around the L-points',
    navMarkers: [pyroBeltGroup(localization, 1), pyroBeltGroup(localization, 2)],
  }
  nav['Pyro Warm02'] = {
    navHint: 'QT to the PYR3 L1–L5 Lagrange markers — belt asteroids cluster around the L-points',
    navMarkers: [pyroBeltGroup(localization, 3)],
  }
  nav['Pyro Cool01'] = {
    navHint: 'QT to the PYR5 L1–L5 Lagrange markers — belt asteroids cluster around the L-points',
    navMarkers: [pyroBeltGroup(localization, 5)],
  }
  nav['Pyro Cool02'] = {
    navHint: 'QT to the PYR6 L1–L5 Lagrange markers around Terminus',
    navMarkers: [pyroBeltGroup(localization, 6)],
  }

  // ── Named Pyro clusters ────────────────────────────────────────────────────
  const akiroStation = val('RR_P1_L3')
  nav['Akiro Cluster'] = {
    navHint:
      'Starmap search "Akiro Cluster" — sits near Pyro I L3' +
      (akiroStation ? ` (closest station: ${akiroStation})` : ''),
  }

  nav['Pyro Deepspaceasteroids'] = {
    navHint:
      'Wandering clusters between planets — QT to RAB/RMB markers (click this location for the full list)',
    navMarkers: pyroRegionGroups(localization),
  }

  // ── Nyx rings ──────────────────────────────────────────────────────────────
  const brkStations = collectLocValues(localization, /^Nyx_RockCracker_\d+$/i)
    .map(shortBreakerName)
    .sort()
  const brkGroup = brkStations.length
    ? [
        {
          label: 'QV Breaker Stations — roam the Nyx belts',
          note: 'Any BRK station puts you inside the Nyx asteroid fields',
          markers: brkStations,
        },
      ]
    : undefined
  nav['Glaciem Ring'] = {
    navHint:
      'Starmap search "Glaciem Ring" — QV Breaker Stations (BRK-###) roam the Nyx belts',
    navMarkers: brkGroup,
  }
  nav['Keeger Belt'] = {
    navHint:
      'Starmap search "Keeger Belt" — QV Breaker Stations (BRK-###) roam the Nyx belts',
    navMarkers: brkGroup,
  }

  // ── Stanton ────────────────────────────────────────────────────────────────
  nav['Aaron Halo'] = {
    navHint:
      'Asteroid band between Crusader and ArcCorp orbits — no starmap marker; drop out of quantum partway along CRU-L5 ↔ ARC-L1 routes',
  }
  nav['Stanton2c Belt'] = {
    navHint: 'Yela\u2019s asteroid ring — QT to Yela or GrimHEX and fly into the ring',
  }
  nav['Lagrange G'] = {
    navHint: 'Outer Aaron Halo band — no direct marker; drop out of quantum along the halo',
  }
  nav['Lagrange Occupied'] = {
    navHint: 'Aaron Halo band near the occupied halo stations — no direct marker',
  }

  return nav
}

function applyNavHints(aliases, localization) {
  for (const [spawnKey, navData] of Object.entries(buildNavHints(localization))) {
    const patch = { navHint: navData.navHint }
    if (navData.navMarkers?.length) patch.navMarkers = navData.navMarkers
    upsertAlias(aliases, spawnKey, patch)
  }

  // Stanton Lagrange belts A–F surround their named station markers (ARC-L5 etc.)
  for (const [spawnKey, alias] of aliases) {
    if (!/^Lagrange [A-F]$/i.test(spawnKey) || alias.navHint) continue
    const stations = (alias.guideNames ?? []).filter((name) => /-L\d$/.test(name)).sort()
    if (stations.length) {
      alias.navHint = `QT straight to ${stations.join(' / ')} — the belt surrounds the station`
      alias.navMarkers = [
        {
          label: 'Lagrange stations with this belt profile',
          markers: stations,
        },
      ]
    }
  }
}

function auditHppProviderPresets(extractedDataRoot, aliases) {
  for (const preset of loadHppProviderPresets(extractedDataRoot)) {
    const spawnKey = hppRecordToSpawnKey(preset.hppKey)
    const system = preset.system !== 'Unknown' ? preset.system : inferSystemFromSpawnKey(spawnKey)

    if (!aliases.has(spawnKey)) {
      const guideName = SPAWN_CODE_GUIDE_NAMES[spawnKey]
      const guideNames = SPAWN_TO_GUIDE_NAMES.get(spawnKey)
        ? [...SPAWN_TO_GUIDE_NAMES.get(spawnKey)]
        : guideName
          ? [guideName]
          : undefined
      upsertAlias(aliases, spawnKey, {
        guideName,
        guideNames,
        displayName: resolveDisplayName(spawnKey, guideName, guideNames),
        system,
        source: 'hpp_path_audit',
      })
    } else {
      const entry = aliases.get(spawnKey)
      if (entry.system === 'Unknown' && system !== 'Unknown') {
        entry.system = system
      }
      if (typeof entry.source === 'string' && !entry.source.includes('hpp')) {
        entry.source = `${entry.source}+hpp_path_audit`
      }
    }
  }
}

export function resolveAliasForSpawnKey(spawnKey, locationAliases = {}) {
  const alias = locationAliases[spawnKey]
  if (alias) {
    return {
      spawnKey,
      displayName: alias.displayName ?? spawnKey,
      guideName: alias.guideName ?? alias.guideNames?.[0],
      guideNames: alias.guideNames,
      system: alias.system ?? inferSystemFromSpawnKey(spawnKey),
    }
  }
  const guideName = SPAWN_CODE_GUIDE_NAMES[spawnKey]
  const guideNames = SPAWN_TO_GUIDE_NAMES.get(spawnKey)
    ? [...SPAWN_TO_GUIDE_NAMES.get(spawnKey)]
    : undefined
  return {
    spawnKey,
    displayName: resolveDisplayName(spawnKey, guideName, guideNames),
    guideName,
    guideNames,
    system: inferSystemFromSpawnKey(spawnKey),
  }
}

/** Audit spawn JSON keys against locationAliases. */
export function auditAliasCoverage(spawnKeys, locationAliases) {
  const unmapped = []
  const rawDisplayNames = []
  for (const spawnKey of spawnKeys) {
    const alias = locationAliases[spawnKey]
    if (!alias?.displayName) {
      unmapped.push(spawnKey)
      continue
    }
    const looksLikeRawSlug =
      /^(Stanton\d|Pyro\d|Lagrange [A-G])$/i.test(alias.displayName) &&
      alias.source !== 'verified_overlay'
    if (
      (alias.displayName === spawnKey && /^(Stanton|Pyro)\d/i.test(spawnKey)) ||
      looksLikeRawSlug
    ) {
      if (alias.source !== 'verified_overlay') {
        rawDisplayNames.push({ spawnKey, displayName: alias.displayName, source: alias.source })
      }
    }
  }

  return { unmapped, rawDisplayNames }
}
