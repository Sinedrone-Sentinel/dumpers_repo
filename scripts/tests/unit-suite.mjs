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
  'src/lib/blueprintTaxonomy.ts',
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

const diffMod = await import(pathToFileURL(path.join(root, 'scripts/lib/diffGameData.mjs')).href)
const digestMod = await import(pathToFileURL(path.join(root, 'scripts/lib/writeWhatsNewDigest.mjs')).href)
const wikeloSpec = { path: 'trades', key: 'id', category: 'Wikelo', label: (r) => r.title }
const nfrOld = {
  trades: [
    { id: 'heavy', title: 'Heavy and Bright', notForRelease: true, rewards: [] },
    { id: 'gun', title: 'Too Much Gun', notForRelease: true },
    { id: 'nfr-new-stay', title: 'Still NFR', notForRelease: true },
  ],
}
const nfrNew = {
  trades: [
    { id: 'heavy', title: 'Heavy and Bright', notForRelease: false, rewards: [{ name: 'BUL-H4 Helmet' }] },
    { id: 'gun', title: 'Too Much Gun', notForRelease: false },
    { id: 'nfr-new-stay', title: 'Still NFR', notForRelease: true, rewards: [{ name: 'placeholder' }] },
    { id: 'brand-nfr', title: 'Brand new NFR', notForRelease: true },
    { id: 'brand-live', title: 'Brand new live', notForRelease: false },
  ],
}
const nfrDiff = diffMod.diffKeyedCollection(wikeloSpec, nfrOld, nfrNew)
check(
  nfrDiff.added.some((a) => a.rec.title === 'Heavy and Bright') &&
    nfrDiff.added.some((a) => a.rec.title === 'Too Much Gun') &&
    nfrDiff.added.some((a) => a.rec.title === 'Brand new live'),
  'NFR last patch that ships this patch is added; new live is added'
)
check(
  !nfrDiff.added.some((a) => a.rec.notForRelease === true) &&
    !nfrDiff.changed?.some((c) => c.rec.title === 'Heavy and Bright') &&
    !nfrDiff.changed?.some((c) => c.rec.title === 'Still NFR'),
  'NFR never added; released-from-NFR and still-NFR are not changed'
)
const bpSpec = { path: 'blueprints', key: 'internalName', category: 'Blueprints', label: (r) => r.blueprintName }
const bpDiff = diffMod.diffKeyedCollection(
  bpSpec,
  { blueprints: [{ internalName: 'wip', blueprintName: 'WIP Cooler', entityClass: null }] },
  { blueprints: [{ internalName: 'wip', blueprintName: 'WIP Cooler', entityClass: 'cool_s04' }] }
)
check(bpDiff.added.some((a) => a.key === 'wip') && !(bpDiff.changed || []).length, 'null entityClass then wired is added')
const nfrEntries = digestMod.buildWhatsNewEntriesFromDiff(
  { collections: [nfrDiff] },
  { resolve: (key) => key }
)
const addedWikelo = nfrEntries.find((e) => e.category === 'Wikelo' && e.action === 'added')
check(
  addedWikelo?.items.every((i) => i.label !== 'Brand new NFR' && i.label !== 'Still NFR'),
  'digest omits NFR from added'
)

const taxonomy = await import(pathToFileURL(path.join(outDir, 'blueprintTaxonomy.mjs')).href)
const carnifexTags = taxonomy.getBlueprintDisplayTags({
  categoryName: 'FPSArmours',
  internalName: 'gys_jacket_01_01_01',
  blueprintName: 'Carnifex Armor Core',
  armorSlot: 'core',
  armorWeight: 'medium',
  subtype: 'standard',
})
check(
  carnifexTags.some((t) => t.label === 'Medium') &&
    carnifexTags.some((t) => t.label === 'Core') &&
    !carnifexTags.some((t) => t.label === 'Combat Clothing') &&
    !carnifexTags.some((t) => t.label === 'Jacket'),
  'Carnifex (gys_jacket + medium weight) is Medium Core, not Combat Clothing'
)
const bellatorTags = taxonomy.getBlueprintDisplayTags({
  categoryName: 'FPSArmours',
  internalName: 'hdtc_jacket_01_01_01',
  blueprintName: 'Bellator Jacket',
  armorSlot: 'core',
  armorWeight: null,
  subtype: 'undersuit',
})
check(
  bellatorTags.some((t) => t.label === 'Combat Clothing') &&
    bellatorTags.some((t) => t.label === 'Jacket') &&
    !bellatorTags.some((t) => t.label === 'Core'),
  'Bellator jacket stays Combat Clothing, not Core plate'
)
check(taxonomy.getCombatClothingGarment({
  categoryName: 'FPSArmours',
  internalName: 'gys_pants_01_01_01',
  armorWeight: 'medium',
  armorSlot: 'legs',
}) === null, 'Carnifex pants with armorWeight are not a garment')
check(taxonomy.getCombatClothingGarment({
  categoryName: 'FPSArmours',
  internalName: 'hdtc_pants_01_01_01',
  armorWeight: null,
}) === 'pants', 'Bellator trousers stay a garment')

console.log(`Unit tests: ${pass} passed`)
