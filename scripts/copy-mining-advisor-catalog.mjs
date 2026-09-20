#!/usr/bin/env node
/**
 * Build a compact mining catalog for the Smart Cracker advisor Edge Function.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertAdvisorCatalogShape,
  assertAdvisorGearShopsShape,
  buildAdvisorGearShops,
  buildMiningAdvisorCatalog,
  stripCatalogUuids,
} from './lib/miningAdvisorCatalog.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'src/data/game-mining.json')
const shopSource = join(root, 'src/data/mining-gear-shops.json')
const destDir = join(root, 'supabase/functions/mining-loadout-advisor')
const dest = join(destDir, 'catalog.json')
const shopDest = join(destDir, 'shops.json')

const gameMining = JSON.parse(readFileSync(source, 'utf8'))
const catalogWithIds = buildMiningAdvisorCatalog(gameMining)
assertAdvisorCatalogShape(catalogWithIds)

const gearShops = JSON.parse(readFileSync(shopSource, 'utf8'))
const { payload: shops, missing } = buildAdvisorGearShops(catalogWithIds, gearShops)
assertAdvisorGearShopsShape(shops)

const catalog = stripCatalogUuids(catalogWithIds)

mkdirSync(destDir, { recursive: true })
writeFileSync(dest, JSON.stringify(catalog) + '\n', 'utf8')
writeFileSync(shopDest, JSON.stringify(shops) + '\n', 'utf8')

if (missing.length) {
  // Vehicle-bundled gear (Pitman, ROC Module) is never sold — expected to appear here.
  console.log(`No UEX shop row for ${missing.length}: ${missing.join(', ')}`)
}

const shopBytes = Buffer.byteLength(JSON.stringify(shops))
console.log(
  'Wrote advisor gear shops (' +
    shops.items.length +
    ' items, ' +
    shops.terminals.length +
    ' terminals, UEX ' +
    (shops.generatedAt ?? 'unknown') +
    ', ' +
    shopBytes +
    ' bytes) -> supabase/functions/mining-loadout-advisor/shops.json',
)

const bytes = Buffer.byteLength(JSON.stringify(catalog))
console.log(
  'Wrote mining advisor catalog (' +
    catalog.lasers.length +
    ' lasers, ' +
    catalog.modules.length +
    ' modules, ' +
    catalog.gadgets.length +
    ' gadgets, ' +
    catalog.ores.length +
    ' ores, ' +
    bytes +
    ' bytes) -> supabase/functions/mining-loadout-advisor/catalog.json',
)
