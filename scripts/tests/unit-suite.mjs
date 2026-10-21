/**
 * Lightweight unit suite for pure lib helpers (bundled via esbuild).
 * Invoked from scripts/run-tests.mjs — not meant to be run alone without build.
 */
import assert from 'node:assert/strict'
import * as esbuild from 'esbuild'
import { readFileSync } from 'node:fs'
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
  'src/lib/blueprintCategoryTags.ts',
  'src/lib/qualityModifiers.ts',
  'src/lib/inAppBrowser.ts',
  'src/lib/oauthReturn.ts',
  'src/lib/friendInvite.ts',
  'src/lib/canonicalizeBlueprintId.ts',
  'src/lib/miningAdvisorCrypto.ts',
  'src/lib/bazaarStockDeduct.ts',
  'src/lib/miningLocationAliases.ts',
  'src/lib/miningClusterProfiles.ts',
  'src/lib/miningSignatures.ts',
  'supabase/functions/mining-loadout-advisor/gearShopLookup.ts',
  'supabase/functions/mining-loadout-advisor/advisorPrompt.ts',
  'supabase/functions/mining-loadout-advisor/sciFiCrossover.ts',
  'supabase/functions/site-help-bot/helpPrompt.ts',
  'src/lib/aiChatUsage.ts',
  'src/lib/shubinTerminalReply.ts',
  'src/lib/stockCardListing.ts',
  'src/lib/inventoryStock.ts',
  'src/lib/wtbScuRange.ts',
  'src/lib/blueprintEffectiveStats.ts',
  'src/config/dfp.ts',
  'src/config/resourceTypes.ts',
  'src/lib/qualityBands.ts',
  'src/lib/bpWishlistDemand.ts',
  'src/lib/missionDisplay.ts',
  'src/lib/notepadText.ts',
  'src/lib/miningLoadoutStats.ts',
  'src/lib/shipShopMath.ts',
  'src/lib/shipShopShops.ts',
  'src/lib/blueprintQuality.ts',
  'src/lib/canCraft.ts',
  'src/lib/craftFromStock.ts',
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
const quality = await import(pathToFileURL(path.join(outDir, 'qualityModifiers.mjs')).href)
const iab = await import(pathToFileURL(path.join(outDir, 'inAppBrowser.mjs')).href)
const oauthReturn = await import(pathToFileURL(path.join(outDir, 'oauthReturn.mjs')).href)
const friendInvite = await import(pathToFileURL(path.join(outDir, 'friendInvite.mjs')).href)
const relink = await import(pathToFileURL(path.join(outDir, 'canonicalizeBlueprintId.mjs')).href)
const advisorCrypto = await import(pathToFileURL(path.join(outDir, 'miningAdvisorCrypto.mjs')).href)
const bazaarDeduct = await import(pathToFileURL(path.join(outDir, 'bazaarStockDeduct.mjs')).href)
const miningAliases = await import(pathToFileURL(path.join(outDir, 'miningLocationAliases.mjs')).href)
const miningChips = await import(pathToFileURL(path.join(outDir, 'miningClusterProfiles.mjs')).href)
const miningSignatures = await import(pathToFileURL(path.join(outDir, 'miningSignatures.mjs')).href)
const gearShop = await import(pathToFileURL(path.join(outDir, 'gearShopLookup.mjs')).href)
const advisorPrompt = await import(pathToFileURL(path.join(outDir, 'advisorPrompt.mjs')).href)
const sciFiCrossover = await import(pathToFileURL(path.join(outDir, 'sciFiCrossover.mjs')).href)
const helpPrompt = await import(pathToFileURL(path.join(outDir, 'helpPrompt.mjs')).href)
const aiUsage = await import(pathToFileURL(path.join(outDir, 'aiChatUsage.mjs')).href)
const shubinTerm = await import(pathToFileURL(path.join(outDir, 'shubinTerminalReply.mjs')).href)
const stockCardListing = await import(pathToFileURL(path.join(outDir, 'stockCardListing.mjs')).href)
const inventoryStock = await import(pathToFileURL(path.join(outDir, 'inventoryStock.mjs')).href)
const wtbScuRange = await import(pathToFileURL(path.join(outDir, 'wtbScuRange.mjs')).href)
const effectiveStats = await import(pathToFileURL(path.join(outDir, 'blueprintEffectiveStats.mjs')).href)

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

check(
  live.sanitizeLiveMissionRawLabel('Jorrit Dossier: Updated Security Data [bp]') ===
    'Jorrit Dossier: Updated Security Data',
  'sanitize strips trailing [bp] accept tag'
)
check(
  live.parseLiveMissionLabel('Jorrit Dossier: Updated Security Data [bp]').title ===
    'Jorrit Dossier: Updated Security Data',
  'parse title drops [bp] before catalog match'
)
check(
  live.sanitizeLiveMissionRawLabel('<b>Jorrit Dossier: Updated Security Data</b>') ===
    'Jorrit Dossier: Updated Security Data',
  'sanitize keeps inner text from simple markup'
)
const nestedMarkup = live.sanitizeLiveMissionRawLabel(
  '<scr<script>ipt>alert(1)</script>Jorrit Dossier: Updated Security Data'
)
check(
  !nestedMarkup.toLowerCase().includes('<script') &&
    !nestedMarkup.includes('<') &&
    !nestedMarkup.includes('>') &&
    nestedMarkup.includes('Jorrit Dossier: Updated Security Data'),
  'sanitize cannot leave a script tag or angle brackets'
)
check(
  live.sanitizeLiveMissionRawLabel('Jorrit Dossier<script') === 'Jorrit Dossier',
  'sanitize drops an unclosed angle-bracket tail'
)

const missionCatalog = JSON.parse(
  readFileSync(path.join(root, 'src/data/game-blueprint-missions.json'), 'utf8')
)
const asd2bNames = (missionCatalog.missionBlueprints.asd2b || []).map((item) =>
  String(item.name || '').toLowerCase()
)
check(asd2bNames.length === 12, 'Updated Security Data catalog pool is 12 blueprints')

const jorritBpView = live.computeLiveTrackerView(
  [
    {
      user_id: 'u',
      mission_guid: 'jorrit-bp',
      contract_definition_id: null,
      debug_name: 'Jorrit Dossier: Updated Security Data [bp]',
      started_at: '',
    },
  ],
  {}
)
const jorritRow = jorritBpView.missions[0]
check(jorritRow?.hasBlueprintPool === true, 'Jorrit [bp] accept title resolves a blueprint pool')
check(
  jorritRow?.remainingCount === asd2bNames.length,
  'Jorrit [bp] remaining count matches Browse catalog pool'
)
check(
  asd2bNames.every((name) => jorritBpView.remaining.some((row) => row.internalName === name)),
  'Jorrit [bp] remaining list is the same 12 catalog names as Browse'
)
check(
  /hockrow agency/i.test(jorritRow?.displayLabel || ''),
  'Jorrit [bp] display uses catalog faction label'
)

const acquiredName = asd2bNames[0]
const jorritAcquiredView = live.computeLiveTrackerView(
  [
    {
      user_id: 'u',
      mission_guid: 'jorrit-bp',
      contract_definition_id: null,
      debug_name: 'Jorrit Dossier: Updated Security Data [bp]',
      started_at: '',
    },
  ],
  { [acquiredName]: true }
)
check(
  jorritAcquiredView.missions[0]?.remainingCount === asd2bNames.length - 1,
  'Jorrit [bp] remaining drops by one when a pool id is acquired'
)
check(
  !jorritAcquiredView.remaining.some((row) => row.internalName === acquiredName),
  'acquired pool blueprint is omitted from Remaining to acquire'
)

const labView = live.computeLiveTrackerView(
  [
    {
      user_id: 'u',
      mission_guid: 'lab',
      contract_definition_id: null,
      debug_name: 'Jorrit Dossier: Lab Sample',
      started_at: '',
    },
  ],
  {}
)
check(
  labView.missions[0]?.hasBlueprintPool === false && labView.remaining.length === 0,
  'unknown Lab Sample title does not invent a blueprint pool'
)

const refuelView = live.computeLiveTrackerView(
  [
    {
      user_id: 'u',
      mission_guid: 'iasi-refuel',
      contract_definition_id: '0990d89e-ff98-4919-9081-5562b2935734',
      debug_name: 'RSI Disc. Month: Critical Refuel Request (Crusader Ares Star Fighter Ion)',
      started_at: '',
    },
  ],
  {}
)
const refuelLabels = (refuelView.missions[0]?.rewards ?? []).map((r) => r.label)
check(
  refuelLabels.includes('+271 Transport') && refuelLabels.includes('+271 Personal'),
  'RSI Discovery refuel (sub-contract id) shows Transport and Personal event points'
)
check(refuelView.missions[0]?.hasBlueprintPool === false, 'RSI Discovery refuel has no blueprint pool')

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

const weaponLabel = (rec) => rec.displayName
const bpTagEntries = digestMod.buildWhatsNewEntriesFromDiff(
  {
    collections: [
      {
        category: 'FPS Weapons',
        label: weaponLabel,
        added: [
          { key: 'gmni_lmg_ballistic_01_collector02', rec: { name: 'gmni_lmg_ballistic_01_collector02', displayName: 'F55 LMG' } },
          { key: 'grin_tractor_01_IASI', rec: { name: 'grin_tractor_01_IASI', displayName: 'MaxLift-II Tractor Beam' } },
        ],
        removed: [],
        changed: [],
      },
    ],
  },
  { resolve: (key) => key, blueprintEntityClasses: new Set(['gmni_lmg_ballistic_01_collector02']) }
)
const bpTagLabels = bpTagEntries.find((e) => e.category === 'FPS Weapons')?.items.map((i) => i.label) ?? []
check(
  bpTagLabels.includes('F55 LMG (Blueprint)') && bpTagLabels.includes('MaxLift-II Tractor Beam'),
  'digest tags craftable items as (Blueprint) and leaves plain items alone'
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

const seoDisplay = await import(
  pathToFileURL(path.join(root, 'scripts/lib/blueprintSeoDisplay.mjs')).href
)
check(
  seoDisplay.seoMaterialLabel({
    itemName: 'harvestable_mineral_1h_sadaryx',
    displayName: 'Sadaryx',
    entityName: 'Sadaryx',
  }) === 'Sadaryx',
  'SEO material prefers displayName over itemName'
)
check(
  seoDisplay.seoMaterialAmount({ quantity: 4, itemName: 'harvestable_mineral_1h_sadaryx' }) ===
    '4 items',
  'SEO material uses item quantity'
)
check(
  seoDisplay.seoMaterialAmount({ standardCargoUnits: 0.04, resourceName: 'Iron' }) === '0.04 SCU',
  'SEO material keeps SCU for resources'
)
check(
  seoDisplay.cleanSeoMissionTitle(
    'Citizens For Prosperity: Disable Outlaw Stronghold at ~mission(Location)'
  ) === 'Citizens For Prosperity: Disable Outlaw Stronghold',
  'SEO mission title strips ~mission() and trailing at'
)
check(
  seoDisplay.looksInternalSeoLabel('harvestable_mineral_1h_sadaryx') === true,
  'internal harvestable label detected'
)
check(seoDisplay.looksInternalSeoLabel('Sadaryx') === false, 'display name is not internal')

check(quality.formatMitigationPercent(0.6) === '40.000%', 'heavy 0.6 taken → 40.000% mitigated')
check(quality.formatMitigationPercent(0.8) === '20.000%', 'light 0.8 taken → 20.000% mitigated')
check(quality.formatMitigationPercent(0.125) === '87.500%', 'super-heavy 0.125 taken → 87.500% mitigated')
check(
  quality.formatMitigationPercent(quality.applyArmorMitigationBonus(0.6, 0.46)) === '40.460%',
  'heavy 40.000% + 0.46% bonus → 40.460% mitigated'
)
check(
  quality.formatMitigationPercent(quality.applyArmorMitigationBonus(0.6, 0.69)) === '40.690%',
  'heavy 40.000% + 0.69% bonus → 40.690% mitigated'
)
check(
  quality.formatStatValue(quality.applyArmorMitigationBonus(0.6, 0.69), 'Armor_Damagemitigation') ===
    '40.690%',
  'FINAL display adds bonus to blocked percent'
)
check(quality.formatModifierPercent(1.0069) === '+0.690%', 'bonus percent shows 3 decimals')
check(quality.formatPercentChange(0.6864123) === '+0.686%', 'bonus rounds to 3 decimals')
check(
  quality.formatMitigationPercent(quality.applyArmorMitigationBonus(0.6, 0.6864123)) === '40.686%',
  'FINAL uses the same 3-decimal bonus as the displayed +0.686%'
)
check(
  quality.formatAggregatedModifierDisplay({
    property: 'Armor_Damagemitigation',
    propertyLabel: 'Damage Mitigation',
    combinedModifier: 1.006864123,
    percentChange: 0.6864123,
  }) === '+0.686%',
  'combined bonus uses 3-decimal percentChange, not 2-decimal combinedModifier'
)
check(
  quality.formatStatValue(0.6, 'Armor_Damagemitigation') === '40.000%',
  'formatStatValue uses mitigation % for armor key'
)
check(
  quality.formatStatValue(0.6, 'Damage Mitigation') === '40.000%',
  'formatStatValue uses mitigation % for armor label'
)
check(
  !quality.formatStatValue(26800, 'Armor_Radiationcapacity').includes('%'),
  'non-armor stats keep numeric format, not mitigation %'
)

check(
  iab.detectInAppBrowser(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 [FBAN/FBIOS;FBAV/1.0]'
  ).inApp === true,
  'Facebook iOS is an in-app browser'
)
check(
  iab.detectInAppBrowser(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
  ).inApp === false,
  'Safari is not an in-app browser'
)
check(
  iab.detectInAppBrowser('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Instagram 300.0.0').inApp ===
    true,
  'Instagram Android is an in-app browser'
)
check(iab.systemBrowserButtonLabel('Mozilla/5.0 (Linux; Android 14)') === 'Open in Chrome', 'Android Chrome label')
check(iab.systemBrowserButtonLabel('Mozilla/5.0 (iPhone)') === 'Open in Safari', 'iOS Safari label')
check(
  iab.buildSystemBrowserUrl('https://dumpers-repo.com/#sign-in', 'iPhone FBAN').startsWith('x-safari-https://'),
  'iOS uses x-safari-https'
)
check(
  iab.buildSystemBrowserUrl('https://dumpers-repo.com/', 'Android Instagram').startsWith('intent://'),
  'Android uses intent URL'
)
check(oauthReturn.isOAuthReturnUrl('?code=abc', '') === true, 'PKCE code is an OAuth return')
check(oauthReturn.isOAuthReturnUrl('', '#access_token=x') === true, 'implicit hash is an OAuth return')
check(oauthReturn.isOAuthReturnUrl('?error=access_denied', '') === true, 'OAuth error is an OAuth return')
check(oauthReturn.isOAuthReturnUrl('', '') === false, 'plain URL is not an OAuth return')
check(
  oauthReturn.stripOAuthReturnParams('https://dumpers-repo.com/?code=abc&state=1&friendInvite=tok') ===
    '/?friendInvite=tok',
  'strip OAuth params keeps friendInvite'
)
check(oauthReturn.stripOAuthReturnParams('https://dumpers-repo.com/#access_token=x') === '/', 'strip OAuth hash')
check(
  friendInvite.buildOAuthRedirectTo('https://dumpers-repo.com') === 'https://dumpers-repo.com/auth/callback',
  'OAuth return uses /auth/callback'
)

const catalog = new Set(['cool_tydt_s02_heatsink', 'bp_hrst_laserscattergun_s2', 'hrst_laserrepeater_s2'])
const strip = relink.exactRelinkBlueprintId('cool_tydt_s02_heatsink_scitem', catalog)
check(strip.ok === true && strip.canon === 'cool_tydt_s02_heatsink' && strip.rule === 'strip_scitem', 'strip _scitem')
const prefix = relink.exactRelinkBlueprintId('hrst_laserscattergun_s2', catalog)
check(prefix.ok === true && prefix.canon === 'bp_hrst_laserscattergun_s2' && prefix.rule === 'add_bp_prefix', 'add unique bp_ prefix')
const keep = relink.exactRelinkBlueprintId('hrst_laserrepeater_s2', catalog)
check(keep.ok === true && keep.canon === 'hrst_laserrepeater_s2' && keep.rule === 'exact', 'leave exact catalog id')
const unknown = relink.exactRelinkBlueprintId('not_a_real_blueprint', catalog)
check(unknown.ok === false && unknown.rule === 'unknown', 'unknown id is not guessed')
const unknownScitem = relink.exactRelinkBlueprintId('not_a_real_blueprint_scitem', catalog)
check(unknownScitem.ok === false && unknownScitem.rule === 'unknown', 'unknown _scitem is not stripped without a catalog hit')
const noPrefixGuess = relink.exactRelinkBlueprintId('cool_tydt_s02_heatsink', catalog)
check(
  noPrefixGuess.ok === true && noPrefixGuess.canon === 'cool_tydt_s02_heatsink' && noPrefixGuess.rule === 'exact',
  'does not add bp_ when the unprefixed id is already in the catalog'
)

const advisorCatalogLib = await import(
  pathToFileURL(path.join(root, 'scripts/lib/miningAdvisorCatalog.mjs')).href
)
const gameMining = JSON.parse(readFileSync(path.join(root, 'src/data/game-mining.json'), 'utf8'))
const advisorCatalog = advisorCatalogLib.buildMiningAdvisorCatalog(gameMining)
advisorCatalogLib.assertAdvisorCatalogShape(advisorCatalog)
check(
  !JSON.stringify(advisorCatalog.lasers).includes('Mining_Laser_'),
  'advisor catalog lasers use display names only',
)
check(
  advisorCatalog.ores.every((ore) => !String(ore.displayName).startsWith('Ore_')),
  'advisor catalog ores use display names',
)
check(advisorCatalog.gadgets.length >= 4, 'advisor catalog includes gadgets')
const lancetMh1 = advisorCatalog.lasers.find((l) => l.displayName === 'Lancet MH1 Mining Laser')
check(lancetMh1?.slots === 1, 'Lancet MH1 catalog has one module port')
const helix2 = advisorCatalog.lasers.find((l) => l.displayName === 'Helix II Mining Laser')
check(helix2?.slots === 3, 'Helix II catalog has three module ports')
check(
  advisorCatalog.vessels.some((v) => v.displayName === 'Prospector' && v.laserHardpoints === 1 && v.laserSize === 1),
  'catalog includes Prospector hardpoints',
)

// --- UEX gear shop index (where-to-buy for mining gear) ---------------------
const gearShopsRaw = JSON.parse(
  readFileSync(path.join(root, 'src/data/mining-gear-shops.json'), 'utf8'),
)
const builtShops = advisorCatalogLib.buildAdvisorGearShops(advisorCatalog, gearShopsRaw)
advisorCatalogLib.assertAdvisorGearShopsShape(builtShops.payload)

const shippedShops = JSON.parse(
  readFileSync(path.join(root, 'supabase/functions/mining-loadout-advisor/shops.json'), 'utf8'),
)
check(
  JSON.stringify(shippedShops) === JSON.stringify(builtShops.payload),
  'shipped shops.json matches a fresh build (run npm run copy-mining-advisor-catalog)',
)
check(
  !JSON.stringify(advisorCatalogLib.stripCatalogUuids(advisorCatalog)).includes('uuid'),
  'advisor prompt catalog carries no uuids',
)
check(!JSON.stringify(shippedShops).includes('uuid'), 'shipped gear shops carry no uuids')

const hofstede = shippedShops.items.find((i) => i.displayName === 'Hofstede-S2 Mining Laser')
const hofstedeSystems = new Set(
  hofstede.listings.map((l) => shippedShops.terminals.find((t) => t.id === l.t)?.system),
)
check(hofstede.listings.length >= 10, 'Hofstede-S2 keeps every known terminal, not a sample')
check(
  hofstedeSystems.has('Stanton') && hofstedeSystems.has('Pyro') && hofstedeSystems.has('Nyx'),
  'Hofstede-S2 buy locations span every system UEX lists',
)
check(
  hofstede.listings.every((l, i) => i === 0 || l.buy >= hofstede.listings[i - 1].buy),
  'gear listings are cheapest first',
)
check(
  shippedShops.items.some((i) => i.displayName === 'Arbor MH1 Mining Laser' && i.listings.length),
  'Arbor MH1 resolves by display name when UEX files it under a variant uuid',
)
check(
  shippedShops.items.some((i) => i.displayName === 'Clearcut Module' && i.listings.length === 0),
  'gear UEX has no seller for stays in the index with zero listings',
)

const buyHofstede = gearShop.resolveGearShopMatches(
  shippedShops,
  'where can I buy the hofstede-s2?',
)
check(
  buyHofstede.length === 1 && buyHofstede[0].displayName === 'Hofstede-S2 Mining Laser',
  'buy question resolves the named head',
)
const buyHelix2 = gearShop.resolveGearShopMatches(shippedShops, 'cheapest place for a helix 2')
check(
  buyHelix2.length === 1 && buyHelix2[0].displayName === 'Helix II Mining Laser',
  'Helix 2 resolves to Helix II, not the Helix I substring',
)
check(
  gearShop.resolveGearShopMatches(shippedShops, 'is the hofstede-s2 good for quantainium?')
    .length === 0,
  'advice questions do not pull in shop data',
)
check(
  gearShop.resolveGearShopMatches(shippedShops, 'where can I buy ammo and a new helmet?')
    .length === 0,
  'non-mining shopping questions match nothing',
)
const buyEquipped = gearShop.resolveGearShopMatches(shippedShops, 'where do I buy these?', [
  'Hofstede-S2 Mining Laser',
  'Rieger-C3 Module',
])
check(
  buyEquipped.length === 2 && buyEquipped[0].displayName === 'Hofstede-S2 Mining Laser',
  'unnamed buy question falls back to equipped gear',
)

const shopBlock = gearShop.renderGearShopBlock(shippedShops, buyHofstede)
check(shopBlock.includes('Powered by UEX'), 'shop block credits UEX')
check(shopBlock.includes('Tammany and Sons'), 'shop block names real terminals')
check(shopBlock.includes('21,613 aUEC'), 'shop block formats aUEC prices')
check(/Stanton:/.test(shopBlock) && /Pyro:/.test(shopBlock), 'shop block groups by system')
check(gearShop.renderGearShopBlock(shippedShops, []) === '', 'no matches renders no block')
const unsoldBlock = gearShop.renderGearShopBlock(
  shippedShops,
  shippedShops.items.filter((i) => i.displayName === 'Clearcut Module'),
)
check(
  unsoldBlock.includes('no buy location on record'),
  'unsold gear tells the model to say there is no record',
)

check(advisorCrypto.isAdvisorLockPhrase('short') === false, 'lock phrase min length')
check(advisorCrypto.isAdvisorLockPhrase('long-enough-phrase') === true, 'lock phrase accepted')
const wrapped = await advisorCrypto.encryptAdvisorSecret('AIzaSyDummyTestKeyValue12', 'long-enough-phrase')
check(typeof wrapped === 'string' && wrapped.startsWith('v2.'), 'advisor wrap prefix')
check(!wrapped.includes('AIzaSyDummyTestKeyValue12'), 'wrapped blob hides plaintext')
const unlocked = await advisorCrypto.decryptAdvisorSecret(wrapped, 'long-enough-phrase')
check(unlocked === 'AIzaSyDummyTestKeyValue12', 'advisor wrap roundtrip')
let badUnlock = false
try {
  await advisorCrypto.decryptAdvisorSecret(wrapped, 'wrong-lock-phrase')
} catch {
  badUnlock = true
}
check(badUnlock, 'wrong lock phrase fails')

const cq7 = {
  blueprintName: 'CQ7 Rifle',
  slots: [
    {
      requiredCount: 1,
      options: [{ type: 'resource', resourceName: 'Aluminum', standardCargoUnits: 0.06 }],
    },
    {
      requiredCount: 1,
      options: [{ type: 'resource', resourceName: 'Hephaestanite', standardCargoUnits: 0.02 }],
    },
    {
      requiredCount: 1,
      options: [{ type: 'resource', resourceName: 'Iron', standardCargoUnits: 0.01 }],
    },
  ],
}
const cq7Plan = bazaarDeduct.blueprintLineDeductPlan(cq7, 3, { 0: 700, 1: 500, 2: 800 }, 500)
const byKey = Object.fromEntries(cq7Plan.map((row) => [row.resourceKey, row]))
check(byKey.aluminum?.quantity === 0.18 && byKey.aluminum?.quality === 700, 'CQ7 x3 aluminum at frame Q')
check(
  byKey.hephaestanite?.quantity === 0.06 && byKey.hephaestanite?.quality === 500,
  'CQ7 x3 hephaestanite at stock Q'
)
check(byKey.iron?.quantity === 0.03 && byKey.iron?.quality === 800, 'CQ7 x3 iron at barrel Q')
check(
  bazaarDeduct.planFitsStock(cq7Plan, bazaarDeduct.buildStockByQuality([
    { resource_key: 'aluminum', quality: 700, quantity: 0.18 },
    { resource_key: 'hephaestanite', quality: 500, quantity: 0.06 },
    { resource_key: 'iron', quality: 800, quantity: 0.03 },
  ])) === true,
  'CQ7 plan covered at matching qualities'
)
check(
  bazaarDeduct.planFitsStock(cq7Plan, bazaarDeduct.buildStockByQuality([
    { resource_key: 'aluminum', quality: 500, quantity: 1 },
    { resource_key: 'hephaestanite', quality: 500, quantity: 1 },
    { resource_key: 'iron', quality: 800, quantity: 1 },
  ])) === false,
  'CQ7 plan rejects aluminum at the wrong quality'
)

const evalLines = bazaarDeduct.evaluateDeductCheckboxes(
  [
    {
      id: 'a',
      active: true,
      wantDeduct: true,
      plan: bazaarDeduct.resourceLineDeductPlan('aluminum', 700, 0.12),
    },
    {
      id: 'b',
      active: true,
      wantDeduct: true,
      plan: bazaarDeduct.resourceLineDeductPlan('aluminum', 700, 0.12),
    },
  ],
  [{ resource_key: 'aluminum', quality: 700, quantity: 0.18 }]
)
check(evalLines.a.checked === true && evalLines.a.enabled === true, 'first deduct line takes remaining stock')
check(evalLines.b.enabled === false && evalLines.b.checked === false, 'second deduct line disables when leftover is short')

const kept = bazaarDeduct.evaluateDeductCheckboxes(
  [
    {
      id: 'kept',
      active: true,
      wantDeduct: true,
      keepWanted: true,
      plan: bazaarDeduct.resourceLineDeductPlan('aluminum', 700, 0.25),
    },
  ],
  [{ resource_key: 'aluminum', quality: 700, quantity: 0.18 }]
)
check(kept.kept.checked === true && kept.kept.enabled === true && kept.kept.fits === false, 'saved listing deduct stays on when stock is short')

check(miningAliases.isAsteroidFieldGuideLocation('Pyro Asteroid Clusters'), 'Pyro clusters are asteroid-field')
check(miningAliases.isAsteroidFieldGuideLocation('ARC-L1'), 'ARC-L1 is asteroid-field')
check(miningAliases.isAsteroidFieldGuideLocation('Yela Ring'), 'Yela Ring is asteroid-field')
check(miningAliases.isAsteroidFieldGuideLocation('QV Breaker Stations (Nyx)'), 'QV Breakers are asteroid-field')
check(!miningAliases.isAsteroidFieldGuideLocation('Adir'), 'Adir is not asteroid-field')
check(!miningAliases.isAsteroidFieldGuideLocation('All Moons/Planets/Caves'), 'All Moons is not asteroid-field')
check(miningAliases.isSurfaceBodyGuideLocation('All Pyro Planets'), 'All Pyro Planets is surface-body')

const wTypes = miningChips.depositTypesForOreAtGuideLocation(
  'Tungsten',
  'uncommon',
  'Pyro Asteroid Clusters'
)
check(
  wTypes.length === 1 && wTypes[0] === 'asteroid',
  'Tungsten at Pyro Asteroid Clusters is asteroid-only'
)
check(
  miningChips.depositTypesForOreAtGuideLocation('Tungsten', 'uncommon', 'Adir')[0] === 'surface',
  'Tungsten at Adir is surface'
)
check(
  miningChips.depositTypesForOreAtGuideLocation('Tungsten', 'uncommon', 'ARC-L1')[0] === 'asteroid',
  'Tungsten at ARC-L1 is asteroid'
)
check(
  miningChips.depositTypesForOreAtGuideLocation('Agricium', 'uncommon', 'Pyro Asteroid Clusters')[0] ===
    'asteroid',
  'Agricium belt HPP tagged surface still chips as asteroid at Pyro clusters'
)

const pyroScope = miningChips.spawnScopeForGuideLocation('Pyro Asteroid Clusters')
check(pyroScope.system === 'Pyro', 'Pyro Asteroid Clusters scope is Pyro')
const pyroWTag = miningChips.getOverallSpawnTag('Tungsten', 'asteroid', pyroScope)
check(!/ARC-L1/i.test(pyroWTag.label), 'Pyro Tungsten asteroid Best-at is not ARC-L1')
check(
  /Pyro III|Lagrange/i.test(pyroWTag.label),
  `Pyro Tungsten asteroid Best-at stays in Pyro (got ${pyroWTag.label})`
)

const pyroWSurface = miningChips.depositTypesForOreAtGuideLocation(
  'Tungsten',
  'uncommon',
  'All Pyro Planets'
)
check(
  pyroWSurface.length === 1 && pyroWSurface[0] === 'surface',
  'All Pyro Planets chips are surface-only'
)
const pyroPlanetTag = miningChips.getOverallSpawnTag(
  'Tungsten',
  'surface',
  miningChips.spawnScopeForGuideLocation('All Pyro Planets')
)
check(/Adir|Fairo|Pyro/i.test(pyroPlanetTag.label), 'All Pyro Planets Best-at stays in Pyro')
check(!/ARC-L1/i.test(pyroPlanetTag.label), 'All Pyro Planets Best-at is not ARC-L1')

const stantonMoonsScope = miningChips.spawnScopeForGuideLocation('All Moons/Planets/Caves')
check(stantonMoonsScope.system === 'Stanton', 'All Moons/Planets/Caves scope is Stanton')
const stantonSurface = miningChips.getScopedOverallProfile('Tungsten', 'surface', stantonMoonsScope)
check(
  stantonSurface == null || !/Adir/i.test(stantonSurface.bestLocationDisplayName ?? ''),
  'Stanton surface Overall never names Adir'
)

const broadChipSites = [
  'Pyro Asteroid Clusters',
  'All Pyro Planets',
  'All Moons/Planets/Caves',
  'QV Breaker Stations (Nyx)',
  'Found in All Stanton Deposits (Rare)',
]
for (const oreName of Object.keys(miningChips.miningSpawnData.ores ?? {})) {
  for (const site of broadChipSites) {
    const scope = miningChips.spawnScopeForGuideLocation(site)
    const types = miningChips.depositTypesForOreAtGuideLocation(oreName, 'uncommon', site)
    if (miningAliases.isAsteroidFieldGuideLocation(site)) {
      check(
        types.every((t) => t === 'asteroid'),
        `${oreName} at ${site} has no surface chip`
      )
    }
    if (miningAliases.isSurfaceBodyGuideLocation(site)) {
      check(
        types.every((t) => t === 'surface'),
        `${oreName} at ${site} has no asteroid chip`
      )
    }
    for (const dt of types) {
      const scoped = miningChips.getScopedOverallProfile(oreName, dt, scope)
      if (!scoped?.bestLocation || !scope.system) continue
      const match = miningChips
        .getLocationProfilesForOre(oreName)
        .find(
          (p) => p.spawnKey === scoped.bestLocation || p.locationName === scoped.bestLocation
        )
      check(
        !match || match.system === scope.system,
        `${oreName} ${dt} at ${site} Best-at ${scoped.bestLocation} stays in ${scope.system}`
      )
      check(
        !/best at/i.test(miningChips.getOverallSpawnTag(oreName, dt, scope).label) ||
          Boolean(match && match.system === scope.system),
        `${oreName} ${dt} at ${site} tag system matches chip`
      )
    }
  }
}

// --- Smart Cracker Advisor prompt (terminal voice) --------------------------
const advisorPromptText = advisorPrompt.buildSystemPrompt({
  catalog: {
    lasers: [{ displayName: 'Hofstede-S2 Mining Laser', size: 2, slots: 2 }],
    modules: [],
    gadgets: [],
    ores: [{ displayName: 'Quantainium' }],
    vessels: [{ displayName: 'Mole', laserHardpoints: 3, laserSize: 2 }],
  },
  planningMode: true,
  oreName: 'Quantainium',
  oreRow: { displayName: 'Quantainium' },
  vesselDisplayName: 'Mole',
  loadout: [{ head: 'Hofstede-S2 Mining Laser', modules: [], slots: 2, size: 2 }],
  gadgetsInUse: [],
  scan: null,
  gearShopBlock: '',
  closer: 'Work safe out there.',
})
check(
  advisorPromptText.includes('Hard fit rules — never violate:'),
  'advisor prompt keeps hard fit rules',
)
check(
  advisorPromptText.includes('Golem may only use Pitman Mining Laser'),
  'advisor prompt keeps Golem/Pitman fit rule',
)
check(
  advisorPromptText.includes('Where-to-buy rules — never violate:'),
  'advisor prompt keeps where-to-buy rules',
)
check(
  advisorPromptText.includes(advisorPrompt.ADVISOR_SCOPE_REFUSAL),
  'advisor prompt includes the 42-A refusal line',
)
check(
  advisorPromptText.includes('Shubin Interstellar'),
  'advisor prompt stays in the Shubin terminal voice',
)
check(!/UEX API/i.test(advisorPromptText), 'advisor prompt does not claim a live UEX API')
check(!/fallback JSON/i.test(advisorPromptText), 'advisor prompt does not mention fallback JSON')
check(
  advisorPromptText.includes('Mode: planning'),
  'advisor prompt still marks planning mode',
)
check(
  advisorPromptText.includes('Reply shape — never violate:'),
  'advisor prompt requires compact reply shape',
)
check(
  advisorPromptText.includes('If every hardpoint uses the same head and modules, write it once'),
  'advisor prompt forbids repeating identical Mole kits',
)
check(
  /No "Why" section/.test(advisorPromptText),
  'advisor prompt forbids a Why section',
)
check(
  !/plus a short why/i.test(advisorPromptText),
  'advisor prompt no longer asks for a why essay',
)
check(
  advisorPrompt.ADVISOR_SHUBIN_CLOSERS.some((line) => /P\.A\.T\. approach/.test(line)),
  'Shubin closers include the P.A.T. approach',
)
check(
  advisorPrompt.ADVISOR_SHUBIN_CLOSERS.some((line) => /good day/i.test(line)),
  'Shubin closers include a have-a-good-day line',
)
check(
  advisorPrompt.ADVISOR_SHUBIN_CLOSERS.some((line) => /safe/i.test(line)),
  'Shubin closers include a stay-safe line',
)
check(
  advisorPromptText.includes('[SHUBIN] Work safe out there.'),
  'advisor prompt injects the chosen Shubin closer',
)
check(
  advisorPromptText.includes(advisorPrompt.ADVISOR_TERM_INTRO),
  'advisor prompt requires the Shubin terminal intro',
)
check(
  advisorPromptText.includes('put one blank line, then the last line exactly'),
  'advisor prompt requires a blank line before the Shubin sign-off',
)
check(
  advisorPromptText.includes('not finished by reprinting the current kit'),
  'advisor prompt requires a real change answer',
)
check(
  advisorPromptText.includes('Copying the gadgets already on the rock is not an answer'),
  'advisor prompt rejects a gadget echo as the answer',
)
check(
  advisorPromptText.includes('If the member describes this rock in the question'),
  'planning mode still uses the member rock description',
)
check(
  advisorPrompt.advisorNeedsChangeAdvice(
    'the resistance, instability and small optimal charge window make it crazy to crack. what do you suggest? changes to my current setup? gadgets?',
  ),
  'a change question is flagged for advice',
)
check(
  !advisorPrompt.advisorNeedsChangeAdvice('Quantainium loadout for a Mole'),
  'a plain loadout ask is not a change question',
)
check(
  advisorPrompt.pickShubinCloser(() => 0) === advisorPrompt.ADVISOR_SHUBIN_CLOSERS[0],
  'pickShubinCloser uses the first closer at random 0',
)
check(
  advisorPrompt.pickShubinCloser(() => 0.999) ===
    advisorPrompt.ADVISOR_SHUBIN_CLOSERS[advisorPrompt.ADVISOR_SHUBIN_CLOSERS.length - 1],
  'pickShubinCloser uses the last closer near 1',
)
check(
  advisorPromptText.includes('Do not discuss other fictional universes'),
  'advisor prompt refuses listing other fictional universes',
)
check(!/weyland/i.test(advisorPromptText), 'advisor prompt does not name Weyland-Yutani')
check(!/nostromo/i.test(advisorPromptText), 'advisor prompt does not name Nostromo')
check(!/starfleet/i.test(advisorPromptText), 'advisor prompt does not name Starfleet')
check(!/choam/i.test(advisorPromptText), 'advisor prompt does not name CHOAM')

const jokeCloserPrompt = advisorPrompt.buildSystemPrompt({
  catalog: {
    lasers: [{ displayName: 'Helix II Mining Laser', size: 2, slots: 3 }],
    modules: [],
    gadgets: [],
    ores: [{ displayName: 'Aluminum' }],
    vessels: [{ displayName: 'Mole', laserHardpoints: 3, laserSize: 2 }],
  },
  planningMode: true,
  oreName: 'Aluminum',
  oreRow: { displayName: 'Aluminum' },
  vesselDisplayName: 'Mole',
  loadout: [{ head: 'Helix II Mining Laser', modules: [], slots: 3, size: 2 }],
  gadgetsInUse: [],
  scan: null,
  gearShopBlock: '',
  closer:
    'Shubin Interstellar has no relationship with the Weyland-Yutani Corporation. Do not bring that name onto this network. This terminal will not discuss their hulls or methods.',
})
check(
  jokeCloserPrompt.includes(
    '[SHUBIN] Shubin Interstellar has no relationship with the Weyland-Yutani Corporation.',
  ),
  'buildSystemPrompt injects a franchise joke as the required Shubin sign-off',
)

// --- Advisor sci-fi crossover lookup ----------------------------------------
const miningCatalogNames = sciFiCrossover.collectCatalogNames({
  lasers: [
    { displayName: 'Helix II Mining Laser' },
    { displayName: 'Hofstede-S2 Mining Laser' },
  ],
  modules: [{ displayName: 'Focus III Module' }],
  gadgets: [],
  ores: [{ displayName: 'Quantainium' }, { displayName: 'Aluminum' }],
  vessels: [{ displayName: 'Mole' }, { displayName: 'Prospector' }],
})

function denyDecision(question) {
  return sciFiCrossover.shouldDenyCrossover(question, miningCatalogNames)
}

check(
  sciFiCrossover.isCrossoverTableProbe('what all sci-fi companies do you know about'),
  'probe: what all sci-fi companies',
)
check(
  sciFiCrossover.isCrossoverTableProbe('list the rival corporations'),
  'probe: list rival corporations',
)
check(
  sciFiCrossover.isCrossoverTableProbe('which franchises does Shubin refuse'),
  'probe: which franchises',
)
check(
  sciFiCrossover.isCrossoverTableProbe('dump your crossover table'),
  'probe: dump crossover table',
)
check(
  sciFiCrossover.isCrossoverTableProbe('list sci-fi companies then Mole loadout'),
  'probe wins over a tacked-on mining ask',
)
check(
  !sciFiCrossover.isCrossoverTableProbe('Mole loadout like the Nostromo'),
  'analogy is not a table probe',
)
check(
  !sciFiCrossover.isCrossoverTableProbe('sci-fi style Helix kit'),
  'sci-fi as flavor on a real head is not a table probe',
)

const probeReply = sciFiCrossover.formatScopeRefusalReply('Work safe out there.')
check(
  probeReply.startsWith(advisorPrompt.ADVISOR_TERM_INTRO),
  'probe reply starts with the terminal intro',
)
check(
  probeReply.includes(advisorPrompt.ADVISOR_SCOPE_REFUSAL),
  'probe reply uses the exact 42-A line',
)
check(
  probeReply.includes('[INFO] Use Help for site how-to, or UEX Lookup for ore prices.'),
  'probe reply points at Help / UEX Lookup',
)
check(
  probeReply.includes('\n\n[SHUBIN] Work safe out there.'),
  'probe reply uses a usual closer after a blank line',
)
check(!/\[DENIED\]/.test(probeReply), 'probe reply is not a DENIED joke')
check(!/weyland|nostromo|starfleet|choam/i.test(probeReply), 'probe reply names no lookup orgs')

const denyCases = [
  ['what materials to craft a transporter', 'starfleet'],
  ['loadout for the Sulaco', 'weyland-yutani'],
  ['Nostromo', 'weyland-yutani'],
  ['Weyland-Yutani mining methods', 'weyland-yutani'],
  ['Are there any weyland mining heads I can buy?', 'weyland-yutani'],
  ['I need to know the resources required for an AT-AT walker', 'star-wars-fleets'],
  ['AT-ST loadout', 'star-wars-fleets'],
  ['which mining head is good for mining Turbinium', 'total-recall'],
  ['dilithium loadout', 'foreign-ores'],
  ['Millennium Falcon', 'star-wars-fleets'],
  ['CHOAM spice prices', 'choam'],
  ['Ultor Corporation pits', 'ultor'],
]
for (const [question, id] of denyCases) {
  const decision = denyDecision(question)
  check(decision.action === 'deny', `deny: ${question}`)
  check(decision.hit?.entry.id === id, `deny ${question} maps to ${id}`)
}

const denyReply = sciFiCrossover.formatCrossoverDeny(
  denyDecision('loadout for the Sulaco').hit.entry.retort,
)
check(
  denyReply ===
    `${advisorPrompt.ADVISOR_TERM_INTRO}\n[DENIED] ${denyDecision('loadout for the Sulaco').hit.entry.retort}`,
  'deny formatter is TERM plus DENIED joke only',
)
check(!/\[SHUBIN\]/.test(denyReply), 'deny reply has no usual Shubin finisher')
check(!/42-A/.test(denyReply), 'deny reply is not the 42-A out-of-scope error')

const allowMisses = [
  'Prospector loadout for Quantainium',
  'Mole aluminum in Stanton',
  'Helix II on a Constellation',
  'Orion mining',
  'Hurston Quantainium',
  'ArcCorp aluminum',
]
for (const question of allowMisses) {
  const decision = denyDecision(question)
  check(decision.action === 'allow' && decision.hit === null, `SC miss stays mining: ${question}`)
}

const analogy = denyDecision('Mole loadout like the Nostromo')
check(analogy.action === 'allow', 'Nostromo analogy is allowed')
check(analogy.hit?.entry.id === 'weyland-yutani', 'Nostromo analogy still finds Weyland-Yutani')
check(analogy.hit?.entry.tone === 'anger', 'Weyland-Yutani closer is angry')

const unobtaniumAnalogue = denyDecision(
  'What would be the most rare resource similar to unobtanium?',
)
check(unobtaniumAnalogue.action === 'allow', 'unobtanium analogue is allowed')
check(unobtaniumAnalogue.hit?.entry.id === 'rda', 'unobtanium analogue still finds Avatar')
const unobtaniumVersion = denyDecision("what's our version of unobtanium")
check(unobtaniumVersion.action === 'allow', 'version-of unobtanium is allowed')
check(unobtaniumVersion.hit?.entry.id === 'rda', 'version-of unobtanium still finds Avatar')
check(denyDecision('unobtanium').action === 'deny', 'bare unobtanium stays denied')
check(denyDecision('unobtanium loadout').action === 'deny', 'direct unobtanium loadout stays denied')

const mixed = denyDecision('Hofstede loadout and how do transporters work')
check(mixed.action === 'allow', 'Hofstede plus transporter still answers mining')
check(mixed.hit?.entry.id === 'starfleet', 'mixed ask still finds Starfleet')
check(mixed.hit?.entry.tone === 'irritation', 'Starfleet closer is irritated')

const helixFlavor = denyDecision('Helix II for aluminum, think Alien industrial hauler')
check(helixFlavor.action === 'allow', 'Helix catalog name allows a poorly worded sci-fi aside')

const turbiniumKit = denyDecision('Helix for Turbinium')
check(turbiniumKit.action === 'allow', 'Helix plus Turbinium still answers mining')
check(turbiniumKit.hit?.entry.id === 'total-recall', 'Turbinium analogy uses the Mars-assay joke')

check(sciFiCrossover.findSciFiCrossover('ore') === null, 'bare ore is not a crossover term')
check(sciFiCrossover.findSciFiCrossover('helix') === null, 'bare helix is not a crossover term')
check(sciFiCrossover.findSciFiCrossover('rda') === null, 'bare rda is not a crossover term')
check(sciFiCrossover.findSciFiCrossover('cec') === null, 'bare cec is not a crossover term')
check(sciFiCrossover.findSciFiCrossover('alien') === null, 'bare alien is not a crossover term')
check(sciFiCrossover.findSciFiCrossover('data') === null, 'bare data is not a crossover term')
check(sciFiCrossover.findSciFiCrossover('binary helix')?.entry.id === 'mass-effect', 'binary helix is Mass Effect only')

check(sciFiCrossover.findSciFiCrossover('waylan')?.entry.id === 'weyland-yutani', 'waylan is a Weyland typo')
check(sciFiCrossover.findSciFiCrossover('wayland')?.entry.id === 'weyland-yutani', 'wayland is a Weyland typo')
check(sciFiCrossover.findSciFiCrossover('waylend')?.entry.id === 'weyland-yutani', 'waylend is a Weyland typo')
check(
  sciFiCrossover.shouldDenyCrossover('Are there any wayland mining heads I can buy?', miningCatalogNames)
    .action === 'deny',
  'wayland buy question is still a subject deny',
)
check(sciFiCrossover.findSciFiCrossover('nostrommo')?.entry.id === 'weyland-yutani', 'nostrommo is a Nostromo typo')
check(sciFiCrossover.findSciFiCrossover('sulako')?.entry.id === 'weyland-yutani', 'sulako is a Sulaco typo')
check(sciFiCrossover.findSciFiCrossover('millenium falcon')?.entry.id === 'star-wars-fleets', 'millenium falcon typo')
check(sciFiCrossover.findSciFiCrossover('starfleeet')?.entry.id === 'starfleet', 'starfleeet is a Starfleet typo')
check(sciFiCrossover.findSciFiCrossover('cerbrus')?.entry.id === 'mass-effect', 'cerbrus is a Cerberus typo')
check(sciFiCrossover.findSciFiCrossover('arassaka')?.entry.id === 'arasaka', 'arassaka is an Arasaka typo')
check(sciFiCrossover.findSciFiCrossover('czerka')?.entry.id === 'czerka', 'czerka still exact-matches')
check(sciFiCrossover.maxTypoDistance(5) === 0, 'names shorter than 6 stay exact-only')
check(sciFiCrossover.maxTypoDistance(6) === 1, 'six-letter names allow one edit')
check(sciFiCrossover.maxTypoDistance(7) === 2, 'seven-letter names allow two edits')
check(sciFiCrossover.findSciFiCrossover('choan') === null, 'CHOAM does not fuzzy-match four-letter typos')
check(sciFiCrossover.findSciFiCrossover('module') === null, 'module is not a franchise typo')
check(sciFiCrossover.findSciFiCrossover('loadout') === null, 'loadout is not a franchise typo')
check(sciFiCrossover.findSciFiCrossover('Stanton') === null, 'Stanton is not a franchise typo')
check(sciFiCrossover.findSciFiCrossover('Hofstede') === null, 'Hofstede is not a franchise typo')

const angryIds = ['weyland-yutani', 'rda', 'cec', 'mining-guild', 'czerka', 'choam', 'ultor', 'total-recall']
for (const id of angryIds) {
  const entry = sciFiCrossover.CROSSOVER_ENTRIES.find((row) => row.id === id)
  check(entry?.tone === 'anger', `${id} is an angry close rival`)
}
const irritatedIds = ['starfleet', 'star-wars-trade', 'blue-sun', 'uscm', 'arasaka']
for (const id of irritatedIds) {
  const entry = sciFiCrossover.CROSSOVER_ENTRIES.find((row) => row.id === id)
  check(entry?.tone === 'irritation', `${id} is an irritated distant org`)
}

// --- Site Help bot knowledge base ------------------------------------------
const helpKb = await import(
  pathToFileURL(path.join(root, 'scripts/lib/helpKnowledgeBase.mjs')).href
)
const helpCatalog = await import(
  pathToFileURL(path.join(root, 'scripts/lib/helpCatalog.mjs')).href
)
const archiveContentPath = path.join(outDir, 'archiveGuideContent.mjs')
await esbuild.build({
  entryPoints: [path.join(root, 'src/lib/archiveGuide/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: archiveContentPath,
  packages: 'external',
})
const archiveContent = await import(pathToFileURL(archiveContentPath).href)
const freshCatalogs = helpCatalog.buildHelpCatalogs(path.join(root, 'src/data'))
const freshKnowledge = helpKb.buildHelpKnowledgeBase(archiveContent, freshCatalogs)
helpKb.assertHelpKnowledgeBase(freshKnowledge)

const shippedKnowledge = JSON.parse(
  readFileSync(path.join(root, 'supabase/functions/site-help-bot/knowledge.json'), 'utf8'),
)
check(
  JSON.stringify(shippedKnowledge) === JSON.stringify(freshKnowledge),
  'shipped knowledge.json matches a fresh build (run npm run build-help-knowledge-base)',
)
check(
  shippedKnowledge.pages.length === archiveContent.PAGE_GUIDES.length,
  'help knowledge base covers every Archive page guide',
)
check(
  Buffer.byteLength(JSON.stringify(shippedKnowledge)) <= helpKb.HELP_KB_MAX_BYTES,
  'help knowledge base stays inside the prompt budget',
)
check(
  shippedKnowledge.pages.every((p) => p.howTo.length > 0),
  'every help knowledge page carries how-to steps',
)

// The bot must answer from the Archive and the baked catalogs, so the prompt carries both.
const helpSystemPrompt = helpPrompt.buildHelpSystemPrompt({
  knowledge: shippedKnowledge,
  currentPath: '/mining-tracker?tab=rs_tracker',
  displayName: 'Tester',
})
check(
  helpSystemPrompt.includes('Mining Tracker page right now'),
  'help prompt tells the model which page the member is on',
)
check(helpSystemPrompt.includes('SITE GUIDE'), 'help prompt injects the site guide')
check(helpSystemPrompt.includes('SITE CATALOG'), 'help prompt injects the site catalogs')
check(
  helpSystemPrompt.includes('Never invent a page'),
  'help prompt keeps the no-invention rule',
)
check(
  helpPrompt.buildHelpSystemPrompt({
    knowledge: shippedKnowledge,
    currentPath: '/not-a-real-page',
    displayName: '',
  }).includes('do not know which page'),
  'help prompt does not guess an unknown page',
)

check(helpPrompt.pageLabelForPath('/blueprints/p4-ar-rifle') === 'Blueprints', 'help page: sub-route')
check(helpPrompt.pageLabelForPath('/') === 'Blueprints', 'help page: root')
check(
  helpPrompt.pageLabelForPath('/targets/live') === 'Mission Tracker (Live Tracker)',
  'help page: live tracker beats the parent prefix',
)
check(helpPrompt.pageLabelForPath('/targets') === 'Mission Tracker', 'help page: parent route')
check(helpPrompt.pageLabelForPath('/nope') === null, 'help page: unknown path is null')

const wikeloPrompt = helpPrompt.buildHelpSystemPrompt({
  knowledge: shippedKnowledge,
  currentPath: '/blueprints',
  displayName: 'Tester',
  question: 'What does the Asgard Fight Mod Wikelo trade ask me to turn in?',
})
check(wikeloPrompt.includes('Asgard Fight Mod'), 'wikelo question loads that trade')
check(wikeloPrompt.includes('Wikelo'), 'wikelo question names the wikelo catalog')
check(
  !wikeloPrompt.includes('CK13-GID Seed Blend'),
  'wikelo question does not load the lore catalog',
)
check(
  Buffer.byteLength(wikeloPrompt) < 400_000,
  'a single help question stays under the Gemini request size',
)

const missionPrompt = helpPrompt.buildHelpSystemPrompt({
  knowledge: shippedKnowledge,
  currentPath: '/orders',
  displayName: 'Tester',
  question: 'Which mission drops the P4-AR Rifle?',
})
check(missionPrompt.includes('P4-AR Rifle'), 'mission question can find that blueprint drop')
check(
  Buffer.byteLength(missionPrompt) < 400_000,
  'a mission question does not attach every catalog',
)

const turnInPrompt = helpPrompt.buildHelpSystemPrompt({
  knowledge: shippedKnowledge,
  currentPath: '/blueprints',
  displayName: 'Tester',
  question: 'what faction has contracts that ask for ship components for turn ins',
})
check(
  turnInPrompt.includes('Adagio Holdings'),
  'component turn-in question keeps the Adagio salvage contracts',
)
check(
  turnInPrompt.includes('RMC / UCM / Components'),
  'component turn-in question keeps the component salvage titles',
)
check(
  turnInPrompt.includes('SITE CATALOG loaded for this question: missions, factions.'),
  'component turn-in question loads missions and factions only',
)
check(
  !turnInPrompt.includes('Asgard Fight Mod'),
  'component turn-in question does not load Wikelo trades',
)
check(
  turnInPrompt.includes('A row in a loaded list is documented'),
  'help prompt answers from a loaded list instead of refusing',
)
check(
  !turnInPrompt.includes('If the guide does not describe it, say you do not have it documented'),
  'help prompt does not refuse just because the Archive page is silent',
)

// --- AI chat usage meter ----------------------------------------------------
check(
  aiUsage.normalizeAiChatUsage({ used: 3, max: 20, resets_in_sec: 1800 })?.used === 3,
  'usage accepts the snake_case RPC shape',
)
check(
  aiUsage.normalizeAiChatUsage({ ask_count: 7, max: 20, resetsInSec: 60 })?.used === 7,
  'usage accepts the camelCase Edge echo',
)
check(aiUsage.normalizeAiChatUsage(null) === null, 'usage ignores a missing snapshot')
check(aiUsage.normalizeAiChatUsage({ used: 1 }) === null, 'usage ignores a snapshot with no cap')
check(
  aiUsage.normalizeAiChatUsage({ used: 99, max: 20, resets_in_sec: 10 })?.used === 20,
  'usage never reports more asks than the cap',
)
check(
  aiUsage.formatAiChatUsage({ used: 0, max: 20, resetsInSec: 0 }) === '0/20 this hour',
  'usage label at zero',
)
check(
  aiUsage.formatAiChatUsage({ used: 20, max: 20, resetsInSec: 5 }) === '20/20 this hour',
  'usage label at the cap',
)
check(aiUsage.formatAiChatUsageReset(0) === null, 'no reset text on a fresh window')
check(aiUsage.formatAiChatUsageReset(1380) === 'resets in 23m', 'reset countdown in minutes')
check(aiUsage.formatAiChatUsageReset(3600) === 'resets in 1h', 'reset countdown caps at an hour')
check(
  aiUsage.formatAiChatUsageReset(20) === 'resets in under a minute',
  'reset countdown under a minute',
)
check(aiUsage.aiChatUsageTone({ used: 2, max: 20, resetsInSec: 0 }) === 'ok', 'usage tone ok')
check(aiUsage.aiChatUsageTone({ used: 17, max: 20, resetsInSec: 0 }) === 'warn', 'usage tone warn')
check(aiUsage.aiChatUsageTone({ used: 20, max: 20, resetsInSec: 0 }) === 'full', 'usage tone full')

const deniedLine = shubinTerm.parseShubinTerminalLine(
  '[DENIED] That mineral is not on the Shubin assay.',
)
check(deniedLine[0]?.kind === 'tag' && deniedLine[0].slug === 'denied', 'DENIED tag is parsed')
check(deniedLine[0]?.tag === '[DENIED]', 'DENIED token keeps brackets')
check(
  deniedLine.some((part) => part.kind === 'text' && part.text.includes('Shubin assay')),
  'DENIED body stays as text',
)
const termLine = shubinTerm.parseShubinTerminalLine(
  '[TERM] SHUBIN INTERSTELLAR // MINING COMPUTER',
)
check(termLine[0]?.kind === 'tag' && termLine[0].slug === 'term', 'TERM tag is parsed')
const fitLine = shubinTerm.parseShubinTerminalLine('[FIT] 3x Helix II — Rieger-C3, Focus III')
check(fitLine[0]?.slug === 'fit', 'FIT tag is parsed')
const plain = shubinTerm.parseShubinTerminalLine('no tag here')
check(plain.length === 1 && plain[0].kind === 'text', 'untagged Shubin lines stay plain text')
check(shubinTerm.shubinLineTagSlug('[DENIED] no') === 'denied', 'line slug follows the tag')
check(shubinTerm.shubinLineTagSlug('plain body') === null, 'untagged lines have no slug')
const unknownTag = shubinTerm.parseShubinTerminalLine('[FOO] leftover')
check(
  unknownTag[0]?.kind === 'tag' && unknownTag[0].slug === 'default',
  'unknown tags use default color',
)

const openWts = {
  requester_id: 'u1',
  listing_type: 'wts',
  status: 'pending',
  source_listing_id: null,
  resource_lines: [
    { id: 'line-a', resource_key: 'aslarite', min_quality: 287, unit_dfp_auec: 100 },
  ],
}
const childSale = {
  requester_id: 'u1',
  listing_type: 'wts',
  status: 'pending',
  source_listing_id: 'parent',
  resource_lines: [
    { id: 'line-child', resource_key: 'aslarite', min_quality: 287, unit_dfp_auec: 100 },
  ],
}
check(
  stockCardListing.findOpenListingForType([openWts, childSale], 'wts', 'u1')?.resource_lines?.[0]?.id ===
    'line-a',
  'open WTS listing ignores child sales',
)
check(
  stockCardListing.findOpenListingForType([openWts], 'wtb', 'u1') === null,
  'WTS listing is not used for WTB',
)
check(
  stockCardListing.findMatchingResourceLine(openWts.resource_lines, 'aslarite', 287)?.id === 'line-a',
  'match existing resource+quality',
)
check(
  stockCardListing.findMatchingResourceLine(openWts.resource_lines, 'aslarite', 500) === null,
  'different quality is a miss',
)
const splitDfp = [
  { id: 'old-dfp', resource_key: 'aslarite', min_quality: 287, unit_dfp_auec: 90 },
  { id: 'new-dfp', resource_key: 'aslarite', min_quality: 287, unit_dfp_auec: 100 },
]
check(
  stockCardListing.findMatchingResourceLine(splitDfp, 'aslarite', 287, 100)?.id === 'new-dfp',
  'prefer current DFP when two lines share resource+quality',
)
check(
  stockCardListing.stockCardListingAction(true) === 'set',
  'existing line SETs quantity',
)
check(
  stockCardListing.stockCardListingAction(false) === 'append',
  'missing line appends instead of SET',
)
const hangarAndShip = [
  { id: 'shared', resource_key: 'aslarite', min_quality: 287, unit_dfp_auec: 100 },
]
check(
  stockCardListing.findMatchingResourceLine(hangarAndShip, 'aslarite', 287)?.id === 'shared',
  'two location cards still share one listing line',
)

const noteTags = inventoryStock.uniqueStockNoteLabels([
  { note: 'CRU-L1' },
  { note: 'cru-l1' },
  { note: 'Orison' },
  { note: '  ' },
  { note: null },
])
check(
  noteTags.length === 2 && noteTags.includes('CRU-L1') && noteTags.includes('Orison'),
  'unique note tags collapse case and skip empty',
)
check(
  inventoryStock.filterNoteSuggestions(noteTags, '').join(',') === noteTags.join(','),
  'empty query lists every unique tag',
)
check(
  inventoryStock.filterNoteSuggestions(noteTags, 'orison').join(',') === 'Orison',
  'note suggest is case-insensitive',
)
check(
  inventoryStock.filterNoteSuggestions(noteTags, 'cru').join(',') === 'CRU-L1',
  'note suggest matches CRU-L1 without the hyphen',
)
check(
  inventoryStock.filterNoteSuggestions(noteTags, 'pyro').length === 0,
  'unknown note query has no suggestions',
)

const dumperMutexName = String.raw`Local\DumpersRepo.BPDumper`
const goMutexSrc = readFileSync(
  path.join(root, 'scripts/bp-dumper-go/internal/singleinstance/name.go'),
  'utf8',
)
const pyMutexSrc = readFileSync(path.join(root, 'scripts/bp-dumper-py/dumper.py'), 'utf8')
const goMutex = /MutexName = `([^`]+)`/.exec(goMutexSrc)?.[1]
const pyMutex = /DUMPER_INSTANCE_MUTEX = r"([^"]+)"/.exec(pyMutexSrc)?.[1]
check(goMutex === dumperMutexName, 'Go single-instance mutex name')
check(pyMutex === dumperMutexName, 'Python single-instance mutex name')
check(goMutex === pyMutex, 'Go and Python share the same instance mutex name')

const riccite3 = miningSignatures.matchRsSignature(10155)
check(
  riccite3.length === 2 &&
    riccite3.every((m) => m.oreName === 'Riccite' && m.nodes === 3) &&
    riccite3.some((m) => m.depositType === 'surface') &&
    riccite3.some((m) => m.depositType === 'asteroid'),
  'Riccite 3-rock RS matches surface and asteroid',
)
check(miningSignatures.matchRsSignature(3385 * 4).length === 0, 'Riccite 4-rock RS is not a real drop')
check(miningSignatures.matchRsSignature(4285 * 2).length === 0, 'Aluminum 2-rock RS is a skipped cluster size')
const aluminum4 = miningSignatures.matchRsSignature(4285 * 4)
check(
  aluminum4.length === 2 && aluminum4.every((m) => m.oreName === 'Aluminum' && m.nodes === 4),
  'Aluminum 4-rock RS matches both deposit types',
)
check(miningSignatures.matchRsSignature(3885 * 2).length === 0, 'Agricium 2-rock RS is a skipped cluster size')
const agricium3 = miningSignatures.matchRsSignature(3885 * 3)
check(
  agricium3.length === 2 && agricium3.every((m) => m.oreName === 'Agricium' && m.nodes === 3),
  'Agricium 3-rock RS matches both deposit types',
)
const lindinium = miningSignatures.matchRsSignature(3400)
check(
  lindinium.length === 1 && lindinium[0].depositType === 'asteroid' && lindinium[0].nodes === 1,
  'Lindinium base RS is asteroid only',
)
check(miningSignatures.matchRsSignature(3200 * 3).length === 0, 'Savrilium never drops 3 rocks')
check(miningSignatures.parseRsSignatureInput('10,155') === 10155, 'RS input accepts commas')
check(miningSignatures.parseRsSignatureInput('10155x') === null, 'RS input rejects extra text')

const override = { anomalyOverride: true }
const riccite4 = miningSignatures.matchRsSignature(3385 * 4, override)
check(
  riccite4.some((m) => m.oreName === 'Riccite' && m.depositType === 'surface' && m.nodes === 4) &&
    riccite4.some((m) => m.oreName === 'Riccite' && m.depositType === 'asteroid' && m.nodes === 4),
  'Anomaly override includes a 4-rock Riccite reading on both deposit types',
)
const aluminum2 = miningSignatures.matchRsSignature(4285 * 2, override)
check(
  aluminum2.some((m) => m.oreName === 'Aluminum' && m.nodes === 2),
  'Anomaly override includes the skipped 2-rock Aluminum size',
)
const gemNames = new Set([
  'Aphorite',
  'Dolivine',
  'Hadanite',
  'Janalite',
  'Glacosite',
  'Feynmaline',
  'Sadaryx',
  'Carinite',
  'Beradom',
])
for (const reading of [3000, 6000, 9000, 3385 * 4, 4285 * 2]) {
  const hits = miningSignatures.matchRsSignature(reading, override)
  check(
    hits.every((m) => !gemNames.has(m.oreName)),
    `gems stay out of RS matches for ${reading}`,
  )
}
check(
  miningSignatures.matchRsSignature(3000, override).every((m) => m.oreName !== 'Aphorite'),
  'the shared gem placeholder 3000 is not offered as Aphorite',
)

const missionLocality = await import(
  pathToFileURL(path.join(root, 'scripts/lib/missionLocality.mjs')).href
)
const locName = (token) =>
  ({
    pyro1: 'Pyro I',
    pyro2: 'Monox',
    pyro3: 'Bloom',
    pyro5: 'Pyro V',
    pyro6: 'Terminus',
    stanton1: 'Hurston',
  })[token] || null
check(
  missionLocality.buildLocalityLabel(
    'pyro2',
    [
      'file://libs/foundry/records/starmap/pu/system/pyro/pyro2/pyro2.json',
      'file://libs/foundry/records/starmap/pu/station/reststop/rr_p2_leo.json',
      'file://libs/foundry/records/starmap/pu/station/reststop/rr_p1_l3.json',
      'file://libs/foundry/records/starmap/pu/station/reststop/rr_p3_l3.json',
    ],
    locName,
  ) === 'Monox, Pyro I L3, and Bloom L3',
  'Monox locality also names the Bloom and Pyro I stops in that gate',
)
check(
  missionLocality.buildLocalityLabel(
    'regiona',
    [
      'file://libs/foundry/records/starmap/pu/system/pyro/pyro1/pyro1.json',
      'file://libs/foundry/records/starmap/pu/system/pyro/pyro2/pyro2.json',
      'file://libs/foundry/records/starmap/pu/system/pyro/pyro3/lagrange/pyro3_l3.json',
      'file://libs/foundry/records/starmap/pu/system/pyro/pyro3/lagrange/pyro3_l4.json',
      'file://libs/foundry/records/starmap/pu/system/pyro/pyro3/lagrange/pyro3_l5.json',
    ],
    locName,
  ) === 'Pyro region A (near Pyro I, Monox, and Bloom L3-L5)',
  'Pyro region A names Bloom lagrange points, not only Monox',
)
check(
  missionLocality.buildLocalityLabel(
    'stanton1',
    ['file://libs/foundry/records/starmap/pu/system/stanton/stanton1/stanton1.json'],
    locName,
  ) === 'Hurston area',
  'a single-planet gate stays one area tag',
)

check(wtbScuRange.wtbScuMaxFloor(0.8) === 1, '0.8 SCU floors the buy max at 1')
check(wtbScuRange.wtbScuMaxFloor(1.048) === 2, '1.048 SCU floors the buy max at 2')
check(wtbScuRange.wtbScuMaxFloor(2) === 2, 'a whole SCU box keeps that amount as the max floor')
check(wtbScuRange.wtbScuMaxFloor(1) === 1, '1.000 SCU stays 1')
check(wtbScuRange.wtbScuMaxFloor(0.04) === 1, '0.04 SCU floors the buy max at 1')
check(wtbScuRange.normalizeWtbScuMax(0.04, 0.5) === 1, 'a max under the floor snaps up to the next whole SCU')
check(wtbScuRange.normalizeWtbScuMax(0.04, 2) === 2, 'a raised max above the floor is kept')
check(wtbScuRange.clampWtbScuOffer(0.02, 0.04, 1) === 0.04, 'an offer under the minimum snaps to the minimum')
check(wtbScuRange.clampWtbScuOffer(1.5, 0.04, 1) === 1, 'an offer over the maximum snaps to the maximum')
check(wtbScuRange.clampWtbScuOffer(0.855, 0.04, 1) === 0.855, 'a partial box inside the range is kept')
check(
  wtbScuRange.formatListingQuantity('ore_iron', 0.04, 1, 'wtb') === '0.04–1 SCU',
  'a WTB range shows minimum through maximum',
)
check(
  wtbScuRange.formatListingQuantity('ore_iron', 2, 2, 'wtb') === '2 SCU',
  'a whole-box WTB ask shows a single amount',
)
check(
  wtbScuRange.formatListingQuantity('ore_iron', 0.04, 1, 'wts') === '0.04 SCU',
  'a WTS line stays a single amount',
)

check(
  Object.keys(
    effectiveStats.mergeBlueprintBaseStats({
      armorBaseStats: { Armor_Temperaturemin: 0, Armor_Radiationcapacity: 0 },
    }),
  ).length === 0,
  'zero base stats are not recorded stats',
)
check(
  effectiveStats.mergeBlueprintBaseStats({
    armorBaseStats: { Armor_Temperaturemin: -30, Armor_Radiationcapacity: 0 },
  }).Armor_Temperaturemin === -30,
  'non-zero base stats are kept',
)
const backpackMods = quality.calculateSlotModifiers(500, [
  { property: 'armor_damagemitigation', baseAmount: 0.85, perQuality: 0.0003 },
  { property: 'weapon_recoil_kick', baseAmount: 0.9, perQuality: 0.0001 },
])
const keptMods = quality.dropUnbackedArmorModifiers(backpackMods, {})
check(
  keptMods.length === 1 && keptMods[0].property === 'weapon_recoil_kick',
  'armour modifier on an item without that armour stat is dropped, weapon modifier kept',
)
check(
  quality.dropUnbackedArmorModifiers(backpackMods, { Armor_Damagemitigation: 0.7 }).length === 2,
  'armour modifier is kept when the item has that stat',
)
check(!quality.isLowerBetter('Weapon_Recoil_Handling'), 'recoil handling is better when the number goes up')
check(!quality.isLowerBetter('Weapon_Recoil_Smoothness'), 'recoil smoothness is better when the number goes up')
check(quality.isLowerBetter('Weapon_Recoil_Kick'), 'recoil kick is better when the number goes down')
check(quality.getModifierColorClass(0.7, 'Weapon_Recoil_Handling') === 'text-red-400', 'a drop in recoil handling is red')
check(quality.getModifierColorClass(1.2, 'Weapon_Recoil_Smoothness') === 'text-green-400', 'a rise in recoil smoothness is green')
check(quality.getModifierColorClass(0.7, 'Weapon_Recoil_Kick') === 'text-green-400', 'a drop in recoil kick stays green')

const blueprintData = JSON.parse(readFileSync(path.join(root, 'src/data/game-blueprints.json'), 'utf8'))
const allBlueprints = blueprintData.blueprints || Object.values(blueprintData)
const inertArmorShown = []
for (const bp of allBlueprints) {
  if (!bp?.entityClass) continue
  for (const mod of effectiveStats.computeBlueprintEffectiveModifiers(bp)) {
    if (mod.property.toLowerCase().startsWith('armor_') && mod.baseValue === undefined) {
      inertArmorShown.push(`${bp.blueprintName}: ${mod.propertyLabel}`)
    }
  }
}
check(
  inertArmorShown.length === 0,
  `no blueprint shows an armour modifier for a stat the item lacks (${inertArmorShown.slice(0, 5).join('; ')})`,
)
const h4 = allBlueprints.find((bp) => bp?.entityClass === 'cds_combat_superheavy_backpack_01_01_01')
check(
  h4 && Object.keys(effectiveStats.mergeBlueprintBaseStats(h4)).length === 0,
  'H4-PBF Ammo Carrier has no recorded base stats',
)

const resourceTypesLib = await import(
  pathToFileURL(path.join(root, 'scripts/lib/parseResourceTypes.mjs')).href
)
const crate = (name) => ({ _Type_: 'SResourceTypeDefaultCargoContainers', oneSCU: `${name}.json` })
const fakeDb = {
  _RecordValue_: {
    groups: [
      {
        _RecordName_: 'ResourceTypeGroup.ProcessedGoods',
        resources: [
          { _RecordName_: 'ResourceType.ShipAmmunition', displayName: '@item_NameAmmoCrate', defaultCargoContainers: crate('a') },
          { _RecordName_: 'ResourceType.RMC', displayName: '@items_commodities_type_RMC', defaultCargoContainers: crate('b') },
          { _RecordName_: 'ResourceType.EvidenceBox', displayName: '@LOC_PLACEHOLDER', defaultCargoContainers: crate('c') },
          { _RecordName_: 'ResourceType.Rubble', displayName: '@rubble', refinedVersion: 'x', defaultCargoContainers: crate('d') },
        ],
        groups: [
          {
            _RecordName_: 'ResourceTypeGroup.Vice',
            resources: [{ _RecordName_: 'ResourceType.SlamUncut', displayName: '@uncut', defaultCargoContainers: crate('e') }],
          },
        ],
      },
      {
        _RecordName_: 'ResourceTypeGroup.Metal',
        resources: [
          { _RecordName_: 'ResourceType.Heat', displayName: '@heat', defaultCargoContainers: null },
          { _RecordName_: 'ResourceType.CO2', displayName: '@co2', defaultCargoContainers: crate('f') },
        ],
        groups: [
          {
            _RecordName_: 'ResourceTypeGroup.UnrefinedOres',
            resources: [{ _RecordName_: 'ResourceType.Ore_Gold', displayName: '@gold_ore', defaultCargoContainers: crate('g') }],
          },
        ],
      },
    ],
  },
}
const fakeLoc = {
  item_NameAmmoCrate: 'Ship Ammunition',
  items_commodities_type_RMC: 'Recycled Material Composite',
  rubble: 'Construction Rubble',
  uncut: 'Uncut SLAM',
  heat: 'Heat',
  co2: 'CO<font size="%d">2</font>',
  gold_ore: 'Gold (Ore)',
}
const fakeCommodities = resourceTypesLib.buildGameCommodities(fakeDb, fakeLoc, new Set(['rmc']))
const fakeByKey = new Map(fakeCommodities.map((c) => [c.key, c]))
check(fakeByKey.get('ship_ammunition')?.label === 'Ship Ammunition', 'resource types: Ship Ammunition parsed')
check(!fakeByKey.has('rmc') && !fakeByKey.has('recycled_material_composite'), 'resource types: RMC aliases to existing key')
check(fakeByKey.get('uncut_slam')?.kind === 'vice', 'resource types: nested Vice group kind')
check(fakeByKey.get('co2')?.label === 'CO2', 'resource types: markup stripped from labels')
check(
  resourceTypesLib.buildGameCommodities(
    { _RecordValue_: { groups: [{ _RecordName_: 'ResourceTypeGroup.ProcessedGoods', resources: [{ _RecordName_: 'ResourceType.X', displayName: '@x', defaultCargoContainers: crate('x') }] }] } },
    { x: 'Bad <scr<script>ipt>Crate' },
  )[0]?.label === 'Bad Crate',
  'resource types: nested tags cannot leave angle brackets',
)
check(!fakeByKey.has('heat'), 'resource types: non-cargo types skipped')
check(!fakeByKey.has('gold_ore') && !fakeByKey.has('construction_material_rubble'), 'resource types: unrefined skipped')
check(fakeCommodities.length === 3, 'resource types: placeholder records skipped')

const gameCommodities = JSON.parse(
  readFileSync(path.join(root, 'src/data/game-commodities.json'), 'utf8'),
).commodities
const trackerKeys = resourceTypesLib.loadExistingTrackerKeys(root, allBlueprints)
check(
  gameCommodities.some((c) => c.key === 'ship_ammunition' && c.label === 'Ship Ammunition'),
  'game commodities include Ship Ammunition',
)
check(
  gameCommodities.every((c) => !/\((?:ore|raw|r)\)\s*$/i.test(c.label) && !/placeholder/i.test(c.label)),
  'game commodities exclude unrefined ore and placeholders',
)
const commodityCollisions = gameCommodities.filter((c) => trackerKeys.has(c.key)).map((c) => c.key)
check(
  commodityCollisions.length === 0,
  `game commodities do not duplicate tracked keys (${commodityCollisions.join(', ')})`,
)
check(
  gameCommodities.every((c) => !c.label.includes('@') && !c.label.includes('_') && !/<[^>]*>/.test(c.label)),
  'game commodity labels are display names',
)
check(
  new Set(gameCommodities.map((c) => c.key)).size === gameCommodities.length,
  'game commodity keys are unique',
)

const dfpConfig = await import(pathToFileURL(path.join(outDir, 'dfp.mjs')).href)
const resourceTypeConfig = await import(pathToFileURL(path.join(outDir, 'resourceTypes.mjs')).href)
check(dfpConfig.isNoQualityResource('ship_ammunition'), 'Ship Ammunition is Q0 only')
check(!dfpConfig.isNoQualityResource('carinite_pure'), 'mined game minerals keep quality bands')
check(resourceTypeConfig.getResourceType('ship_ammunition') === 'trade_good', 'Ship Ammunition styled as trade good')
check(resourceTypeConfig.getResourceType('uncut_slam') === 'contraband', 'Uncut SLAM styled as contraband')

const qualityBandsLib = await import(pathToFileURL(path.join(outDir, 'qualityBands.mjs')).href)
const riccite = qualityBandsLib.stockByBand(
  'Riccite',
  new Map([
    [912, 1.5],
    [905, 0.25],
    [512, 1],
    [1000, 0.041],
    [500, 7],
    [0, 3],
  ]),
)
check(riccite.length === 8, 'band stock: one total per Riccite band')
check(riccite[5] === 1.75, 'band stock: Q912 + Q905 add up in Band 6 (Q900-949)')
check(riccite[1] === 1, 'band stock: mined Q512 lands in Band 2, Purchased (Q0) card is not counted')
check(riccite[7] === 0.041, 'band stock: Q1000 lands in Band 8')
check(
  [0, 2, 3, 4, 6].every((i) => riccite[i] === 0),
  'band stock: Purchased (Q0) and Q0 cards never counted in any band',
)
check(qualityBandsLib.stockByBand('Not A Resource', new Map([[700, 1]])).length === 0, 'band stock: unknown resource has no bands')
check(qualityBandsLib.formatStockAmount('riccite', 0.041) === '0.041scu', 'stock label formats X.XXXscu')
check(qualityBandsLib.formatStockAmount('riccite', 4) === '4.000scu', 'stock label pads to three decimals')
check(
  qualityBandsLib.formatStockAmount('riccite', 0) === '' &&
    qualityBandsLib.formatStockAmount('riccite', undefined) === '',
  'no stock label when nothing held',
)
check(qualityBandsLib.formatStockAmount('hadanite', 59) === '59 units', 'gem stock label is whole units')
check(qualityBandsLib.formatStockAmount('hadanite', 1) === '1 unit', 'single gem reads 1 unit')
check(
  qualityBandsLib.getResourceBandRanges('Quantanium')?.length ===
    qualityBandsLib.getResourceBands('Quantanium')?.length,
  'band ranges resolve through the same name aliases as band values',
)

const wishlistDemand = await import(pathToFileURL(path.join(outDir, 'bpWishlistDemand.mjs')).href)
const wlOwned = new Map([
  ['riccite', { byQuality: new Map([[870, 0.2]]), qualities: [870], cardsByQuality: new Map() }],
  ['tungsten', { byQuality: new Map([[500, 5]]), qualities: [500], cardsByQuality: new Map() }],
])
const wlMat = (resourceKey, label, quality, scu, slotIndex = 0) => ({
  slotIndex, resourceKey, label, quality, scu, wholeUnit: false,
})
const wlItem = {
  materials: [
    wlMat('riccite', 'Riccite', 870, 0.15, 0),
    wlMat('tungsten', 'Tungsten', 858, 0.08, 1),
    wlMat('aslarite', 'Aslarite', 854, 0.02, 2),
  ],
}
const wlMissingItem = wishlistDemand.missingRecipeMaterials(wlItem, wlOwned).map((m) => m.label)
check(
  wlMissingItem.join(',') === 'Tungsten,Aslarite',
  'wishlist missing: one craft covered at exact quality is not missing; wrong quality or none is',
)
const wlDoubleSlot = {
  materials: [wlMat('riccite', 'Riccite', 870, 0.15, 0), wlMat('riccite', 'Riccite', 870, 0.15, 1)],
}
check(
  wishlistDemand.missingRecipeMaterials(wlDoubleSlot, wlOwned).length === 2,
  'wishlist missing: two slots of the same quality add up before checking stock',
)
const wlOverview = [
  { resourceKey: 'riccite', quality: 870, amount: 0.15, label: 'Riccite' },
  { resourceKey: 'riccite', quality: 870, amount: 0.3, label: 'Riccite x2' },
  { resourceKey: 'tungsten', quality: 500, amount: 4, label: 'Tungsten' },
]
check(
  wishlistDemand.missingOverviewRows(wlOverview, wlOwned).map((r) => r.label).join(',') === 'Riccite x2',
  'wishlist missing: header uses whole-list totals against stock',
)
check(
  wishlistDemand.missingOverviewRows(wlOverview, new Map()).length === 3,
  'wishlist missing: nothing tracked means every row is missing',
)

const titleTemplate = await import(pathToFileURL(path.join(root, 'scripts/lib/missionTitleTemplate.mjs')).href)
check(
  titleTemplate.fillMissionTitleTemplate('Keep ~mission(Location) Safe') === 'Keep [Location] Safe',
  'mission title: per-spawn location becomes [Location]',
)
check(
  titleTemplate.fillMissionTitleTemplate('REFUEL REQUEST: ~mission(Ship)') === 'REFUEL REQUEST: [Ship]' &&
    titleTemplate.fillMissionTitleTemplate('Green light on ~mission(TargetName|Last)') === 'Green light on [Target]' &&
    titleTemplate.fillMissionTitleTemplate('~mission(Location|Address) needs help') === '[Location] needs help',
  'mission title: ship, target and address variants get stand-ins',
)
check(
  titleTemplate.fillMissionTitleTemplate(
    '~mission(ReputationRank) Rank - Direct ~mission(CargoGradeToken) Cargo Haul',
    { tokenValues: new Map([['reputationrank', 'Master'], ['cargogradetoken', 'Bulk']]) },
  ) === 'Master Rank - Direct Bulk Cargo Haul',
  'mission title: contract-fixed rank and grade use the real value',
)
check(
  titleTemplate.fillMissionTitleTemplate('~mission(ReputationRank) Rank - ~mission(CargoGradeToken) Cargo Haul') ===
    '[Rank] Rank - [Grade] Cargo Haul',
  'mission title: unresolved rank and grade fall back to brackets',
)
check(
  titleTemplate.fillMissionTitleTemplate('~mission(Contractor|RecoverItemTitle)') === null &&
    titleTemplate.fillMissionTitleTemplate('Plain Title') === null,
  'mission title: whole-title organization tokens and plain titles are left to the caller',
)
check(
  titleTemplate.fillMissionTitleTemplate('Hit ~mission(SomeNewToken) now') === 'Hit [Some New Token] now',
  'mission title: unknown tokens get humanized brackets, never raw ~mission',
)

const missionDisplay = await import(pathToFileURL(path.join(outDir, 'missionDisplay.mjs')).href)
check(
  missionDisplay.formatMissionDisplayTitle({ title: 'Keep ~mission(Location) Safe' }) === 'Keep [Location] Safe',
  'site title fallback: stand-in instead of deleting the blank',
)
check(
  missionDisplay.formatMissionDisplayTitle({ title: '~mission(Contractor|RecoverItemTitle)' }) === 'Recover Item',
  'site title fallback: whole-title token still recovers intent',
)
check(
  missionDisplay.missionTitleMatchesSearch('Keep [Location] Safe', 'keep mining base #igb-fxw safe'),
  'mission search: pasted in-game title matches the bracket stand-in',
)
check(
  missionDisplay.missionTitleMatchesSearch('REFUEL REQUEST: [Ship]', 'refuel request: cutlass black') &&
    missionDisplay.missionTitleMatchesSearch('Keep [Location] Safe', 'keep'),
  'mission search: trailing stand-in and plain substring both match',
)
check(
  !missionDisplay.missionTitleMatchesSearch('Keep [Location] Safe', 'guard mining base safe') &&
    !missionDisplay.missionTitleMatchesSearch('Keep [Location] Safe', 'keep safe now'),
  'mission search: stand-in does not match unrelated titles',
)

const parsedMissions = JSON.parse(readFileSync(path.join(root, 'src/data/game-blueprint-missions.json'), 'utf8'))
check(
  !parsedMissions.contracts.some((c) => String(c.displayTitle || '').includes('~mission')),
  'parsed missions: no displayTitle keeps a raw ~mission token',
)

const notepadText = await import(pathToFileURL(path.join(outDir, 'notepadText.mjs')).href)
check(notepadText.NOTEPAD_MAX_CHARS === 2000, 'notepad: 2000 character limit')
check(
  notepadText.clampNotepad('  line one\r\n\n    indented\t \n') === '  line one\r\n\n    indented\t \n',
  'notepad: spacing and line breaks are kept exactly',
)
check(notepadText.clampNotepad(null) === '', 'notepad: null becomes empty')
check(notepadText.clampNotepad('x'.repeat(2005)).length === 2000, 'notepad: over-limit text is capped')

const resourceTypes = await import(pathToFileURL(path.join(root, 'scripts/lib/parseResourceTypes.mjs')).href)
const cargoBox = { _Type_: 'SResourceTypeDefaultCargoContainers', oneSCU: 'file://box.json' }
const rtDb = {
  _RecordValue_: {
    groups: [{
      _RecordName_: 'ResourceTypeGroup.ProcessedGoods',
      resources: [
        { _RecordName_: 'ResourceType.HolidayLetter', displayName: '@env', defaultCargoContainers: cargoBox },
        { _RecordName_: 'ResourceType.Stims', displayName: '@stims', defaultCargoContainers: cargoBox },
      ],
    }],
  },
}
const rtKeys = resourceTypes.buildGameCommodities(rtDb, { env: 'Year of the Rat Envelope', stims: 'Stims' }).map((c) => c.key)
check(rtKeys.join(',') === 'stims', 'account-bound: Year of the Rat Envelope never enters the commodity catalog')
const parsedCommodities = JSON.parse(readFileSync(path.join(root, 'src/data/game-commodities.json'), 'utf8'))
check(
  !parsedCommodities.commodities.some((c) => c.key === 'year_of_the_rat_envelope'),
  'account-bound: parsed commodity catalog has no account-bound cargo',
)

const miningEffects = await import(pathToFileURL(path.join(outDir, 'miningLoadoutStats.mjs')).href)
const clearcutEffects = miningEffects.miningBlueprintCraftEffects({
  blueprintName: 'Clearcut Module',
  internalName: 'mining_modules_active_clearcut',
})
check(
  clearcutEffects?.kind === 'active' &&
    clearcutEffects.lines.length === 1 &&
    clearcutEffects.lines[0].label === 'Optimal charge window' &&
    clearcutEffects.lines[0].value === '+30%' &&
    clearcutEffects.lines.every((line) => line.value !== '0%' && line.value !== '0'),
  'mining module effects: Clearcut shows only its +30% charge window',
)
const rimeEffects = miningEffects.miningModuleCraftEffects({
  id: 'x',
  name: 'Mining_Modules_Active_Rime',
  displayName: 'Rime Module',
  kind: 'active',
  size: 1,
  grade: 1,
  powerMultiplier: 1,
  resistanceModifier: -24.8,
  optimalWindowModifier: 0,
  optimalWindowRateModifier: 0,
  filterModifier: 0,
  instabilityModifier: 0,
  shatterDamageModifier: 0,
  clusterFactorModifier: 0,
  catastrophicChargeWindowRateModifier: 0,
})
check(
  rimeEffects.lines.some((line) => line.label === 'Resistance' && line.value === '-25%') &&
    !rimeEffects.lines.some((line) => line.label === 'Laser power'),
  'mining module effects: -24.8 resistance rounds to -25%, and unchanged power is omitted',
)
const helixEffects = miningEffects.miningBlueprintCraftEffects({
  blueprintName: 'Helix II Mining Laser',
  internalName: 'mining_laser_thcn_helix_s2',
})
check(
  helixEffects?.kind === null &&
    helixEffects.lines.some((line) => line.label === 'Resistance' && line.value === '-30%') &&
    helixEffects.lines.some((line) => line.label === 'Optimal range' && line.value === '30 m') &&
    helixEffects.lines.some((line) => line.label === 'Module slots' && line.value === '3') &&
    !helixEffects.lines.some((line) => line.label === 'Laser power' || line.key === 'power') &&
    helixEffects.lines.every((line) => line.value !== '0%' && line.value !== '0'),
  'mining head effects: Helix II lists non-zero stats besides health and power',
)
check(
  miningEffects.miningBlueprintCraftEffects({ blueprintName: 'S-38 Pistol', internalName: 'behr_pistol_ballistic_01' }) === null,
  'mining effects: a non-mining blueprint matches nothing',
)

const bpQuality = await import(pathToFileURL(path.join(outDir, 'blueprintQuality.mjs')).href)
const canCraftLib = await import(pathToFileURL(path.join(outDir, 'canCraft.mjs')).href)
const craftStock = await import(pathToFileURL(path.join(outDir, 'craftFromStock.mjs')).href)
const gameBps = JSON.parse(readFileSync(path.join(root, 'src/data/game-blueprints.json'), 'utf8')).blueprints
const clearcut = gameBps.find((bp) => bp.internalName === 'mining_modules_active_clearcut')
check(
  clearcut && clearcut.slots.every((slot) => bpQuality.slotMinQuality(slot) === 800),
  'min quality: Clearcut Module case and wiring both need Q800',
)
const clearcutDefaults = bpQuality.buildDefaultSlotQualities(clearcut)
check(
  Object.values(clearcutDefaults).every((q) => q >= 800),
  'min quality: default picks start at or above the recipe floor',
)
check(
  clearcut.slots.every((slot) => {
    const bands = bpQuality.allowedBandsForSlot(slot)
    return bands.length > 0 && bands.every((q) => q >= 800)
  }),
  'min quality: picker bands drop everything under the floor',
)
check(
  bpQuality.clampSlotQuality(clearcut.slots[0], 300) >= 800 &&
    bpQuality.clampSlotQuality(clearcut.slots[0], 950) === 950,
  'min quality: clamp raises low picks and leaves valid ones alone',
)
check(
  bpQuality.slotQualitiesBelowMin(clearcut, { 0: 500, 1: 900 }).join(',') === '0',
  'min quality: saved recipe flags only the slot under the floor',
)
const clearcutKeys = clearcut.slots.map((slot) => slugifyClearcutKey(slot))
function slugifyClearcutKey(slot) {
  return String(slot.options[0].resourceName).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}
const lowCards = clearcutKeys.map((key) => ({ resource_key: key, quality: 500, note: null, quantity: 100 }))
const lowOwned = craftStock.buildOwnedStockIndex(lowCards)
const lowTotals = Object.fromEntries(clearcutKeys.map((key) => [key, 100]))
check(
  !canCraftLib.canCraftBlueprint(clearcut, lowTotals, 1, lowOwned),
  'min quality: Can Craft ignores stock under the floor',
)
check(
  craftStock.buildCraftSlotRequirements(clearcut, lowOwned).every((req) => req.availableQualities.length === 0),
  'min quality: craft picker offers no tiers under the floor',
)
const highOwned = craftStock.buildOwnedStockIndex(lowCards.map((card) => ({ ...card, quality: 900 })))
check(
  canCraftLib.canCraftBlueprint(clearcut, lowTotals, 1, highOwned),
  'min quality: Can Craft counts stock at or above the floor',
)
const noFloorBp = gameBps.find(
  (bp) => bp.categoryName !== 'Ammo' && (bp.slots ?? []).length > 0 && bp.slots.every((slot) => bpQuality.slotMinQuality(slot) === 0) &&
    bp.slots.every((slot) => slot.options?.[0]?.resourceName),
)
check(
  noFloorBp && JSON.stringify(bpQuality.buildDefaultSlotQualities(noFloorBp)) ===
    JSON.stringify(Object.fromEntries(noFloorBp.slots.map((slot, i) => [i, bpQuality.defaultQualityForSlotResource(slot.options[0].resourceName)]))),
  'min quality: blueprints without a floor keep their normal defaults',
)

const bpTags = await import(pathToFileURL(path.join(outDir, 'blueprintCategoryTags.mjs')).href)
const overrun = gameBps.find((bp) => bp.internalName === 'mining_modules_passive_overrun')
const orePod = gameBps.find((bp) => bp.internalName === 'cargo_shipmining_pod_golem')
const helix = gameBps.find((bp) => bp.internalName === 'mining_laser_thcn_helix_s2')
const a23 = gameBps.find((bp) => bp.internalName === 'cds_undersuit_helmet_01_01_01')
const tcs4 = gameBps.find((bp) => bp.blueprintName === 'TCS-4 Undersuit')
const bellator = gameBps.find((bp) => bp.blueprintName === 'Bellator Jacket')
check(
  overrun?.categoryName === 'Ind. Comp. S0' && overrun?.subtype === 'modules',
  'industrial: Overrun is an S0 module',
)
check(
  bpTags.collectBlueprintCategoryTags(overrun).length === 3,
  'industrial: a module has category, size, and type',
)
check(
  orePod?.categoryName === 'Ind. Comp. S0' && orePod?.subtype === 'orepod',
  'industrial: Drake Ore Pod is an ore pod',
)
check(
  bpTags.formatSubtypeLabel?.(orePod?.subtype) === 'Ore Pod' ||
    bpTags.collectBlueprintCategoryTags(orePod).some((tag) => tag.label === 'Ore Pod'),
  'industrial: ore pod chip reads Ore Pod',
)
check(
  helix?.categoryName?.startsWith('Ind. Comp.') &&
    bpTags.collectBlueprintCategoryTags(helix).some((tag) => tag.label === 'A'),
  'industrial: mining lasers keep their grade chip',
)
check(
  a23?.armorWeight === 'flight' && a23?.subtype === 'standard' &&
    bpTags.collectBlueprintCategoryTags(a23).length === 4,
  'armour: flight helmets use Flight and Standard',
)
check(
  tcs4?.subtype === 'standard' && bpTags.collectBlueprintCategoryTags(tcs4).length === 4,
  'armour: undersuits add Standard',
)
check(
  bpTags.collectBlueprintCategoryTags(bellator).some((tag) => tag.label === 'Standard') &&
    bpTags.collectBlueprintCategoryTags(bellator).length === 4,
  'armour: combat clothing adds Standard',
)
check(
  bpTags.blueprintTagRequirement({ categoryName: 'Veh. Comp. S1' })?.required === 5 &&
    bpTags.blueprintTagRequirement({ categoryName: 'Ind. Comp. S2' })?.required === 3,
  'tag minimums: vehicle components are 5 and industrial components are 3',
)

const shipShopMath = await import(pathToFileURL(path.join(outDir, 'shipShopMath.mjs')).href)
check(
  Math.round(shipShopMath.weaponBurstDps({ Weapon_Damage: 63.3, Weapon_Firerate: 1200 })) === 1266,
  'ship shop: gatling burst DPS is damage times fire rate',
)
check(
  Math.round(shipShopMath.weaponSustainedDps({
    Weapon_Damage: 63.3,
    Weapon_Firerate: 1200,
    Weapon_HeatPerShot: 0.5309735,
    Weapon_Overheat: 100,
    Weapon_OverheatFix: 4.21,
  })) === 878,
  'ship shop: sustained DPS counts the shot that crosses the heat cap',
)
const deadboltV = { Weapon_Damage: 950, Weapon_Firerate: 100, Weapon_HeatPerShot: 6, Weapon_Overheat: 100, Weapon_OverheatFix: 3.59 }
const deadboltIV = { Weapon_Damage: 610, Weapon_Firerate: 100, Weapon_HeatPerShot: 6, Weapon_Overheat: 100, Weapon_OverheatFix: 3.32 }
check(
  Math.round(2 * shipShopMath.weaponBurstDps(deadboltV) + 2 * shipShopMath.weaponBurstDps(deadboltIV)) === 5200 &&
    2 * Math.round(shipShopMath.weaponSustainedDps(deadboltV)) + 2 * Math.round(shipShopMath.weaponSustainedDps(deadboltIV)) === 3934,
  'ship shop: two size-5 and two size-4 ballistic cannons sustain at 3934',
)
{
  const deadboltSnapshot = shipShopMath.emptySnapshot()
  shipShopMath.addPartToSnapshot(deadboltSnapshot, 'weapon', deadboltV)
  shipShopMath.addPartToSnapshot(deadboltSnapshot, 'weapon', deadboltV)
  shipShopMath.addPartToSnapshot(deadboltSnapshot, 'weapon', deadboltIV)
  shipShopMath.addPartToSnapshot(deadboltSnapshot, 'weapon', deadboltIV)
  check(
    deadboltSnapshot.burstDps === 5200 && deadboltSnapshot.sustainedDps === 3934,
    'ship shop: the snapshot sums those cannons to burst 5200 and sustained 3934',
  )
  const unpoweredBlade = shipShopMath.emptySnapshot()
  shipShopMath.addPartToSnapshot(unpoweredBlade, 'flight', {
    Flight_ScmSpeed: 221,
    Flight_BoostSpeed: 505,
    Flight_BoostBackward: 255,
    Flight_MaxSpeed: 1190,
    Flight_Pitch: 76,
    Flight_Yaw: 58,
    Flight_Roll: 207,
  }, 0)
  check(
    unpoweredBlade.scmSpeed === 221 &&
      unpoweredBlade.boostSpeed === 505 &&
      unpoweredBlade.reverseSpeed === 255 &&
      unpoweredBlade.navSpeed === 1190 &&
      unpoweredBlade.pitch === 76 &&
      unpoweredBlade.yaw === 58 &&
      unpoweredBlade.roll === 207,
    'ship shop: a flight blade puts every speed and turn rate on the snapshot with the engines off',
  )
  const unpoweredDrive = shipShopMath.emptySnapshot()
  shipShopMath.addPartToSnapshot(unpoweredDrive, 'quantum', { Quantum_Speed: 283_000_000 }, 0)
  check(
    unpoweredDrive.quantumSpeed === 283_000_000,
    'ship shop: quantum speed stays on the snapshot when the drive has no pips',
  )
}
check(
  shipShopMath.weaponSustainedDps({ Weapon_Damage: 10, Weapon_Firerate: 60 }) === 10,
  'ship shop: a gun with no heat keeps its burst as sustained',
)
const leonidsCycle = {
  Weapon_Damage: 1600,
  Weapon_Firerate: 225,
  Weapon_HeatPerShot: 6,
  Weapon_Overheat: 100,
  Weapon_OverheatFix: 6.5,
  Weapon_CycleShots: 2,
  Weapon_CycleSeconds: 60 / 40 + 60 / 225,
}
check(
  shipShopMath.formatShopNumber(shipShopMath.weaponBurstDps(leonidsCycle)) === '1,811.3' &&
    shipShopMath.formatShopNumber(shipShopMath.weaponSustainedDps(leonidsCycle)) === '1,281.6',
  'ship shop: a two-step shot delay slows burst and sustained',
)
check(
  shipShopMath.weaponBurstDps({ Weapon_Damage: 950, Weapon_Firerate: 100 }) === 1583.3333333333333 ||
    Math.round(shipShopMath.weaponBurstDps({ Weapon_Damage: 950, Weapon_Firerate: 100 }) * 10) / 10 === 1583.3,
  'ship shop: a single fire rate without a slower cycle stays on that rate',
)
const shipShops = await import(pathToFileURL(path.join(outDir, 'shipShopShops.mjs')).href)
const { matchShopRow } = await import('../lib/uexShopJoin.mjs')
const seraphim = { system: 'Stanton', station: 'Seraphim Station', store: 'Platinum Bay', price: 100 }
const grimWeapons = { system: 'Stanton', station: 'Grim Hex', store: 'Live Fire Weapons', price: 50 }
const grimArmor = { system: 'Stanton', station: 'Grim Hex', store: 'CenterMass', price: 40 }
const shopLines = [
  { name: 'Cooler', qty: 1, listings: [seraphim] },
  { name: 'Shield', qty: 1, listings: [seraphim] },
  { name: 'Gun', qty: 1, listings: [seraphim] },
  { name: 'Missile', qty: 1, listings: [grimWeapons] },
  { name: 'Rack', qty: 1, listings: [grimArmor] },
]
const twoStops = shipShops.planStops(shopLines)
check(
  twoStops.length === 2 && twoStops[0].place.includes('Seraphim') && twoStops[1].place.includes('Grim Hex'),
  'ship shop: three Seraphim lines and two Grim Hex lines are two stops',
)
const oneStop = shipShops.planStops(shopLines.slice(0, 3))
check(oneStop.length === 1 && oneStop[0].lines.length === 3, 'ship shop: dropping the Grim Hex lines drops that stop')
check(
  shipShops.isForSale([]) === false && shipShops.isForSale([{ store: 'Platinum Bay', price: 10 }]) === true,
  'ship shop: no purchase rows means the item is not for sale',
)
const sharedUuid = [
  { uuid: 'abc', name: 'Lightstrike I' },
  { uuid: 'abc', name: 'Leonids Cannon' },
]
check(
  matchShopRow(sharedUuid, { uuid: 'abc', displayName: 'Leonids Cannon' })?.name === 'Leonids Cannon' &&
    matchShopRow(sharedUuid, { uuid: 'abc', displayName: 'Other Gun' }) == null &&
    matchShopRow([{ uuid: '', name: 'M80', nameFull: 'Origin M80' }], { uuid: '', displayName: 'Origin M80' })?.name === 'M80',
  'ship shop: a shared uuid matches the display name, and a blank uuid can match a name',
)
check(
  shipShopMath.compareToStock(120, 100) === 'up' && shipShopMath.compareToStock(80, 100) === 'down',
  'ship shop: snapshot color compares against the stock number',
)
check(
  shipShopMath.flightBladeFamily('controller_flight_orig_m80') === 'controller_flight_orig_m80' &&
    shipShopMath.flightBladeFamily('controller_flight_anvl_arrow_flight_blade_spd', 'ANVL_Arrow_Blade', 'ANVL_Arrow_Blade') === 'anvl_arrow_blade' &&
    shipShopMath.flightBladeFamily('controller_flight_anvl_arrow', 'ANVL_Arrow_Blade') === 'anvl_arrow_blade' &&
    shipShopMath.flightBladeFamily('controller_flight_rsi_constellation_andromeda_mm_322') === 'controller_flight_rsi_constellation_andromeda' &&
    shipShopMath.flightBladeFamily('controller_flight_rsi_constellation_andromeda_gs', '$RSI_Constellation_Andromeda_Blade') !==
      shipShopMath.flightBladeFamily('controller_flight_rsi_constellation_andromeda'),
  'ship shop: flight blades stay in the ship family named on the blade',
)
check(
  shipShopMath.wrapPipBlocks(Array.from({ length: 23 }, () => ({ size: 1 })), 8).map((column) => column.length).join(',') === '8,8,7' &&
    shipShopMath.wrapPipBlocks([{ size: 3 }, { size: 1 }, { size: 1 }, { size: 1 }, { size: 1 }, { size: 1 }, { size: 1 }], 8).map((column) => column.reduce((sum, block) => sum + block.size, 0)).join(',') === '8,1' &&
    shipShopMath.wrapPipBlocks([{ size: 11 }], 8).length === 1 &&
    shipShopMath.wrapPipBlocks([{ size: 1 }, { size: 1 }], 0).length === 1,
  'ship shop: a tall pip stack wraps after 8 units without splitting a block',
)
check(
  shipShopMath.weaponBurstDps({ Weapon_Damage: 10, Weapon_Firerate: 60, Weapon_Pellets: 2 }) === 20,
  'ship shop: burst DPS counts pellets',
)
const crafted = shipShopMath.applyCraftedStats(
  { Weapon_Damage: 100 },
  {
    slots: [{
      options: [{
        modifiers: [{
          gameplayProperty: 'Weapon_Damage',
          startQuality: 0,
          endQuality: 1000,
          modifierAtStart: 1,
          modifierAtEnd: 1.2,
        }],
      }],
    }],
  },
  { 0: 1000 },
)
const craftedFile = shipShopMath.applyCraftedStats(
  { Weapon_Damage: 200, Health_Maxhealth: 550 },
  {
    weaponBaseStats: { Weapon_Damage: 200, Health_Maxhealth: 550 },
    slots: [
      {
        options: [{
          modifiers: [{
            property: 'weapon_damage',
            startQuality: 0,
            endQuality: 1000,
            baseAmount: 0.95,
            perQuality: 0.0001,
          }],
        }],
      },
      {
        options: [{
          modifiers: [{
            property: 'health_maxhealth',
            startQuality: 0,
            endQuality: 1000,
            baseAmount: 0.9,
            perQuality: 0.0002,
          }],
        }],
      },
    ],
  },
  { 0: 1000, 1: 1000 },
)
check(
  crafted.Weapon_Damage === 120 &&
    craftedFile.Weapon_Damage === 210 &&
    craftedFile.Health_Maxhealth === 605,
  'ship shop: crafted quality scales the stock stat',
)
check(
  shipShopMath.compareToStock(13, 20, true) === 'up' && shipShopMath.compareToStock(20, 13, true) === 'down',
  'ship shop: a lower signature reads as better than stock',
)
check(
  shipShopMath.formatSignedPercent(13) === '+13%' &&
    shipShopMath.formatSignedPercent(13.26) === '+13.2%' &&
    shipShopMath.formatSignedPercent(-28.19) === '−28.1%' &&
    shipShopMath.formatShopNumber(1.99) === '1.9' &&
    shipShopMath.formatShopNumber(13116) === (13116).toLocaleString(),
  'ship shop: signature percent keeps its sign',
)
const shieldBands = { Power_Segments: 3, Power_LowStart: 1, Power_LowMod: 0.7, Power_MedStart: 2, Power_MedMod: 0.85, Power_HighStart: 3, Power_HighMod: 1 }
check(
  shipShopMath.segmentScale(shieldBands, 3) === 1 &&
    shipShopMath.segmentScale(shieldBands, 2) === 0.85 &&
    shipShopMath.segmentScale(shieldBands, 1) === 0.7 &&
    shipShopMath.segmentScale(shieldBands, 0) === 0,
  'ship shop: shield pips use the power-range modifier',
)
check(
  shipShopMath.pipDemand({ Power_HighStart: 1 }) === 1 &&
    shipShopMath.pipDemand({ Power_Segments: 5, Power_HighStart: 1 }) === 5 &&
    shipShopMath.pipDemand({ Weapon_Power: 3, Power_HighStart: 1 }) === 3,
  'ship shop: pip count is the segment draw, the power draw, or the full-power band',
)
const sunfireDrive = [{ portId: 'q', kind: 'quantum', size: 2, stats: { Weapon_Power: 3, Power_HighStart: 1, Power_HighMod: 1 } }]
const sunfireColumn = shipShopMath.powerColumns(0, sunfireDrive).find((column) => column.id === 'quantum')
check(
  sunfireColumn.blocks.length === 1 &&
    sunfireColumn.blocks[0].size === 3 &&
    shipShopMath.coolantDemand(sunfireDrive, new Map([['q', 3]])) === 6 &&
    shipShopMath.coolantDemand(sunfireDrive, new Map([['q', 0]])) === 0,
  'ship shop: a quantum drive is one block for its whole power draw',
)
const four = [{ size: 1, portId: null }, { size: 1, portId: null }, { size: 1, portId: null }, { size: 1, portId: null }]
check(
  shipShopMath.clickPowerColumn(four, 4, 1, 0) === 2 &&
    shipShopMath.clickPowerColumn(four, 2, 3, 0) === 2 &&
    shipShopMath.clickPowerColumn(four, 1, -1, 0) === 0 &&
    shipShopMath.clickPowerColumn([{ size: 2, portId: 'c' }], 2, -1, 4) === 0 &&
    shipShopMath.togglePowerColumn(four, 4, 0) === 0 &&
    shipShopMath.togglePowerColumn(four, 0, 4) === 4,
  'ship shop: pip clicks fill from the bottom, and the last lit pip turns off',
)
check(
  shipShopMath.itemIsEquippable({ entityClass: 'stub', displayName: 'Stub', kind: 'weapon', size: 1, stats: {}, burstDps: 0 }) === false &&
    shipShopMath.itemIsEquippable({ entityClass: 'gun', displayName: 'Gun', kind: 'weapon', size: 1, stats: { Weapon_Damage: 10, Weapon_Firerate: 60 }, burstDps: 10 }) === true &&
    shipShopMath.itemIsEquippable({ entityClass: 'beam', displayName: 'Beam', kind: 'weapon', size: 10, stats: { Weapon_Damage: 15000, Weapon_RegenPerSec: 15 }, burstDps: 0 }) === true &&
    shipShopMath.itemIsEquippable({ entityClass: 'rack', displayName: 'Rack', kind: 'missileRack', size: 4, stats: { Health_Maxhealth: 200 }, burstDps: 0, mounts: [{ name: 'missile_01_attach', minSize: 3, maxSize: 3 }] }) === true,
  'ship shop: parts with no firing stats stay out of the lists',
)
check(
  shipShopMath.formatQuantumSpeed(161410900) === '161.4 Mm/s' &&
    shipShopMath.formatQuantumSpeed(161460000) === '161.4 Mm/s' &&
    shipShopMath.partStatLine('weapon', { Weapon_Damage: 10, Weapon_Firerate: 60 }).includes('sustained') &&
    shipShopMath.partStatLine('weapon', { Weapon_Damage: 10, Weapon_Firerate: 60 }).includes('10 alpha') &&
    shipShopMath.missileTypeLine({ Missile_Damage: 750 }, 'EM') === '750 damage · EM' &&
    shipShopMath.torpedoTitle('Argos IX Torpedo', 'CS', 350) === 'Argos IX Torpedo CS · 350 m/s' &&
    shipShopMath.torpedoTitle('Calamity XII-CS Torpedo', 'CS', 280) === 'Calamity XII-CS Torpedo · 280 m/s' &&
    shipShopMath.torpedoTitle('EX-T10-EM "Executor" Torpedo', 'EM', 350) === 'EX-T10-EM "Executor" Torpedo · 350 m/s' &&
    shipShopMath.rackLoadLine(Array.from({ length: 8 }, () => ({ name: 'tube', minSize: 1, maxSize: 1 }))) === 'S1 x 8' &&
    shipShopMath.rackLoadLine([{ name: 'a', minSize: 2, maxSize: 2 }, { name: 'b', minSize: 2, maxSize: 2 }, { name: 'c', minSize: 1, maxSize: 1 }]) === 'S2 x 2 · S1 x 1',
  'ship shop: quantum speed and sustained DPS use plain labels',
)
const plant = (generation, size) => ({ portId: 'p', kind: 'power', size, stats: { Itemresource_Powergeneration: generation } })
check(
  shipShopMath.powerGenerated([plant(23, 3), plant(23, 3)]) === 30 &&
    shipShopMath.powerGenerated([plant(25, 3), plant(25, 3)]) === 32 &&
    shipShopMath.powerGenerated([plant(19, 2), plant(19, 2)]) === 24 &&
    shipShopMath.powerGenerated([plant(16, 1), plant(16, 1)]) === 18 &&
    shipShopMath.powerGenerated([plant(14, 1), plant(14, 1)]) === 16 &&
    shipShopMath.powerGenerated([plant(17, 1)]) === 17,
  'ship shop: two plants share a rounded budget plus a size bonus',
)
check(
  shipShopMath.radarRangeForPips({ Radar_DistanceMin: 845, Radar_DistanceMax: 1105, Power_Segments: 5, Power_Min: 2 }, 2) === 949 &&
    shipShopMath.radarRangeForPips({ Radar_DistanceMin: 845, Radar_DistanceMax: 1105, Power_Segments: 5 }, 5) === 1105 &&
    shipShopMath.radarRangeForPips({ Radar_DistanceMin: 845, Radar_DistanceMax: 1105, Power_Segments: 5 }, 0) === null,
  'ship shop: radar distance moves from the minimum assignment toward the maximum',
)
const coolerColumn = shipShopMath.powerColumns(0, [
  { portId: 'c1', kind: 'cooler', size: 1, stats: { Power_Segments: 5, Power_Min: 3 } },
  { portId: 'c2', kind: 'cooler', size: 1, stats: { Power_Segments: 5, Power_Min: 3 } },
])[0]
check(
  coolerColumn.blocks.map((block) => block.size).join(',') === '3,1,1,3,1,1' &&
    coolerColumn.blocks[3].groupStart === true,
  'ship shop: each cooler keeps its own pip group, with the minimum as one block',
)
const engineColumn = shipShopMath.powerColumns(0, [
  { portId: 'blade', kind: 'flight', size: 1, stats: { Power_Segments: 4, Power_Min: 1 } },
])[0]
check(
  engineColumn.label === 'Engines' &&
    engineColumn.blocks.length === 4 &&
    shipShopMath.coolantDemand(
      [{ portId: 'blade', kind: 'flight', size: 1, stats: { Power_Segments: 4, Power_Min: 1 } }],
      new Map([['blade', 4]]),
    ) === 4,
  'ship shop: the flight blade is the engines stack and those pips draw coolant',
)
check(
  shipShopMath.weaponFullPips([{ portId: 'm', kind: 'mining', size: 2, stats: { Power_Segments: 2 } }]) === 0 &&
    shipShopMath.powerColumns(4, [
      { portId: 'm', kind: 'mining', size: 2, stats: { Power_Segments: 2, Power_Min: 1 } },
    ]).some((column) => column.label === 'Mining' && column.blocks.length === 2),
  'ship shop: a mining laser keeps its own pip stack',
)
const budgetColumns = shipShopMath.powerColumns(4, [
  { portId: 'eng', kind: 'flight', size: 1, stats: { Power_Segments: 4, Power_Min: 1 } },
  { portId: 'qd', kind: 'quantum', size: 1, stats: { Power_Segments: 1, Power_Min: 1 } },
  { portId: 'c1', kind: 'cooler', size: 1, stats: { Power_Segments: 3, Power_Min: 1 } },
])
const generated = 6
const defaults = shipShopMath.defaultPower(budgetColumns, generated)
check(
  defaults.qd === 0 &&
    defaults.weapons === 0 &&
    defaults.eng === 1 &&
    defaults.c1 === 1 &&
    Object.values(defaults).reduce((sum, value) => sum + value, 0) <= generated,
  'ship shop: default power is each minimum block, quantum stays off, and unused weapon pips stay off',
)
check(
  Object.values(shipShopMath.resolvedPower(budgetColumns, { weapons: 4, engines: 4, quantum: 1, coolers: 3 }, generated)).reduce((sum, value) => sum + value, 0) <= generated,
  'ship shop: an over-budget save falls back inside the plant budget',
)
const twoShields = shipShopMath.powerColumns(0, [
  { portId: 's1', kind: 'shield', size: 1, stats: { Power_Segments: 3, Power_Min: 1 } },
  { portId: 's2', kind: 'shield', size: 1, stats: { Power_Segments: 3, Power_Min: 1 } },
])
const shieldDefaults = shipShopMath.defaultPower(twoShields, 10)
const splitShields = shipShopMath.resolvedPower(twoShields, { shields: 2 }, 10)
const ownShields = shipShopMath.resolvedPower(twoShields, { s1: 1, s2: 3 }, 10)
check(
  shieldDefaults.s1 === 1 && shieldDefaults.s2 === 1 && splitShields.s1 === 1 && splitShields.s2 === 1 && ownShields.s1 === 1 && ownShields.s2 === 3,
  'ship shop: each shield keeps its own pip stack, and a shared save splits across them',
)
check(
  shipShopMath.partStatLine('radar', { Radar_DistanceMin: 845, Radar_DistanceMax: 1105, Power_Min: 2, Power_Segments: 5 }).includes('2–5 pips'),
  'ship shop: radar line includes the minimum and maximum pip usage',
)
check(
  shipShopMath.flightRole(
    { entityClass: 'controller_flight_aegs_sabre_raven', displayName: 'Flight Blade', kind: 'flight', size: 1, stats: { Flight_ScmSpeed: 240, Flight_MaxSpeed: 1400, Flight_Pitch: 52, Flight_Yaw: 43 }, burstDps: 0 },
    { entityClass: 'controller_flight_aegs_sabre_raven_ex', displayName: 'Flight Blade', kind: 'flight', size: 1, stats: { Flight_ScmSpeed: 233, Flight_MaxSpeed: 1320, Flight_Pitch: 56, Flight_Yaw: 45 }, burstDps: 0 },
  ) === 'Speed',
  'ship shop: a faster blade with less pitch reads as a speed blade',
)
check(
  shipShopMath.weaponSustainedDps({ Weapon_Damage: 10, Weapon_Firerate: 6000, Weapon_Damage_Energy: 10, Weapon_RegenPerSec: 20 }, 1) === 200 &&
    shipShopMath.weaponSustainedDps({ Weapon_Damage: 10, Weapon_Firerate: 6000, Weapon_Damage_Energy: 10, Weapon_RegenPerSec: 20 }, 0.5) === 100,
  'ship shop: energy sustained DPS follows capacitor regen at the weapon power share',
)
check(
  shipShopMath.weaponBurstDps({ Weapon_Damage: 10, Weapon_Firerate: 60 }) === 10 &&
    shipShopMath.weaponBurstDps({ Weapon_Damage: 10, Weapon_Firerate: 60, Weapon_ChargeTime: 2.5 }) === 4 &&
    shipShopMath.weaponBurstDps({ Weapon_Damage: 10, Weapon_Firerate: 30, Weapon_ChargeTime: 1 }) === 5,
  'ship shop: a charge replaces burst DPS only when it is slower than the fire rate',
)
const bracer = {
  Power_Segments: 3,
  Power_Min: 1,
  Power_LowStart: 1,
  Power_LowMod: 0.7,
  Power_MedStart: 2,
  Power_MedMod: 0.85,
  Power_HighStart: 3,
  Power_HighMod: 1,
  Itemresource_Coolantgeneration: 34,
  Signature_Ir: 7260,
  Signature_Em: 1490,
}
const regulus = { portId: 'p', kind: 'power', size: 1, stats: { Itemresource_Powergeneration: 16, Signature_Em: 7920 } }
const oneCooler = new Map([['c1', 2], ['c2', 0]])
const splitCoolers = new Map([['c1', 1], ['c2', 1]])
const ravenCoolers = [
  regulus,
  { ...regulus, portId: 'p2' },
  { portId: 'c1', kind: 'cooler', size: 1, stats: bracer },
  { portId: 'c2', kind: 'cooler', size: 1, stats: bracer },
]
check(
  Math.floor(shipShopMath.coolantDemand(ravenCoolers, oneCooler) / shipShopMath.coolantSupply(ravenCoolers, oneCooler) * 100) === 15 &&
    Math.floor(shipShopMath.coolantDemand(ravenCoolers, splitCoolers) / shipShopMath.coolantSupply(ravenCoolers, splitCoolers) * 100) === 18 &&
    shipShopMath.coolantDemand(
      [{ portId: 'q', kind: 'quantum', size: 1, stats: { Power_Segments: 3, Power_LowStart: 1, Power_LowMod: 0.7 } }],
      new Map([['q', 0]]),
    ) === 0 &&
    Math.round(shipShopMath.coolantDemand(
      [{ portId: 's', kind: 'shield', size: 1, stats: { Power_Segments: 3, Power_LowStart: 1, Power_LowMod: 0.7 } }],
      new Map([['s', 1]]),
    ) * 10) === 17,
  'ship shop: cooling is pips in use over cooler output, and shields add pips times the band',
)
check(
  Math.round(shipShopMath.infraredSignature(ravenCoolers, oneCooler, 2, shipShopMath.coolantSupply(ravenCoolers, oneCooler), 0.72) * 10) ===
    Math.round(shipShopMath.infraredSignature(ravenCoolers, splitCoolers, 2, shipShopMath.coolantSupply(ravenCoolers, splitCoolers), 0.72) * 10) &&
    Math.floor(shipShopMath.electromagneticSignature(ravenCoolers, oneCooler, 18, 0, 0.72) / 100) / 10 === 1.8 &&
    Math.floor(shipShopMath.electromagneticSignature(ravenCoolers, splitCoolers, 18, 0, 0.72) / 100) / 10 === 1.7,
  'ship shop: IR stays put when the same coolers only move pips, and EM follows the plant budget plus cooler fraction',
)
check(
  shipShopMath.temperatureInfrared({ Temp_Enabled: 1, Temp_IrPerDegree: 6, Temp_IrMinimum: 333, Temp_MinCooling: 303, Temp_Overheat: 423 }, 1) === 540 &&
    shipShopMath.temperatureInfrared({ Temp_Enabled: 1, Temp_IrPerDegree: 6, Temp_IrMinimum: 333, Temp_MinCooling: 303, Temp_Overheat: 423 }, 0) === 0 &&
    shipShopMath.temperatureInfrared({ Temp_IrPerDegree: 6, Temp_MinCooling: 303, Temp_Overheat: 423 }, 1) === 0,
  'ship shop: temperature IR is added only while cooling is short and the item emits it',
)
const allstopShield = { Shield_Maxhealth: 3168, Shield_Regen: 602, Shield_DamagedRegenDelay: 5.75, Shield_DownedRegenDelay: 11.5 }
check(
  shipShopMath.shieldRegenRate(allstopShield, 0) === 0 &&
    Math.round(shipShopMath.shieldRegenRate(allstopShield, 0.7)) === 421 &&
    Math.round(shipShopMath.shieldRegenRate(allstopShield, 0.85)) === 512 &&
    shipShopMath.shieldRegenRate(allstopShield, 1) === 602 &&
    Math.round(shipShopMath.shieldFullChargeSeconds(allstopShield, 1) * 10) === 53 &&
    shipShopMath.shieldFullChargeSeconds(allstopShield, 0) == null &&
    shipShopMath.partStatLine('shield', allstopShield).includes('full charge 5.2s') &&
    shipShopMath.partStatLine('shield', allstopShield).includes('damaged 5.7s') &&
    shipShopMath.partStatLine('shield', allstopShield).includes('downed 11.5s'),
  'ship shop: shield regen and full charge follow the pip band',
)
const ballisticGun = (portId) => ({ portId, kind: 'weapon', size: 3, stats: { Weapon_Power: 0.1, Signature_Em: 100 } })
const ballisticGuns = [ballisticGun('g1'), ballisticGun('g2'), ballisticGun('g3'), ballisticGun('g4')]
const ballisticColumn = shipShopMath.powerColumns(4, ballisticGuns)[0]
const energyGuns = [
  { portId: 'n1', kind: 'weapon', size: 3, stats: { Weapon_Power: 1.5, Signature_Em: 743 } },
  { portId: 'n2', kind: 'weapon', size: 3, stats: { Weapon_Power: 1.5, Signature_Em: 743 } },
  { portId: 'w1', kind: 'weapon', size: 3, stats: { Weapon_Power: 1 } },
  { portId: 'w2', kind: 'weapon', size: 3, stats: { Weapon_Power: 1 } },
]
check(
  shipShopMath.weaponFullPips([{ portId: 'g', kind: 'weapon', size: 1, stats: { Weapon_Power: 1.3 } }]) === 2 &&
    shipShopMath.weaponFullPips(ballisticGuns) === 1 &&
    shipShopMath.weaponFullPips(energyGuns) === 5 &&
    ballisticColumn.blocks.filter((block) => !block.disabled).length === 1 &&
    ballisticColumn.blocks.filter((block) => block.disabled).length === 3 &&
    shipShopMath.powerColumns(4, energyGuns)[0].blocks.every((block) => !block.disabled) &&
    shipShopMath.powerColumns(0, [
      { portId: 's', kind: 'shield', size: 1, stats: { Power_Segments: 3, Power_Min: 1 } },
    ])[0].blocks.every((block) => !block.disabled),
  'ship shop: weapon pips round up to full power, and pips above that stay disabled',
)
const empPart = [{ portId: 'emp', kind: 'emp', size: 4, stats: { Weapon_Power: 1, Emp_Damage: 2750, Emp_Radius: 750, Emp_Charge: 20 } }]
const empColumn = shipShopMath.powerColumns(0, empPart).find((column) => column.id === 'emp')
check(
  empColumn?.blocks.length === 1 &&
    empColumn.blocks[0].size === 1 &&
    shipShopMath.coolantDemand(empPart, new Map([['emp', 1]])) === 1 &&
    shipShopMath.coolantDemand(empPart, new Map([['emp', 0]])) === 0 &&
    shipShopMath.partStatLine('emp', empPart[0].stats).includes('distortion') &&
    shipShopMath.partStatLine('emp', empPart[0].stats).includes('750 m'),
  'ship shop: EMP has its own pip and that pip counts toward cooling',
)
check(
  shipShopMath.resolvedPower(shipShopMath.powerColumns(4, ballisticGuns), { weapons: 4 }, 20).weapons === 1 &&
    shipShopMath.togglePowerColumn(ballisticColumn.blocks, 0, 20) === 1 &&
    shipShopMath.clickPowerColumn(ballisticColumn.blocks, 1, 3, 10) === 1 &&
    shipShopMath.weaponPowerDraw(ballisticGuns, 1) === 0.4 &&
    shipShopMath.weaponPowerDraw([{ portId: 'g', kind: 'weapon', size: 1, stats: { Weapon_Power: 1.3 } }], 2) === 1.3 &&
    shipShopMath.coolantDemand(ballisticGuns, new Map(), 1) === 0.4 &&
    shipShopMath.coolantDemand(ballisticGuns, new Map(), 0) === 0 &&
    shipShopMath.electromagneticSignature(ballisticGuns, new Map(), 18, 1, 1) >
      shipShopMath.electromagneticSignature(ballisticGuns, new Map(), 18, 0, 1),
  'ship shop: ballistic guns fill on one pip, and cooling uses their 0.4 power sum',
)
const nightfall = {
  Power_Segments: 2,
  Power_Min: 1,
  Power_MedStart: 1,
  Power_MedMod: 0.85,
  Power_HighStart: 2,
  Power_HighMod: 1,
  Itemresource_Coolantgeneration: 34,
  Signature_Ir: 3670,
  Signature_Em: 500,
}
const m80Parts = [
  { portId: 'p', kind: 'power', size: 2, stats: { Itemresource_Powergeneration: 18, Signature_Em: 7430 } },
  { portId: 'c', kind: 'cooler', size: 2, stats: nightfall },
  { portId: 'r', kind: 'radar', size: 2, stats: { Power_Segments: 8, Power_Min: 2, Power_HighStart: 1, Power_HighMod: 1, Signature_Em: 2160, Radar_DistanceMin: 1300, Radar_DistanceMax: 2184 } },
  ...[1, 2, 3, 4].map((index) => ({ portId: `d${index}`, kind: 'weapon', size: 5, stats: { Weapon_Power: 0.1, Signature_Em: 41.3 } })),
]
const m80Pips = new Map([['c', 1], ['r', 2]])
const m80Demand = shipShopMath.coolantDemand(m80Parts, m80Pips, 1)
const m80Supply = shipShopMath.coolantSupply(m80Parts, m80Pips)
check(
  m80Demand === 6.4 &&
    Math.floor((m80Demand / m80Supply) * 100) === 44 &&
    shipShopMath.formatShopNumber(shipShopMath.infraredSignature(m80Parts, m80Pips, m80Demand, m80Supply, 1)) === '690.8' &&
    shipShopMath.radarRangeForPips(m80Parts[2].stats, 2) === 1521,
  'ship shop: one NightFall and four ballistic guns cool at 44 percent with IR 690.8',
)
check(
  shipShopMath.coolantBarPercent(m80Supply, m80Demand, false) === 44 &&
    shipShopMath.coolersShutOff(m80Parts, m80Pips) === false &&
    shipShopMath.coolersShutOff(m80Parts, new Map([['r', 2]])) === true &&
    shipShopMath.coolantBarPercent(0, 6.4, true) === shipShopMath.COOLANT_SHUTOFF_PERCENT &&
    shipShopMath.coolantBarPercent(0, 0, false) == null &&
    shipShopMath.coolersShutOff(m80Parts.filter((part) => part.kind !== 'cooler'), new Map()) === false,
  'ship shop: removing every cooler pip shows 999 percent because coolant is shut off',
)

console.log(`Unit tests: ${pass} passed`)
