/**
 * Lightweight unit suite for pure lib helpers (bundled via esbuild).
 * Invoked from scripts/run-tests.mjs — not meant to be run alone without build.
 */
import assert from 'node:assert/strict'
import * as esbuild from 'esbuild'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '../..')
const outDir = path.join(root, 'node_modules/.cache/unit-tests')

const modules = [
  'src/lib/blueprintSeoSlug.ts',
  'src/lib/listingType.ts',
  'src/lib/liveMissionTracker.ts',
]

console.log('Unit tests: bundling modules...')
for (const mod of modules) {
  const name = path.basename(mod, '.ts')
  await esbuild.build({
    entryPoints: [path.join(root, mod)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: path.join(outDir, `${name}.mjs`),
    packages: 'external',
  })
}

const slug = await import(pathToFileURL(path.join(outDir, 'blueprintSeoSlug.mjs')).href)
const listing = await import(pathToFileURL(path.join(outDir, 'listingType.mjs')).href)

let pass = 0
function check(cond, message) {
  assert.ok(cond, message)
  pass += 1
}

check(slug.slugifyBlueprintLabel('P4-AR Rifle') === 'p4-ar-rifle', 'slugify kebab-case')
check(slug.slugifyBlueprintLabel('') === 'blueprint', 'slugify empty → blueprint')
check(slug.hasBlueprintSeoEntity({ entityClass: 'Foo' }) === true, 'has entityClass')
check(slug.hasBlueprintSeoEntity({ entityClass: null }) === false, 'null entityClass hidden from SEO')
check(slug.blueprintSeoPath('p4-ar-rifle') === '/blueprints/p4-ar-rifle/', 'SEO path')

const map = slug.buildBlueprintSeoSlugMap([
  { blueprintName: 'Same Name', internalName: 'a_item', entityClass: 'A' },
  { blueprintName: 'Same Name', internalName: 'b_item', entityClass: 'B' },
  { blueprintName: 'No Entity', internalName: 'c_item', entityClass: null },
])
check(map.size === 2, 'SEO map skips null entityClass')
check(map.get('a_item') !== map.get('b_item'), 'colliding names get unique slugs')

const wtb = {
  listing_type: 'wtb',
  status: 'pending',
  requester_id: 'buyer',
  assignee_id: null,
  source_listing_id: null,
}
const wts = {
  listing_type: 'wts',
  status: 'pending',
  requester_id: 'seller',
  assignee_id: null,
  source_listing_id: null,
}
check(listing.orderListingType(wtb) === 'wtb', 'default listing type WTB')
check(listing.orderListingType(wts) === 'wts', 'WTS listing type')
check(listing.isListingContainer(wtb) === true, 'pending root is listing container')
check(listing.isSemanticBuyer(wtb, 'buyer') === true, 'WTB requester is buyer')
check(listing.isSemanticSeller(wts, 'seller') === true, 'WTS requester is seller')
check(listing.listingTypeLabel('wts') === 'WTS', 'label WTS')

const pools = await import(pathToFileURL(path.join(root, 'scripts/lib/contractBlueprintPools.mjs')).href)
const soo2 = {
  debugName: 'SOO2',
  template: 'file://./contracts/contracttemplates/soo2.json',
  contractResults: {
    contractResults: [
      {
        _Type_: 'BlueprintRewards',
        chance: 1,
        blueprintPool: 'file://./bp_missionreward_superheavy.json',
      },
    ],
  },
}
const soo2Variant = {
  debugName: 'SOO2_Intro',
  template: 'file://./soo2_intro.json',
  contractResults: { contractResults: [] },
}
const mixedEmpty = {
  debugName: 'FoxwellEnforcement_Mercenary_Intro',
  template: 'file://./foxwell_intro.json',
  contractResults: { contractResults: [] },
}
const mixedA = {
  debugName: 'FoxwellEnforcement_Ambush',
  template: 'file://./ambush.json',
  contractResults: {
    contractResults: [
      {
        _Type_: 'BlueprintRewards',
        chance: 1,
        blueprintPool: 'file://./bp_missionreward_foxwell_a.json',
      },
    ],
  },
}
const mixedB = {
  debugName: 'FoxwellEnforcement_Defend',
  template: 'file://./defend.json',
  contractResults: {
    contractResults: [
      {
        _Type_: 'BlueprintRewards',
        chance: 1,
        blueprintPool: 'file://./bp_missionreward_foxwell_b.json',
      },
    ],
  },
}

const sooIndexes = pools.buildSiblingPoolIndexes([soo2, soo2Variant])
const sooInherited = pools.inheritSiblingBlueprintPools(soo2Variant, sooIndexes)
check(sooInherited.length === 1 && sooInherited[0].key === 'superheavy', 'Orison variant inherits Retake superheavy pool')
check(pools.inheritSiblingBlueprintPools(soo2, sooIndexes)[0].key === 'superheavy', 'Retake keeps its own pool')

const mixedIndexes = pools.buildSiblingPoolIndexes([mixedEmpty, mixedA, mixedB])
check(
  pools.inheritSiblingBlueprintPools(mixedEmpty, mixedIndexes).length === 0,
  'mixed generator does not union sibling pools onto an unmatched variant'
)

const lookupMod = await import(pathToFileURL(path.join(root, 'scripts/lib/blueprintNameLookup.mjs')).href)
const lookup = lookupMod.buildBlueprintNameLookup(
  [{ internalName: 'cds_combat_superheavy_suit_01_01_01', blueprintName: 'ADP Suit', categoryName: 'Armor' }],
  {
    contracts: [
      {
        id: '593a375f-1344-4eea-a8cb-caf3acbd9fb5',
        debugName: 'SOO2_Intro',
        title: 'Orison Platforms Under Attack',
        displayTitle: 'Orison Platforms Under Attack',
        blueprintPools: [{ key: 'superheavy' }],
      },
    ],
  },
  {
    superheavy: [{ name: 'cds_combat_superheavy_suit_01_01_01' }],
  }
)
check(
  lookup.byContractDefinitionId['orison platforms under attack']?.includes(
    'cds_combat_superheavy_suit_01_01_01'
  ),
  'lookup indexes accept title for live tracker'
)

const live = await import(pathToFileURL(path.join(outDir, 'liveMissionTracker.mjs')).href)
const view = live.computeLiveTrackerView(
  [
    {
      user_id: 'u',
      mission_guid: '1',
      contract_definition_id: null,
      debug_name: 'Orison Platforms Under Attack',
      started_at: '',
    },
    {
      user_id: 'u',
      mission_guid: '2',
      contract_definition_id: null,
      debug_name: 'A Call To Arms',
      started_at: '',
    },
  ],
  {}
)
const orisonRow = view.missions.find((m) => m.title.includes('Orison'))
const callRow = view.missions.find((m) => m.title.includes('Call To Arms'))
check(orisonRow?.hasBlueprintPool === true, 'Orison live row has a blueprint pool')
check(orisonRow?.remainingCount === 3, 'Orison live row lists 3 unacquired blueprints')
check(callRow?.hasBlueprintPool === false, 'A Call To Arms has no blueprint pool')
check(view.remaining.length === 3, 'remaining list is the 3 Orison pool blueprints')

console.log(`Unit tests: ${pass} passed`)
