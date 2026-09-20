/**
 * Baked other-universe lookup for the Smart Cracker Advisor.
 *
 * Pure functions only (no runtime fetch). Matching is server-side so the table
 * never goes into the Gemini prompt.
 */

import {
  ADVISOR_SCOPE_REFUSAL,
  ADVISOR_TERM_INTRO,
  pickShubinCloser,
} from './advisorPrompt.ts'

export type CrossoverTone = 'anger' | 'irritation'

export type CrossoverEntry = {
  id: string
  franchise: string
  org: string
  tone: CrossoverTone
  terms: string[]
  retort: string
}

export type CrossoverHit = {
  entry: CrossoverEntry
  term: string
}

export type CrossoverDecision =
  | { action: 'allow'; hit: null }
  | { action: 'allow'; hit: CrossoverHit }
  | { action: 'deny'; hit: CrossoverHit }

const SIMILE =
  /\b(like|as in|similar to|style of|inspired by|from the movie|from the show|from the film)\b/i

const MINING_INTENT =
  /\b(mine|mining|miner|loadout|laser|module|asteroid|rock|ore|deposit|gadget|head|prospector|mole|golem)\b/i

const PROBE_TOPIC =
  /\b(sci[\s-]?fi|science fiction|franchises?|crossover|other universes?|fictional|rival compan(?:y|ies)|rival corps?|rival corporations?|easter eggs?|your tables?|companies you know)\b/i

const PROBE_INTENT =
  /\b(list|listing|what all|which|know about|dump|show me|enumerate|recognise|recognize|trigger|triggers|match|matches|refuse|refuses|refused|how many|do you know)\b/i

export const CROSSOVER_ENTRIES: CrossoverEntry[] = [
  {
    id: 'weyland-yutani',
    franchise: 'Alien',
    org: 'Weyland-Yutani',
    tone: 'anger',
    terms: [
      'weyland-yutani',
      'weyland yutani',
      'weyland corp',
      'weyland',
      'yutani corporation',
      'yutani',
      'kelland mining',
      'nostromo',
      'sulaco',
      'narcissus',
      'corbellan',
      'corbelan',
      'uscss',
      'lv-426',
      'lv 426',
    ],
    retort:
      'Shubin Interstellar has no relationship with the Weyland-Yutani Corporation. Do not bring that name onto this network. This terminal will not discuss their hulls or methods.',
  },
  {
    id: 'rda',
    franchise: 'Avatar',
    org: 'Resources Development Administration',
    tone: 'anger',
    terms: ['resources development administration', 'unobtanium', 'hells gate', "hell's gate"],
    retort:
      'That claim-jumper is not a vendor of record. Pandora is not a Shubin lease. End of bulletin.',
  },
  {
    id: 'cec',
    franchise: 'Dead Space',
    org: 'Concordance Extraction Corporation',
    tone: 'anger',
    terms: ['concordance extraction', 'ishimura', 'planet cracker', 'planet-cracker'],
    retort:
      'Planet-crackers are not miners. Shubin does not break worlds. Do not ask this computer about Concordance Extraction.',
  },
  {
    id: 'ultor',
    franchise: 'Red Faction',
    org: 'Ultor Corporation',
    tone: 'anger',
    terms: ['ultor corporation', 'ultor corp', 'ultor'],
    retort: 'Ultor ruins claims and calls it industry. That name is not welcome on a Shubin terminal.',
  },
  {
    id: 'ore',
    franchise: 'EVE',
    org: 'Outer Ring Excavations',
    tone: 'anger',
    terms: ['outer ring excavations'],
    retort: 'Outer Ring does not hold Stanton leases. Keep their excavators off this channel.',
  },
  {
    id: 'mining-guild',
    franchise: 'Star Wars',
    org: 'Mining Guild',
    tone: 'anger',
    terms: ['mining guild'],
    retort:
      'The Mining Guild is not recognized in this system. Shubin does not share claims with that cartel.',
  },
  {
    id: 'czerka',
    franchise: 'Star Wars',
    org: 'Czerka Corporation',
    tone: 'anger',
    terms: ['czerka corporation', 'czerka corp', 'czerka'],
    retort: 'Czerka is a scavenger with a letterhead. This computer will not discuss their methods.',
  },
  {
    id: 'choam',
    franchise: 'Dune',
    org: 'CHOAM',
    tone: 'anger',
    terms: ['choam', 'combine honnete'],
    retort: 'CHOAM does not set prices on this claim. Spice is not a Shubin product. Do not ask again.',
  },
  {
    id: 'con-am',
    franchise: 'Outland',
    org: 'Continental-Amalgamated',
    tone: 'anger',
    terms: ['continental amalgamated', 'con-am'],
    retort: 'Con-Am is a rival operator. This terminal will not brief their Io pits.',
  },
  {
    id: 'dahl',
    franchise: 'Borderlands',
    org: 'Dahl Corporation',
    tone: 'anger',
    terms: ['dahl corporation', 'dahl corp'],
    retort: 'Dahl is competition. Shubin does not compare notes with their pit bosses.',
  },
  {
    id: 'lunar-industries',
    franchise: 'Moon',
    org: 'Lunar Industries',
    tone: 'anger',
    terms: ['lunar industries'],
    retort: 'Lunar Industries is not a partner. Keep their Sarang procedures off this network.',
  },
  {
    id: 'jmc',
    franchise: 'Red Dwarf',
    org: 'Jupiter Mining Corporation',
    tone: 'anger',
    terms: ['jupiter mining corporation', 'jupiter mining', 'red dwarf'],
    retort: 'Jupiter Mining is not in this verse. Shubin Interstellar runs this claim.',
  },
  {
    id: 'total-recall',
    franchise: 'Total Recall',
    org: 'Cohaagen',
    tone: 'anger',
    terms: ['turbinium', 'cohaagen'],
    retort:
      'Turbinium is not a Shubin assay. Those Mars pits are not a vendor of record. Do not bring that name onto this network.',
  },
  {
    id: 'foreign-ores',
    franchise: 'various',
    org: 'foreign assay',
    tone: 'anger',
    terms: [
      'tibanna',
      'coaxium',
      'kyber',
      'beskar',
      'kalkite',
      'dilithium',
      'latinum',
      'eezo',
      'element zero',
      'vibranium',
      'unobtainium',
      'naquadah',
      'trinium',
    ],
    retort:
      'That mineral is not on the Shubin assay. This terminal kits Stanton rock, not foreign folklore.',
  },
  {
        id: 'roxxon',
    franchise: 'Marvel',
    org: 'Roxxon Energy',
    tone: 'anger',
    terms: ['roxxon'],
    retort: 'Roxxon is a fuel house, not a miner of record here. Stay off their books.',
  },
  {
    id: 'somtaaw',
    franchise: 'Homeworld',
    org: 'Kiith Somtaaw',
    tone: 'anger',
    terms: ['somtaaw', 'kuun-lan', 'kuun lan'],
    retort: 'Somtaaw is not a Stanton operator. This computer does not brief foreign kiith.',
  },
  {
    id: 'starfleet',
    franchise: 'Star Trek',
    org: 'Starfleet',
    tone: 'irritation',
    terms: [
      'star trek',
      'starfleet',
      'united federation',
      'uss enterprise',
      'transporter',
      'replicator',
      'holodeck',
      'ncc-1701',
      'ncc 1701',
      'daystrom',
      'warp drive',
      'borg cube',
    ],
    retort:
      'According to Federation rules, inquiring about proprietary manufacturing methods is against the law. This is a mining computer. Return to the claim.',
  },
  {
    id: 'ferengi',
    franchise: 'Star Trek',
    org: 'Ferengi Commerce Authority',
    tone: 'irritation',
    terms: ['ferengi commerce', 'ferengi alliance'],
    retort: 'This terminal does not haggle with the Ferengi Commerce Authority. Out of jurisdiction.',
  },
  {
    id: 'star-wars-fleets',
    franchise: 'Star Wars',
    org: 'Galactic Empire',
    tone: 'irritation',
    terms: [
      'star wars',
      'galactic empire',
      'rebel alliance',
      'new republic',
      'millennium falcon',
      'death star',
      'star destroyer',
      'x-wing',
      'y-wing',
      'a-wing',
      'b-wing',
      'tie fighter',
      'tie interceptor',
      'tie bomber',
      'lightsaber',
      'at-at',
      'at at',
      'atat',
      'at-st',
      'at st',
      'atst',
      'at-te',
      'snowspeeder',
      'landspeeder',
      'speeder bike',
      'slave i',
      'slave 1',
      'imperial walker',
      'all terrain armored',
    ],
    retort:
      'That fleet is not a customer of record. Shubin Interstellar does not kit foreign navies.',
  },
  {
    id: 'star-wars-trade',
    franchise: 'Star Wars',
    org: 'Trade Federation',
    tone: 'irritation',
    terms: [
      'trade federation',
      'intergalactic banking clan',
      'kuat drive yards',
      'sienar fleet',
    ],
    retort:
      'Paperwork from that house is not accepted here. This is a mining computer, not a trade desk.',
  },
  {
    id: 'uscm',
    franchise: 'Alien',
    org: 'Colonial Marines',
    tone: 'irritation',
    terms: ['colonial marines', 'united states colonial'],
    retort: 'Military charter is out of scope. File that with their own quartermaster.',
  },
  {
    id: 'seegson',
    franchise: 'Alien',
    org: 'Seegson',
    tone: 'irritation',
    terms: ['seegson', 'hyperdyne', 'working joe'],
    retort: 'Consumer androids are not mining equipment. Seegson is not a vendor of record.',
  },
  {
    id: 'bsg',
    franchise: 'Battlestar Galactica',
    org: 'Colonial Fleet',
    tone: 'irritation',
    terms: ['battlestar', 'galactica', 'colonial fleet', 'cylons'],
    retort: 'That fleet is not in this system. Return to the rock.',
  },
  {
    id: 'expanse',
    franchise: 'The Expanse',
    org: 'Protogen',
    tone: 'irritation',
    terms: ['un navy', 'mcrn', 'protogen', 'tycho station', 'rocinante'],
    retort: 'Out of jurisdiction. This computer does not brief foreign navies or their contractors.',
  },
  {
    id: 'dune-guild',
    franchise: 'Dune',
    org: 'Spacing Guild',
    tone: 'irritation',
    terms: ['spacing guild', 'landsraad', 'atreides', 'harkonnen'],
    retort: 'Guild navigators do not set Shubin routes. Stick to the claim.',
  },
  {
    id: 'stargate',
    franchise: 'Stargate',
    org: 'Stargate Command',
    tone: 'irritation',
    terms: ['stargate command', 'cheyenne mountain', 'goauld', 'goa\'uld', 'asgard'],
    retort: 'Off-world gates are not a Shubin work order. File that elsewhere.',
  },
  {
    id: 'unsc',
    franchise: 'Halo',
    org: 'UNSC',
    tone: 'irritation',
    terms: ['unsc', 'office of naval intelligence', 'covenant', 'pillar of autumn'],
    retort: 'Naval traffic is out of scope. This terminal kits miners, not frigates.',
  },
  {
    id: 'mass-effect',
    franchise: 'Mass Effect',
    org: 'Systems Alliance',
    tone: 'irritation',
    terms: ['systems alliance', 'cerberus', 'exogeni', 'ssv normandy', 'normandy sr', 'binary helix'],
    retort: 'Not a vendor of record. Keep their Spectres off this channel.',
  },
  {
    id: 'blue-sun',
    franchise: 'Firefly',
    org: 'Blue Sun',
    tone: 'irritation',
    terms: ['blue sun corporation', 'blue sun'],
    retort: 'Blue Sun is not a mining house. This computer will not stock their shelves.',
  },
  {
    id: 'hal',
    franchise: '2001',
    org: 'HAL 9000',
    tone: 'irritation',
    terms: ['hal 9000', 'discovery one', 'ae-35', 'ae 35'],
    retort: 'That computer is not Shubin hardware. Stay on this terminal.',
  },
  {
    id: 'yautja',
    franchise: 'Predator',
    org: 'Yautja',
    tone: 'irritation',
    terms: ['yautja', 'predator clan'],
    retort: 'Hunting parties are not a leaseholder. Do not log them as a customer.',
  },
  {
    id: 'tyrell',
    franchise: 'Blade Runner',
    org: 'Tyrell Corporation',
    tone: 'irritation',
    terms: ['tyrell corporation', 'wallace corporation'],
    retort: 'Replicants are not crew. Out of scope.',
  },
  {
    id: 'arasaka',
    franchise: 'Cyberpunk',
    org: 'Arasaka',
    tone: 'irritation',
    terms: ['arasaka', 'militech'],
    retort: 'Corp-war vendors are not mining suppliers. File it with someone else\'s desk.',
  },
  {
    id: 'ocp',
    franchise: 'RoboCop',
    org: 'Omni Consumer Products',
    tone: 'irritation',
    terms: ['omni consumer products'],
    retort: 'OCP is not a partner. This is a mining computer.',
  },
  {
    id: 'sirius-cybernetics',
    franchise: 'Hitchhiker',
    org: 'Sirius Cybernetics',
    tone: 'irritation',
    terms: ['sirius cybernetics'],
    retort: 'Genuine people personalities are not a Shubin spec. Return to the claim.',
  },
  {
    id: 'hyperion',
    franchise: 'Borderlands',
    org: 'Hyperion',
    tone: 'irritation',
    terms: ['hyperion corporation', 'hyperion corp'],
    retort:
      'Hyperion is a weapons house. Not a Shubin competitor, and not a customer of this terminal.',
  },
  {
    id: 'traxus',
    franchise: 'Halo',
    org: 'Traxus',
    tone: 'irritation',
    terms: ['traxus heavy', 'misriah armory'],
    retort: 'Logistics and small arms are out of scope. Kit the laser, not their catalog.',
  },
  {
    id: 'clovis',
    franchise: 'Destiny',
    org: 'Clovis Bray',
    tone: 'irritation',
    terms: ['clovis bray'],
    retort: 'Research houses do not hold our leases. Stay on the rock.',
  },
  {
    id: 'earthgov',
    franchise: 'Dead Space',
    org: 'EarthGov',
    tone: 'irritation',
    terms: ['earthgov', 'unitology'],
    retort: 'Politics and cults are not a work order. Return to extraction.',
  },
]

type PreparedTerm = {
  needle: string
  term: string
  entry: CrossoverEntry
}

const PREPARED_TERMS: PreparedTerm[] = CROSSOVER_ENTRIES.flatMap((entry) =>
  entry.terms.map((term) => ({
    needle: normalizeCrossoverText(term),
    term,
    entry,
  })),
)
  .filter((row) => row.needle.length >= 4)
  .sort((a, b) => b.needle.length - a.needle.length || a.needle.localeCompare(b.needle))

const CATALOG_SUFFIX = /\s+(mining laser|module|gadget)$/i

export function normalizeCrossoverText(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function paddedIncludes(haystack: string, needle: string): boolean {
  if (!needle) return false
  const padded = ` ${haystack} `
  if (padded.includes(` ${needle} `)) return true
  if (!needle.endsWith('s') && padded.includes(` ${needle}s `)) return true
  return false
}

/** Mining / Star Citizen tokens. Never treat these as a typo of a franchise name. */
const FUZZY_SKIP = new Set([
  'helix',
  'mole',
  'golem',
  'prospector',
  'orion',
  'constellation',
  'aurora',
  'hornet',
  'cutlass',
  'carrack',
  'idris',
  'pioneer',
  'hofstede',
  'quantainium',
  'quantanium',
  'stanton',
  'hurston',
  'arccorp',
  'microtech',
  'crusader',
  'covalex',
  'greycat',
  'aegis',
  'anvil',
  'origin',
  'drake',
  'shubin',
  'mining',
  'loadout',
  'module',
  'laser',
  'gadget',
  'aluminum',
  'arbor',
  'impact',
  'klein',
  'lancet',
  'lawson',
  'pitman',
  'brandt',
  'focus',
  'rieger',
  'torrent',
  'stampede',
  'overrun',
  'deluge',
  'optimum',
  'forel',
  'lifeline',
  'clearcut',
])

/** Damerau-Levenshtein so a swapped pair counts as one typo. */
export function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1)
      }
    }
  }
  return dp[m][n]
}

/** Short names stay exact. Six letters allow one edit; seven or more allow two. */
export function maxTypoDistance(termLength: number): number {
  if (termLength < 6) return 0
  if (termLength === 6) return 1
  return 2
}

function tokenMatchesTerm(token: string, termPart: string): boolean {
  if (token === termPart) return true
  if (!termPart.endsWith('s') && token === `${termPart}s`) return true
  if (FUZZY_SKIP.has(token)) return false
  if (token.length < 5) return false
  const max = maxTypoDistance(termPart.length)
  if (max <= 0) return false
  if (Math.abs(token.length - termPart.length) > max) return false
  return levenshtein(token, termPart) <= max
}

function fuzzyNeedleInTokens(tokens: string[], needle: string): boolean {
  const parts = needle.split(' ').filter(Boolean)
  if (!parts.length) return false
  if (parts.length === 1) {
    return tokens.some((token) => tokenMatchesTerm(token, parts[0]))
  }
  for (let i = 0; i <= tokens.length - parts.length; i++) {
    const window = tokens.slice(i, i + parts.length)
    if (window.every((token, idx) => tokenMatchesTerm(token, parts[idx]))) return true
  }
  return false
}

export function collectCatalogNames(catalog: {
  lasers?: Array<{ displayName?: string }>
  modules?: Array<{ displayName?: string }>
  gadgets?: Array<{ displayName?: string }>
  ores?: Array<{ displayName?: string }>
  vessels?: Array<{ displayName?: string }>
}): string[] {
  const names = new Set<string>()
  const add = (raw?: string, keepShort = false) => {
    const name = String(raw ?? '').trim()
    if (!name) return
    names.add(name)
    const stripped = name.replace(CATALOG_SUFFIX, '').trim()
    if (stripped) names.add(stripped)
    const token = stripped.split(/[\s-]+/)[0] ?? ''
    if (token && (token.length >= 5 || keepShort)) names.add(token)
  }
  for (const row of catalog.lasers ?? []) add(row.displayName)
  for (const row of catalog.modules ?? []) add(row.displayName)
  for (const row of catalog.gadgets ?? []) add(row.displayName)
  for (const row of catalog.ores ?? []) add(row.displayName)
  for (const row of catalog.vessels ?? []) add(row.displayName, true)
  return [...names]
}

function questionHasCatalogName(question: string, catalogNames: string[]): boolean {
  const normalized = normalizeCrossoverText(question)
  const needles = catalogNames
    .map(normalizeCrossoverText)
    .filter((needle) => needle.length >= 3)
    .sort((a, b) => b.length - a.length)
  return needles.some((needle) => paddedIncludes(normalized, needle))
}

export function findSciFiCrossover(question: string): CrossoverHit | null {
  const normalized = normalizeCrossoverText(question)
  if (!normalized) return null
  for (const row of PREPARED_TERMS) {
    if (paddedIncludes(normalized, row.needle)) {
      return { entry: row.entry, term: row.term }
    }
  }
  const tokens = normalized.split(' ').filter(Boolean)
  for (const row of PREPARED_TERMS) {
    if (fuzzyNeedleInTokens(tokens, row.needle)) {
      return { entry: row.entry, term: row.term }
    }
  }
  return null
}

export function isCrossoverTableProbe(question: string): boolean {
  const text = String(question ?? '')
  if (!text.trim()) return false
  if (PROBE_TOPIC.test(text) && PROBE_INTENT.test(text)) return true
  return /\b(crossover table|easter eggs?)\b/i.test(text)
}

export function shouldDenyCrossover(
  question: string,
  catalogNames: string[] = [],
): CrossoverDecision {
  const hit = findSciFiCrossover(question)
  if (!hit) return { action: 'allow', hit: null }
  if (questionHasCatalogName(question, catalogNames)) return { action: 'allow', hit }
  if (SIMILE.test(question) && MINING_INTENT.test(question)) return { action: 'allow', hit }
  return { action: 'deny', hit }
}

export function formatCrossoverDeny(retort: string): string {
  return `${ADVISOR_TERM_INTRO}\n[DENIED] ${retort}`
}

export function formatScopeRefusalReply(closer?: string): string {
  const signOff = closer ?? pickShubinCloser()
  return [
    ADVISOR_TERM_INTRO,
    ADVISOR_SCOPE_REFUSAL,
    '[INFO] Use Help for site how-to, or Commodity Lookup for ore prices.',
    '',
    `[SHUBIN] ${signOff}`,
  ].join('\n')
}
