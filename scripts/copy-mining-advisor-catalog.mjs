#!/usr/bin/env node
/**
 * Build a compact mining catalog for the Smart Cracker advisor Edge Function.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertAdvisorCatalogShape, buildMiningAdvisorCatalog } from './lib/miningAdvisorCatalog.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'src/data/game-mining.json')
const destDir = join(root, 'supabase/functions/mining-loadout-advisor')
const dest = join(destDir, 'catalog.json')

const gameMining = JSON.parse(readFileSync(source, 'utf8'))
const catalog = buildMiningAdvisorCatalog(gameMining)
assertAdvisorCatalogShape(catalog)

mkdirSync(destDir, { recursive: true })
writeFileSync(dest, JSON.stringify(catalog) + '\n', 'utf8')

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
