/**
 * Member-facing catalogs for the Site Help bot.
 *
 * The Archive explains how to use each page. These rows are the facts those
 * pages list: Wikelo trades, missions, blueprints, and the other reference
 * catalogs. Display names only — no ids, entity classes, or localization keys.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { cleanGameText, humanizeToken } from './tickerLanguage.mjs'

const TYPE_LABELS = {
  cooler: 'Cooler',
  powerplant: 'Power Plant',
  shield: 'Shield',
  shieldgenerator: 'Shield',
  quantumdrive: 'Quantum Drive',
  qdrive: 'Quantum Drive',
}

const CLASS_LABELS = {
  military: 'Military',
  civilian: 'Civilian',
  stealth: 'Stealth',
  industrial: 'Industrial',
  competition: 'Competition',
}

function readJson(dataDir, name) {
  return JSON.parse(readFileSync(join(dataDir, name), 'utf8'))
}

function text(raw) {
  const cleaned = cleanGameText(String(raw ?? '').replace(/\\n/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return ''
  if (cleaned.startsWith('@')) return ''
  if (/placeholder|uninitialized/i.test(cleaned)) return ''
  if (/file:|\.json\b|libs[\\/]foundry/i.test(cleaned)) return ''
  if (/^[a-z0-9_-]{24,}$/.test(cleaned)) return ''
  return cleaned
}

function keep(row) {
  const out = {}
  for (const [key, value] of Object.entries(row)) {
    if (value == null || value === '' || value === false) continue
    if (Array.isArray(value) && value.length === 0) continue
    out[key] = value
  }
  return out
}

const CATEGORY_LABELS = {
  FPSWeapons: 'FPS Weapons',
  FPSArmours: 'FPS Armour',
  Ammo: 'Ammo',
  MissionItem: 'Mission Items',
}

function categoryLabel(raw) {
  const name = text(raw)
  if (!name) return ''
  if (CATEGORY_LABELS[name]) return CATEGORY_LABELS[name]
  const comp = name.match(/^Veh\. Comp\. (S\d)$/)
  if (comp) return `Vehicle Components ${comp[1]}`
  const weapon = name.match(/^Veh\. Weapons (S\d)$/)
  if (weapon) return `Vehicle Weapons ${weapon[1]}`
  return name
}

function gradeLetter(grade) {
  const rank = Math.max(0, Math.min(3, Number(grade) || 0))
  return String.fromCharCode(65 + rank)
}

function typeLabel(raw) {
  const key = String(raw ?? '').toLowerCase()
  if (TYPE_LABELS[key]) return TYPE_LABELS[key]
  const human = humanizeToken(key)
  return human && human !== key ? human : text(raw)
}

function metaLookupKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/_scitem$/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function oreLabel(raw) {
  const stripped = String(raw ?? '')
    .replace(/^(Ore_|Raw_)/i, '')
    .replace(/_/g, ' ')
  return text(stripped)
}

function amountList(rows) {
  const parts = []
  for (const row of rows ?? []) {
    const name = text(row?.name)
    if (!name) continue
    const amount = Number(row.amount)
    parts.push(Number.isFinite(amount) && amount !== 1 ? `${name} x${amount}` : name)
  }
  return parts
}

export function buildHelpCatalogs(dataDir) {
  const build = readJson(dataDir, 'game-build-version.json')
  const wikeloFile = readJson(dataDir, 'game-wikelo-trades.json')
  const blueprintFile = readJson(dataDir, 'game-blueprints.json')
  const missionFile = readJson(dataDir, 'game-blueprint-missions.json')
  const componentFile = readJson(dataDir, 'game-components.json')
  const componentMeta = readJson(dataDir, 'component-metadata.json')
  const weaponFile = readJson(dataDir, 'game-fps-weapons.json')
  const ordnanceFile = readJson(dataDir, 'game-ordnance.json')
  const reputationFile = readJson(dataDir, 'game-reputation.json')
  const miningFile = readJson(dataDir, 'game-mining.json')
  const locationFile = readJson(dataDir, 'game-mining-locations.json')
  const loreFile = readJson(dataDir, 'game-lore.json')
  const manufacturerFile = readJson(dataDir, 'game-manufacturers.json')

  const blueprintNameByKey = new Map()
  const blueprints = []
  for (const bp of blueprintFile.blueprints ?? []) {
    if (!bp?.entityClass) continue
    const name = text(bp.blueprintName)
    if (!name) continue
    for (const key of [bp.internalName, bp.file, bp.entityClass]) {
      if (key) blueprintNameByKey.set(String(key).toLowerCase(), name)
    }
    const materials = []
    const seenMat = new Set()
    for (const slot of bp.slots ?? []) {
      for (const opt of slot.options ?? []) {
        const mat = text(opt.resourceName || opt.displayName)
        if (!mat || seenMat.has(mat)) continue
        seenMat.add(mat)
        materials.push(mat)
      }
    }
    blueprints.push(
      keep({
        name,
        category: categoryLabel(bp.categoryName),
        materials,
        missionReward: bp.isReward === true,
      }),
    )
  }
  blueprints.sort((a, b) => a.name.localeCompare(b.name))

  function blueprintNamesForPools(pools) {
    const names = []
    const seen = new Set()
    for (const pool of pools ?? []) {
      const key = pool?.key ?? pool
      const entries = missionFile.missionBlueprints?.[key] ?? []
      for (const entry of entries) {
        const internal = String(entry?.name ?? '').toLowerCase()
        const name = blueprintNameByKey.get(internal)
        if (!name || seen.has(name)) continue
        seen.add(name)
        names.push(name)
      }
    }
    return names.sort((a, b) => a.localeCompare(b))
  }

  const wikelo = []
  for (const trade of wikeloFile.trades ?? []) {
    const title = text(trade.title)
    if (!title) continue
    const handIn = amountList(trade.costs)
    const reward = [
      ...amountList(trade.rewards),
      ...blueprintNamesForPools(trade.blueprintPools),
    ]
    const standing = text(trade.minStanding?.name ?? trade.minStanding)
    wikelo.push(
      keep({
        title,
        handIn,
        reward,
        rep: typeof trade.repReward === 'number' ? trade.repReward : undefined,
        standing,
        introRequired: trade.requiresIntro === true,
        notForRelease: trade.notForRelease === true,
      }),
    )
  }
  wikelo.sort((a, b) => a.title.localeCompare(b.title))

  const missions = []
  for (const contract of missionFile.contracts ?? []) {
    const title = text(contract.displayTitle || contract.title)
    const faction = text(contract.faction)
    if (!title || !faction || faction.toLowerCase() === 'unknown') continue
    const drops = blueprintNamesForPools(contract.blueprintPools)
    const otherRep = []
    for (const effect of contract.repEffects ?? []) {
      const effectFaction = text(effect.faction)
      if (!effectFaction || effectFaction === faction) continue
      if (typeof effect.amount !== 'number') continue
      const sign = effect.amount > 0 ? '+' : ''
      otherRep.push(`${sign}${effect.amount} ${effectFaction}`)
    }
    const minStanding = text(contract.minStanding?.name)
    const maxStanding = text(contract.maxStanding?.name)
    const standing =
      minStanding && maxStanding && minStanding !== maxStanding
        ? `${minStanding} to ${maxStanding}`
        : minStanding || maxStanding
    missions.push(
      keep({
        title,
        faction,
        where: text(contract.locality?.label) || text(contract.system),
        standing,
        rep: typeof contract.repPoints === 'number' ? contract.repPoints : undefined,
        otherRep,
        drops,
        notForRelease: contract.notForRelease === true,
      }),
    )
  }
  missions.sort((a, b) => a.title.localeCompare(b.title) || a.faction.localeCompare(b.faction))

  const makersByCode = new Map()
  for (const row of Object.values(manufacturerFile.manufacturers ?? {})) {
    const code = String(row.code ?? '').trim().toUpperCase()
    const name = text(row.name)
    if (code && name) makersByCode.set(code, name)
  }

  const metaByKey = componentMeta.blueprints ?? {}
  const components = []
  for (const component of componentFile.components ?? []) {
    const name = text(component.displayName)
    if (!name) continue
    const meta = metaByKey[metaLookupKey(component.name)]
    const itemClass = CLASS_LABELS[String(meta?.itemClass ?? '').toLowerCase()]
    const code = String(component.manufacturerCode ?? '').trim().toUpperCase()
    const fromCode = makersByCode.get(code)
    const rawMaker = text(component.manufacturer)
    const manufacturer =
      rawMaker && rawMaker.toLowerCase() !== 'unknown' ? rawMaker : fromCode
    components.push(
      keep({
        name,
        type: typeLabel(component.type),
        size: typeof component.size === 'number' ? component.size : undefined,
        grade: gradeLetter(component.grade),
        class: itemClass,
        manufacturer,
      }),
    )
  }
  components.sort((a, b) => a.name.localeCompare(b.name))

  const weapons = []
  for (const weapon of weaponFile.weapons ?? []) {
    const name = text(weapon.displayName)
    if (!name) continue
    weapons.push(
      keep({
        name,
        type: text(weapon.type),
        size: typeof weapon.size === 'number' ? weapon.size : undefined,
      }),
    )
  }
  weapons.sort((a, b) => a.name.localeCompare(b.name))

  const ordnance = []
  for (const row of ordnanceFile.ordnance ?? []) {
    const name = text(row.displayName)
    if (!name) continue
    const guidance = text(row.guidance)
    ordnance.push(
      keep({
        name,
        type: text(row.type),
        size: typeof row.size === 'number' ? row.size : undefined,
        guidance: guidance.includes(' ') ? guidance : undefined,
        torpedo: row.isTorpedo === true,
      }),
    )
  }
  ordnance.sort((a, b) => a.name.localeCompare(b.name))

  const careersByFaction = new Map()
  for (const row of Object.values(reputationFile.factionStandings ?? {})) {
    const name = text(row.faction)
    if (!name) continue
    const careers = []
    for (const career of Object.values(row.careers ?? {})) {
      const careerName = text(career.name)
      const steps = []
      for (const standing of career.standings ?? []) {
        const step = text(standing.displayName)
        if (step) steps.push(step)
      }
      if (careerName && steps.length) careers.push(`${careerName}: ${steps.join(', ')}`)
    }
    if (careers.length) careersByFaction.set(name, careers)
  }
  const factions = []
  const seenFactions = new Set()
  for (const row of Object.values(reputationFile.factions ?? {})) {
    const name = text(row.name)
    if (!name || name.toLowerCase() === 'unknown' || seenFactions.has(name)) continue
    seenFactions.add(name)
    factions.push(keep({ name, careers: careersByFaction.get(name) }))
  }
  factions.sort((a, b) => a.name.localeCompare(b.name))

  const statsByOre = new Map()
  for (const ore of miningFile.mineableElements ?? []) {
    const name = oreLabel(ore.name)
    if (!name) continue
    statsByOre.set(name.toLowerCase(), {
      instability: ore.instability,
      resistance: ore.resistance,
    })
  }
  const mining = []
  for (const [rarity, rows] of Object.entries(locationFile.rarityTiers ?? {})) {
    for (const row of rows ?? []) {
      const name = text(row.name)
      if (!name) continue
      const stats = statsByOre.get(name.toLowerCase())
      mining.push(
        keep({
          name,
          rarity: text(rarity),
          locations: (row.locations ?? []).map((loc) => text(loc)).filter(Boolean),
          instability: stats?.instability,
          resistance: stats?.resistance,
        }),
      )
    }
  }
  mining.sort((a, b) => a.name.localeCompare(b.name))

  const miningLasers = []
  for (const laser of miningFile.miningLasers ?? []) {
    const name = text(laser.displayName)
    if (!name) continue
    miningLasers.push(
      keep({
        name,
        size: laser.size,
        power: laser.laserPower,
      }),
    )
  }
  const miningModules = []
  for (const mod of miningFile.miningModules ?? []) {
    const name = text(mod.displayName)
    if (!name) continue
    miningModules.push(
      keep({
        name,
        kind: text(mod.kind),
        size: mod.size,
        resistance: mod.resistanceModifier || undefined,
        instability: mod.instabilityModifier || undefined,
      }),
    )
  }
  const miningGadgets = []
  for (const gadget of miningFile.miningGadgets ?? []) {
    const name = text(gadget.displayName)
    if (!name) continue
    miningGadgets.push(
      keep({
        name,
        resistance: gadget.resistanceModifier || undefined,
        instability: gadget.instabilityModifier || undefined,
      }),
    )
  }

  const lore = []
  for (const row of Object.values(loreFile.resources ?? {})) {
    const name = text(row.label)
    const description = text(row.description)
    if (!name || !description) continue
    lore.push({ name, description })
  }
  lore.sort((a, b) => a.name.localeCompare(b.name))

  const manufacturers = []
  const seenMakers = new Set()
  for (const row of Object.values(manufacturerFile.manufacturers ?? {})) {
    const name = text(row.name)
    if (!name || seenMakers.has(name)) continue
    seenMakers.add(name)
    manufacturers.push(name)
  }
  manufacturers.sort((a, b) => a.localeCompare(b))

  return {
    gameVersion: text(build.version) || text(blueprintFile.version),
    wikelo,
    blueprints,
    missions,
    components,
    weapons,
    ordnance,
    factions,
    mining,
    miningLasers,
    miningModules,
    miningGadgets,
    lore,
    manufacturers,
  }
}
