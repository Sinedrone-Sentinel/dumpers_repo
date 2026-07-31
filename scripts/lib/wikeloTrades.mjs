/**
 * Wikelo Emporium (TheCollector) trade parser.
 *
 * Wikelo trades are barter contracts: hand in a list of items ("costs") and
 * receive items/ships/blueprints ("rewards") plus Wikelo reputation. They are
 * NOT crafting blueprints, so they live in their own catalog
 * (game-wikelo-trades.json) consumed by the Wikelo page.
 *
 * Sources:
 * - contracts/contractgenerator/thecollector.json   — all trade contracts
 * - contracts/contracttemplates/thecollector_*.json — per-trade hand-in lists
 * - reputation/rewards/missionrewards_reputation/wikelo_*.json — rep amounts
 * - reputation/standings/affinity/reputationstanding_wikelo_*.json — rank gates
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, basename } from 'node:path'

const GENERATOR_PATH = 'libs/foundry/records/contracts/contractgenerator/thecollector.json'
const TEMPLATES_DIR = 'libs/foundry/records/contracts/contracttemplates'
const WIKELO_STANDINGS_DIR = 'libs/foundry/records/reputation/standings/affinity'
const ENTITY_DIRS = [
  'libs/foundry/records/entities/scitem',
  'libs/foundry/records/entities/spaceships',
  'libs/foundry/records/entities/groundvehicles',
  'libs/foundry/records/entities/decorations',
  // ATLS powersuits are actor entities, not vehicles, but Wikelo awards them
  'libs/foundry/records/actor/actors',
]

/** Internal test flows only — DO_NOT_USE / NFR trades stay listed with an NFR tag. */
const SKIP_DEBUG_NAME = /FlowTest/i

/** Loot-run items whose game localization is an internal code (RCMBNT-*). */
const ENTITY_DISPLAY_OVERRIDES = {
  carryable_tbo_asdreward_pwl1: 'ASD Power Module (PWL-1)',
  carryable_tbo_asdreward_pwl2: 'ASD Power Module (PWL-2)',
  carryable_tbo_asdreward_pwl3: 'ASD Power Module (PWL-3)',
  carryable_tbo_asdreward_rgl1: 'ASD Regulator Module (RGL-1)',
  carryable_tbo_asdreward_rgl2: 'ASD Regulator Module (RGL-2)',
  carryable_tbo_asdreward_rgl3: 'ASD Regulator Module (RGL-3)',
  carryable_tbo_asdreward_xtl1: 'ASD Extract Module (XTL-1)',
  carryable_tbo_asdreward_xtl2: 'ASD Extract Module (XTL-2)',
  carryable_tbo_asdreward_xtl3: 'ASD Extract Module (XTL-3)',
}

function walkJsonFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) walkJsonFiles(p, acc)
    else if (entry.name.endsWith('.json')) acc.push(p)
  }
  return acc
}

function findByType(node, type, out = []) {
  if (node == null || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const v of node) findByType(v, type, out)
    return out
  }
  if (node._Type_ === type) out.push(node)
  for (const v of Object.values(node)) findByType(v, type, out)
  return out
}

function refBasename(ref) {
  if (typeof ref !== 'string') return null
  const match = ref.match(/([^/\\]+)\.json$/i)
  return match ? match[1].toLowerCase() : null
}

function localize(key, localization) {
  if (!key || typeof key !== 'string') return null
  const raw = key.startsWith('@') ? key.slice(1) : key
  const hit = localization[raw] ?? localization._lowerMap?.[raw.toLowerCase()]
  if (hit && !String(hit).startsWith('@')) return hit
  return null
}

/** Strip mission-text markup (<EM4> tags, ~mission(...) tokens, literal \n). */
function cleanMissionText(text) {
  if (!text) return null
  return String(text)
    .replace(/\\n/g, '\n')
    .replace(/<\/?EM\d*>/gi, '')
    .replace(/~mission\([^)]*\)/gi, 'the Emporium')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function humanize(name) {
  return String(name)
    .replace(/^(carryable|harvestable)_(1h|2h)_(cy|fl|sq|tbo)_/i, '')
    .replace(/^(carryable|harvestable)_(1h|2h)_/i, '')
    .replace(/^(harvestable|carryable)_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

/** basename → entity display name via SAttachableComponentParams / vehicleName. */
function buildEntityNameResolver(extractedData, localization) {
  const index = new Map()
  for (const dir of ENTITY_DIRS) {
    for (const file of walkJsonFiles(join(extractedData, dir))) {
      index.set(basename(file, '.json').toLowerCase(), file)
    }
  }

  const cache = new Map()

  function resolve(entityClassRef) {
    const key = refBasename(entityClassRef) ?? String(entityClassRef).toLowerCase()
    if (cache.has(key)) return cache.get(key)

    const result = { name: humanize(key), isVehicle: false, resolved: false }
    const file = index.get(key)
    if (file) {
      // ATLS powersuits live under actor/actors but are claimed like vehicles
      result.isVehicle =
        /[\\/](spaceships|groundvehicles)[\\/]/i.test(file) ||
        (/[\\/]actor[\\/]actors[\\/]/i.test(file) && /atls/i.test(key))
      try {
        const json = JSON.parse(readFileSync(file, 'utf-8'))
        const components = json?._RecordValue_?.Components ?? []
        const attach = components.find((c) => c?._Type_ === 'SAttachableComponentParams')
        const nameKey = attach?.AttachDef?.Localization?.Name
        let display = localize(nameKey, localization)
        if (!display) {
          const vehicle = components.find((c) => typeof c?.vehicleName === 'string')
          display = localize(vehicle?.vehicleName, localization)
        }
        if (display) {
          result.name = display
          result.resolved = true
        }
      } catch {
        // unreadable entity record — humanized fallback stands
      }
    }
    const override = ENTITY_DISPLAY_OVERRIDES[key]
    if (override) {
      result.name = override
      result.resolved = true
    }
    cache.set(key, result)
    return result
  }

  return resolve
}

/** Wikelo rank ladder from affinity standings (rank order by minReputation). */
function parseWikeloStandings(extractedData, localization) {
  const standings = {}
  const dir = join(extractedData, WIKELO_STANDINGS_DIR)
  for (const file of walkJsonFiles(dir)) {
    const base = basename(file, '.json').toLowerCase()
    if (!base.startsWith('reputationstanding_wikelo_')) continue
    try {
      const json = JSON.parse(readFileSync(file, 'utf-8'))
      const value = json?._RecordValue_
      if (!value) continue
      standings[base] = {
        name:
          localize(value.displayName, localization) ??
          value.name ??
          base.replace('reputationstanding_wikelo_', 'Rank '),
        minReputation: value.minReputation ?? 0,
      }
    } catch {
      // skip unreadable standing
    }
  }
  return standings
}

function extractCostsFromOrders(orders, resolveEntity) {
  const costs = []
  for (const order of orders) {
    if (order._Type_ === 'HaulingOrderContent_EntityClass' || order._Type_ === 'HaulingOrder_EntityClass') {
      const entityClass = refBasename(order.entityClass)
      if (!entityClass) continue
      // Retired cost rows keep minAmount but zero out maxAmount; live data uses
      // whichever side is populated.
      const amount = Math.max(order.amount ?? 0, order.minAmount ?? 0, order.maxAmount ?? 0)
      if (amount <= 0) continue
      const entity = resolveEntity(entityClass)
      costs.push({ entityClass, name: entity.name, amount })
    } else if (order._Type_ === 'HaulingOrderContent_Resource' || order._Type_ === 'HaulingOrder_Resource') {
      const recordName = order.resource?._RecordName_ ?? ''
      const resourceName = String(recordName).replace(/^ResourceType\./, '')
      const scu = Math.max(order.minSCU ?? 0, order.maxSCU ?? 0)
      if (!resourceName || scu <= 0) continue
      costs.push({ resourceName, name: resourceName, scu })
    }
  }
  return costs
}

function classifyTrade(debugName) {
  const lower = debugName.toLowerCase()
  if (lower.includes('_vehicle')) return 'vehicle'
  if (lower.includes('favours') || lower.includes('favors')) return 'favor'
  if (lower.includes('intro')) return 'intro'
  if (lower.includes('foodorder')) return 'food'
  return 'gear'
}

const ARMOR_TOKEN = /helmet|core|arms|legs|backpack|suit|armor|armour/i
const WEAPON_TOKEN = /rifle|pistol|shotgun|lmg|smg|sniper|launcher|cannon|gun|magazine|battery|rocket/i

/** Finer bucket used by the Wikelo page filter tags. */
function classifySubCategory(category, debugName, rewards) {
  if (category === 'vehicle') {
    return /_ground_|_atls/i.test(debugName) ? 'ground' : 'ship'
  }
  if (category === 'gear') {
    let armor = 0
    let weapon = 0
    for (const reward of rewards) {
      if (ARMOR_TOKEN.test(reward.entityClass) || ARMOR_TOKEN.test(reward.name)) armor++
      else if (WEAPON_TOKEN.test(reward.entityClass) || WEAPON_TOKEN.test(reward.name)) weapon++
    }
    if (armor > 0 && armor >= weapon) return 'armor'
    if (weapon > 0) return 'weapon'
    return 'gear'
  }
  return category
}

export function parseWikeloTrades({ extractedData, localization, repRewardAmounts = {} }) {
  const generatorFile = join(extractedData, GENERATOR_PATH)
  if (!existsSync(generatorFile)) {
    return { trades: [], standings: {}, issues: ['Wikelo contract generator not found'] }
  }

  const issues = []
  const generator = JSON.parse(readFileSync(generatorFile, 'utf-8'))
  const resolveEntity = buildEntityNameResolver(extractedData, localization)
  const standings = parseWikeloStandings(extractedData, localization)

  const templateCache = new Map()
  function templateOrders(templateRef) {
    const base = refBasename(templateRef)
    if (!base) return []
    if (templateCache.has(base)) return templateCache.get(base)
    const file = join(extractedData, TEMPLATES_DIR, `${base}.json`)
    let orders = []
    if (existsSync(file)) {
      try {
        const tpl = JSON.parse(readFileSync(file, 'utf-8'))
        orders = findByType(tpl, 'HaulingOrder_EntityClass').concat(
          findByType(tpl, 'HaulingOrder_Resource')
        )
      } catch {
        issues.push(`Unreadable Wikelo template: ${base}`)
      }
    }
    templateCache.set(base, orders)
    return orders
  }

  const contracts = findByType(generator, 'Contract')

  // The intro contract emits the completion tags every gated trade requires.
  const introContract = contracts.find((c) => /thecollector_intro/i.test(c.debugName ?? ''))
  const introTagIds = new Set(
    findByType(introContract ?? {}, 'ContractResult_CompletionTag')
      .map((t) => findByType(t, 'TagList'))
      .flat()
      .flatMap((list) => list.tags ?? [])
      .map((tag) => tag._RecordId_)
      .filter(Boolean)
  )

  const trades = []

  for (const contract of contracts) {
    const debugName = (contract.debugName ?? '').trim()
    if (!debugName || SKIP_DEBUG_NAME.test(debugName)) continue

    const overrides = contract.paramOverrides?.stringParamOverrides ?? []
    const titleKey = overrides.find((p) => p.param === 'Title')?.value ?? null
    const descKey = overrides.find((p) => p.param === 'Description')?.value ?? null
    const title = localize(titleKey, localization)
    const description = localize(descKey, localization)

    // Costs: contract-level overrides win; otherwise the template's hand-in list
    const overrideOrders = findByType(contract.paramOverrides ?? {}, 'HaulingOrderContent_EntityClass').concat(
      findByType(contract.paramOverrides ?? {}, 'HaulingOrderContent_Resource')
    )
    const orders = overrideOrders.length > 0 ? overrideOrders : templateOrders(contract.template)
    const costs = extractCostsFromOrders(orders, resolveEntity)

    // Rewards: guaranteed items + weighted award bundles + blueprint pools
    const rewards = []
    const results = contract.contractResults?.contractResults ?? []
    for (const result of results) {
      if (!result || result.missionResults?.[0] !== true) continue
      if (result._Type_ === 'ContractResult_Item') {
        const entityClass = refBasename(result.entityClass)
        if (!entityClass) continue
        const entity = resolveEntity(entityClass)
        rewards.push({
          entityClass,
          name: entity.name,
          amount: result.amount ?? 1,
          kind: entity.isVehicle ? 'vehicle' : 'item',
        })
      } else if (result._Type_ === 'ContractResult_ItemsWeighting') {
        for (const group of result.itemAwardStructure ?? []) {
          for (const award of group.awards ?? []) {
            const entityClass = refBasename(award.entityClass)
            if (!entityClass) continue
            const entity = resolveEntity(entityClass)
            rewards.push({
              entityClass,
              name: entity.name,
              amount: award.amountToAward ?? 1,
              kind: entity.isVehicle ? 'vehicle' : 'item',
            })
          }
        }
      }
    }

    const blueprintPools = findByType(contract.contractResults ?? {}, 'BlueprintRewards')
      .map((r) => refBasename(r.blueprintPool))
      .filter(Boolean)

    // Wikelo reputation gained on completion
    let repReward = 0
    for (const rep of findByType(contract.contractResults ?? {}, 'SReputationAmountParams')) {
      const rewardKey = refBasename(rep.reward)
      if (!rewardKey) continue
      const cached = repRewardAmounts[rewardKey]
      if (typeof cached === 'number') {
        repReward += cached
      } else {
        const numeric = rewardKey.match(/wikelo_(\d+)/i)
        if (numeric) repReward += Number(numeric[1])
      }
    }

    // Rank gate (e.g. unique Wolf trade requires a Wikelo standing window)
    let minStanding = null
    let maxStanding = null
    for (const prereq of findByType(contract.additionalPrerequisites ?? [], 'ContractPrerequisite_Reputation')) {
      const minKey = refBasename(prereq.minStanding)
      const maxKey = refBasename(prereq.maxStanding)
      if (minKey && standings[minKey]) minStanding = standings[minKey]
      if (maxKey && standings[maxKey]) maxStanding = standings[maxKey]
    }

    // Intro gate: completed-contract tags all trace back to the intro mission
    const prereqTagIds = findByType(contract.additionalPrerequisites ?? [], 'ContractPrerequisite_CompletedContractTags')
      .flatMap((p) => findByType(p, 'TagList'))
      .flatMap((list) => list.tags ?? [])
      .map((tag) => tag._RecordId_)
      .filter(Boolean)
    const requiresIntro = prereqTagIds.some((id) => introTagIds.has(id)) || prereqTagIds.length > 0

    const category = classifyTrade(debugName)
    const isVehicleReward = rewards.some((r) => r.kind === 'vehicle')

    if (!title) issues.push(`Unlocalized Wikelo trade title: ${debugName} (${titleKey})`)

    trades.push({
      id: contract.id ?? debugName,
      debugName,
      title: title ?? humanize(debugName.replace(/^TheColll?ector_/i, '')),
      description: cleanMissionText(description),
      category,
      subCategory: classifySubCategory(category, debugName, rewards),
      costs,
      rewards,
      blueprintPools,
      repReward,
      minStanding,
      maxStanding,
      requiresIntro: requiresIntro && category !== 'intro',
      maxPerPlayer: contract.generationParams?.maxInstancesPerPlayer ?? null,
      isVehicleReward,
      /** true = CIG marked notForRelease — still listed; UI shows an NFR tag. */
      notForRelease: contract.notForRelease === true,
    })
  }

  // Ships first (matches Emporium board), then gear, conversions, intro/food
  const categoryOrder = { vehicle: 0, gear: 1, favor: 2, intro: 3, food: 4 }
  trades.sort((a, b) => {
    const catDiff = (categoryOrder[a.category] ?? 9) - (categoryOrder[b.category] ?? 9)
    if (catDiff !== 0) return catDiff
    return a.title.localeCompare(b.title)
  })

  return { trades, standings, issues }
}
