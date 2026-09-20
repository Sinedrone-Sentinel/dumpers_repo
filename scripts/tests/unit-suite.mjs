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
  'src/lib/qualityModifiers.ts',
  'src/lib/inAppBrowser.ts',
  'src/lib/oauthReturn.ts',
  'src/lib/friendInvite.ts',
  'src/lib/canonicalizeBlueprintId.ts',
  'src/lib/miningAdvisorCrypto.ts',
  'src/lib/bazaarStockDeduct.ts',
  'src/lib/miningLocationAliases.ts',
  'src/lib/miningClusterProfiles.ts',
  'supabase/functions/mining-loadout-advisor/gearShopLookup.ts',
  'supabase/functions/mining-loadout-advisor/advisorPrompt.ts',
  'supabase/functions/site-help-bot/helpPrompt.ts',
  'src/lib/aiChatUsage.ts',
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
const gearShop = await import(pathToFileURL(path.join(outDir, 'gearShopLookup.mjs')).href)
const advisorPrompt = await import(pathToFileURL(path.join(outDir, 'advisorPrompt.mjs')).href)
const helpPrompt = await import(pathToFileURL(path.join(outDir, 'helpPrompt.mjs')).href)
const aiUsage = await import(pathToFileURL(path.join(outDir, 'aiChatUsage.mjs')).href)

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
  advisorPrompt.pickShubinCloser(() => 0) === advisorPrompt.ADVISOR_SHUBIN_CLOSERS[0],
  'pickShubinCloser uses the first closer at random 0',
)
check(
  advisorPrompt.pickShubinCloser(() => 0.999) ===
    advisorPrompt.ADVISOR_SHUBIN_CLOSERS[advisorPrompt.ADVISOR_SHUBIN_CLOSERS.length - 1],
  'pickShubinCloser uses the last closer near 1',
)

// --- Site Help bot knowledge base ------------------------------------------
const helpKb = await import(
  pathToFileURL(path.join(root, 'scripts/lib/helpKnowledgeBase.mjs')).href
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
const freshKnowledge = helpKb.buildHelpKnowledgeBase(archiveContent)
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

// The bot must answer from the Archive only, so the prompt has to carry it.
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

console.log(`Unit tests: ${pass} passed`)
