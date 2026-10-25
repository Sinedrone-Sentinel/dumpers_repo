/**
 * Resolve contract standing requirements to the correct reputation scope + tier labels.
 * Contracts may gate on FactionReputationScope (pyro ranks), Security, Hired Muscle, etc.
 */

const STANDING_PATH_CATEGORY_TO_SCOPE = {
  faction_reputation_pyro: 'FactionReputationScope',
  security: 'ReputationScope_Security',
  hiredmuscle: 'ReputationScope_HiredMuscle',
  bounty: 'ReputationScope_Bounty',
  courier: 'ReputationScope_Courier',
  salvage: 'ReputationScope_Salvage',
  guild: 'ReputationScope_Guild',
  assassination: 'ReputationScope_Assassination',
  transport: 'ReputationScope_Transport',
  racing: 'ReputationScope_Racing',
  ship_combat: 'ReputationScope_Ship_Combat',
  fps_combat: 'ReputationScope_FPS_Combat',
  worker: 'ReputationScope_Worker',
  technician: 'ReputationScope_Technician',
  handyman: 'ReputationScope_Handyman',
  smuggling: 'ReputationScope_Smuggling',
  theft: 'ReputationScope_Theft',
  delivery: 'ReputationScope_Hauling',
  emergency: 'ReputationScope_Emergency',
  maintenance: 'ReputationScope_Maintenance',
}

function normalizePath(standingPath) {
  return String(standingPath || '').replace(/\\/g, '/').toLowerCase()
}

function basenameFromPath(filePath) {
  if (!filePath) return null
  const normalized = String(filePath).replace(/\\/g, '/')
  const match = normalized.match(/([^/]+)\.json$/i)
  return match ? match[1].toLowerCase() : null
}

function extractRankSuffix(standingPath) {
  const base = basenameFromPath(standingPath)
  if (!base) return null
  const rankMatch = base.match(/rank(\d+)/i)
  if (rankMatch) return rankMatch[1]
  if (base.includes('noteligible')) return 'noteligible'
  if (base.includes('negativerep') || base.includes('hostile')) return 'negative'
  if (base.includes('allied_border')) return 'allied'
  return null
}

function inferScopeKeyFromStandingPath(standingPath) {
  const normalized = normalizePath(standingPath)
  const categoryMatch = normalized.match(/standings\/([^/]+)\//)
  if (categoryMatch) {
    const category = categoryMatch[1]
    if (STANDING_PATH_CATEGORY_TO_SCOPE[category]) {
      return STANDING_PATH_CATEGORY_TO_SCOPE[category]
    }
  }
  return null
}

function resolveScopeKeyFromRef(scopePath, scopes) {
  if (!scopePath) return null
  const base = basenameFromPath(scopePath)
  if (!base) return null

  const direct = Object.keys(scopes).find((key) => key.toLowerCase() === base)
  if (direct) return direct

  const scopeSuffix = base.replace(/^reputationscope_/, '')
  return (
    Object.keys(scopes).find((key) => {
      const normalized = key.toLowerCase().replace(/^reputationscope_/, '')
      return normalized === scopeSuffix || key.toLowerCase().includes(scopeSuffix)
    }) ?? null
  )
}

export function resolveScopeDisplayName(scopeKey, scopes, localization) {
  if (!scopeKey) return null
  const scope = scopes[scopeKey]
  if (!scope?.displayName) return null

  const raw = scope.displayName
  if (typeof raw === 'string' && raw.startsWith('@')) {
    const key = raw.slice(1)
    return localization[key] || localization[key.toLowerCase()] || key
  }
  return raw
}

/** HiredMuscle scopes mirror Security thresholds; mobiGlas shows Security labels for merc factions. */
export function getPreferredDisplayScopeKey(scopeKey, scopes) {
  if (scopeKey !== 'ReputationScope_HiredMuscle' || !scopes.ReputationScope_Security) {
    return scopeKey
  }

  const hired = scopes.ReputationScope_HiredMuscle?.standings || []
  const security = scopes.ReputationScope_Security?.standings || []
  if (hired.length !== security.length) return scopeKey

  const thresholdsMatch = hired.every(
    (standing, index) => standing.minReputation === security[index]?.minReputation
  )
  return thresholdsMatch ? 'ReputationScope_Security' : scopeKey
}

function findStandingInScope(scope, standingPath, standingsByPath) {
  if (!scope?.standings?.length) return null

  const normalizedTarget = normalizePath(standingPath)
  const targetBase = basenameFromPath(standingPath)

  for (const standing of scope.standings) {
    const standingPathNorm = normalizePath(standing.filePath || '')
    if (normalizedTarget && standingPathNorm.endsWith(normalizedTarget.split('libs/foundry/records/').pop() || '')) {
      return standing
    }
    if (targetBase && basenameFromPath(standing.filePath) === targetBase) {
      return standing
    }
  }

  const rankSuffix = extractRankSuffix(standingPath)
  if (rankSuffix == null) return null

  for (const standing of scope.standings) {
    const standingRank = extractRankSuffix(standing.filePath || standing.name || '')
    if (standingRank === rankSuffix) return standing
  }

  if (standingsByPath && targetBase) {
    for (const [path, standing] of Object.entries(standingsByPath)) {
      if (basenameFromPath(path) === targetBase) return standing
    }
  }

  return null
}

export function resolveStandingForScope(standingPath, scopeKey, reputationSystem, localization) {
  if (!standingPath || !scopeKey) return null

  const { scopes, standingsByPath } = reputationSystem
  const displayScopeKey = getPreferredDisplayScopeKey(scopeKey, scopes)
  const scope = scopes[displayScopeKey] || scopes[scopeKey]
  const standing = findStandingInScope(scope, standingPath, standingsByPath)
  if (!standing) return null

  return {
    name: standing.displayName,
    minReputation: standing.minReputation,
    scopeKey,
    scopeLabel: resolveScopeDisplayName(displayScopeKey, scopes, localization)
      || resolveScopeDisplayName(scopeKey, scopes, localization),
  }
}

export function extractContractReputationPrerequisite(contract) {
  if (contract.minStanding || contract.maxStanding) {
    return {
      minStandingPath: contract.minStanding,
      maxStandingPath: contract.maxStanding,
      scopePath: null,
      factionReputationPath: null,
    }
  }

  for (const prereq of contract.additionalPrerequisites || []) {
    if (prereq?._Type_ !== 'ContractPrerequisite_Reputation' || prereq.exclude) continue
    return {
      minStandingPath: prereq.minStanding,
      maxStandingPath: prereq.maxStanding,
      scopePath: prereq.scope,
      factionReputationPath: prereq.factionReputation,
    }
  }

  return null
}

export function resolveContractStandingRequirement(
  standingPath,
  { scopePath, factionKey } = {},
  reputationSystem,
  localization
) {
  if (!standingPath) return null

  const { scopes } = reputationSystem
  let scopeKey = resolveScopeKeyFromRef(scopePath, scopes)
  if (!scopeKey) {
    scopeKey = inferScopeKeyFromStandingPath(standingPath)
  }

  if (scopeKey) {
    const scoped = resolveStandingForScope(standingPath, scopeKey, reputationSystem, localization)
    if (scoped) return scoped
  }

  // Fallback: raw standing file lookup
  const normalized = normalizePath(standingPath)
  const standing =
    Object.entries(reputationSystem.standingsByPath || {}).find(([path]) =>
      normalized.endsWith(path.replace(/\\/g, '/').toLowerCase())
    )?.[1] ??
    Object.entries(reputationSystem.standingsByPath || {}).find(([path]) =>
      basenameFromPath(path) === basenameFromPath(standingPath)
    )?.[1]

  if (standing) {
    return {
      name: standing.displayName,
      minReputation: standing.minReputation,
      scopeKey: scopeKey ?? null,
      scopeLabel: scopeKey ? resolveScopeDisplayName(scopeKey, scopes, localization) : null,
    }
  }

  return null
}

export function enrichContractStandingFields(contract, reputationSystem, localization) {
  const minStandingPath = contract.__minStandingPath ?? contract.minStanding
  const maxStandingPath = contract.__maxStandingPath ?? contract.maxStanding
  const scopePath = contract.__repScopePath ?? null

  if (
    typeof minStandingPath !== 'string' &&
    typeof maxStandingPath !== 'string' &&
    !scopePath
  ) {
    return { minStanding: null, maxStanding: null, repScopeKey: null, repCareerLabel: null }
  }

  const context = { scopePath, factionKey: contract.factionKey }
  const minStanding = typeof minStandingPath === 'string'
    ? resolveContractStandingRequirement(minStandingPath, context, reputationSystem, localization)
    : null
  const maxStanding = typeof maxStandingPath === 'string'
    ? resolveContractStandingRequirement(maxStandingPath, context, reputationSystem, localization)
    : null

  const repScopeKey = minStanding?.scopeKey ?? maxStanding?.scopeKey ?? null
  const aligned = alignContractStandings(
    minStanding ? { name: minStanding.name, minReputation: minStanding.minReputation } : null,
    maxStanding ? { name: maxStanding.name, minReputation: maxStanding.minReputation } : null,
    lookupFactionStanding(contract.factionKey, reputationSystem?.factionStandings),
    { category: contract.category, repScopeKey },
  )

  return {
    minStanding: aligned.minStanding,
    maxStanding: aligned.maxStanding,
    repScopeKey: aligned.repScopeKey ?? repScopeKey,
    repCareerLabel: aligned.repCareerLabel,
  }
}

/**
 * A faction can have several job lines (Hauling, Courier, Standing, …).
 * Keep every line that already has a real display name. The Standing line
 * stays the default on the faction card. Missions pick a line from mission type.
 */
export function playerFacingCareers(careers) {
  return careers || {}
}

const MISSION_TYPE_CAREERS = [
  { type: /hauling/i, careers: [/hauling/i] },
  { type: /courier/i, careers: [/courier/i] },
  { type: /salvag/i, careers: [/salvag/i] },
  { type: /bounty/i, careers: [/bounty/i] },
  { type: /mercenary|security/i, careers: [/security/i, /hired muscle/i] },
  { type: /assassin/i, careers: [/assassin/i] },
  { type: /racing/i, careers: [/spaceship/i, /racing/i] },
  { type: /wikelo|barter/i, careers: [/barter/i] },
]

function sortedRanks(career) {
  return usableRanks(career?.standings, career?.name || null)
    .sort((a, b) => a.minReputation - b.minReputation)
}

function careerMatchesName(career, pattern) {
  return pattern.test(career?.name || '') || pattern.test(career?.scopeKey || '')
}

/** Job line for this mission. Mission type wins when that faction has the line. */
export function careerForMissionType(careers, { category, repScopeKey } = {}) {
  const list = careers || []
  const cat = String(category || '')
  for (const row of MISSION_TYPE_CAREERS) {
    if (!row.type.test(cat)) continue
    for (const pattern of row.careers) {
      const hit = list.find((career) => careerMatchesName(career, pattern))
      if (hit) return hit
    }
  }
  const scope = String(repScopeKey || '')
  if (/hauling|delivery/i.test(scope)) {
    const hauling = list.find((career) => careerMatchesName(career, /hauling/i))
    if (hauling) return hauling
  }
  if (scope && !/factionreputation/i.test(scope)) {
    const hit = list.find((career) => career.scopeKey === scope)
    if (hit) return hit
  }
  return null
}

function placeOnCareer(standing, target, careers) {
  if (!standing) return null
  const targetRanks = sortedRanks(target)
  const exactTarget = targetRanks.find((rank) => rank.minReputation === standing.minReputation)
  if (exactTarget) {
    return { name: exactTarget.displayName, minReputation: exactTarget.minReputation }
  }

  // This amount is a real rank on a different job line. Do not relabel it.
  for (const career of careers) {
    if (career === target) continue
    if (sortedRanks(career).some((rank) => rank.minReputation === standing.minReputation)) return null
  }

  let best = null
  for (const rank of targetRanks) {
    if (rank.minReputation > standing.minReputation) continue
    if (!best || rank.minReputation > best.minReputation) best = rank
  }
  if (!best) return { name: standing.name, minReputation: standing.minReputation }
  return { name: best.displayName, minReputation: standing.minReputation }
}

export function lookupFactionStanding(factionKey, factionStandings) {
  if (!factionKey || !factionStandings) return null
  const key = String(factionKey)
  return (
    factionStandings[key]
    || factionStandings[`factionreputation_${key}`]
    || factionStandings[key.toLowerCase()]
    || factionStandings[`factionreputation_${key.toLowerCase()}`]
    || null
  )
}

function usableRanks(standings, careerName) {
  const ranks = []
  for (const standing of standings || []) {
    const displayName = standing.displayName || standing.name
    if (!displayName || displayName.includes('PLACEHOLDER') || displayName.startsWith('@')) continue
    if (typeof standing.minReputation !== 'number' || standing.minReputation < 0) continue
    ranks.push({ displayName, minReputation: standing.minReputation, careerName })
  }
  return ranks
}

function ladderCareersForFaction(factionRow) {
  if (!factionRow) return []
  const facing = playerFacingCareers(factionRow.careers)
  const careers = Object.values(facing)
  if (careers.length > 0) return careers
  if (!factionRow.standings?.length) return []
  const name = factionRow.scopeName === 'ReputationScope_Affinity'
    ? 'Affinity'
    : (factionRow.scopeName === 'FactionReputationScope' ? 'Standing' : null)
  return [{
    name,
    scopeKey: factionRow.scopeName || null,
    standings: factionRow.standings,
  }]
}

function careerOwningAmounts(careers, amounts) {
  const numbers = amounts.filter((amount) => typeof amount === 'number')
  const meaningful = numbers.filter((amount) => amount !== 0)
  const pool = meaningful.length ? meaningful : numbers
  let best = null
  let bestScore = 0
  for (const career of careers) {
    const ranks = sortedRanks(career)
    const score = pool.filter((amount) => ranks.some((rank) => rank.minReputation === amount)).length
    const standingTie = score === bestScore && score > 0 && career.scopeKey === 'FactionReputationScope'
    if (score > bestScore || standingTie) {
      best = career
      bestScore = score
    }
  }
  return best
}

/** Put a contract on the job line that matches its mission type. */
export function alignContractStandings(minStanding, maxStanding, factionRow, { category, repScopeKey } = {}) {
  const careers = ladderCareersForFaction(factionRow)
  const missionCareer = careerForMissionType(careers, { category, repScopeKey })

  if (missionCareer) {
    const placedMin = minStanding ? placeOnCareer(minStanding, missionCareer, careers) : null
    const placedMax = maxStanding ? placeOnCareer(maxStanding, missionCareer, careers) : null
    if ((!minStanding || placedMin) && (!maxStanding || placedMax)) {
      return {
        minStanding: placedMin,
        maxStanding: placedMax,
        repScopeKey: missionCareer.scopeKey || repScopeKey || null,
        repCareerLabel: missionCareer.name || null,
      }
    }
  }

  const owner = careerOwningAmounts(careers, [minStanding?.minReputation, maxStanding?.minReputation])
    || careers.find((career) => career.scopeKey === 'FactionReputationScope')
    || (careers.length === 1 ? careers[0] : null)

  if (!owner) {
    return {
      minStanding: minStanding ? { name: minStanding.name, minReputation: minStanding.minReputation } : null,
      maxStanding: maxStanding ? { name: maxStanding.name, minReputation: maxStanding.minReputation } : null,
      repScopeKey: repScopeKey || null,
      repCareerLabel: null,
    }
  }

  const ranks = sortedRanks(owner)
  const snap = (standing) => {
    if (!standing) return null
    const exact = ranks.find((rank) => rank.minReputation === standing.minReputation)
    if (exact) return { name: exact.displayName, minReputation: exact.minReputation }
    let best = null
    for (const rank of ranks) {
      if (rank.minReputation > standing.minReputation) continue
      if (!best || rank.minReputation > best.minReputation) best = rank
    }
    return {
      name: best?.displayName || standing.name,
      minReputation: standing.minReputation,
    }
  }

  return {
    minStanding: snap(minStanding),
    maxStanding: snap(maxStanding),
    repScopeKey: owner.scopeKey || repScopeKey || null,
    repCareerLabel: owner.name || null,
  }
}

export function buildFactionContextMap(factions, factionContexts) {
  const byContextFile = {}
  for (const [contextName, context] of Object.entries(factionContexts)) {
    byContextFile[`reputationcontext_${contextName}.json`] = context
    byContextFile[contextName] = context
  }

  const factionToContext = {}
  for (const [factionKey, faction] of Object.entries(factions)) {
    const contextFile = faction.reputationContextFile
    if (!contextFile) continue
    const base = basenameFromPath(contextFile)?.replace(/\.json$/i, '') ?? contextFile
    const contextName = base.replace(/^reputationcontext_/, '')
    factionToContext[factionKey] = factionContexts[contextName] ?? byContextFile[base] ?? null
  }
  return factionToContext
}
