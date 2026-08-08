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

console.log(`Unit tests: ${pass} passed`)
