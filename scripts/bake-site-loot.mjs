#!/usr/bin/env node
/**
 * Bake only game-site-loot.json (faster than full parse-game-data).
 * Usage: node scripts/bake-site-loot.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSiteLoot } from './lib/parseSiteLoot.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXTRACTED = join(ROOT, 'extracted-data')
const OUT = join(ROOT, 'src', 'data', 'game-site-loot.json')
const LOC = join(EXTRACTED, 'Data', 'Localization', 'english', 'global.ini')

function loadLocalization() {
  if (!existsSync(LOC)) return {}
  const localization = {}
  for (const line of readFileSync(LOC, 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    localization[key] = value
    if (key.includes(',')) {
      const base = key.split(',')[0]
      if (!localization[base]) localization[base] = value
    }
  }
  return localization
}

function loadJson(name) {
  const path = join(ROOT, 'src', 'data', name)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8'))
}

function mapByClass(rows, keys = ['entityClass', 'internalName', 'name']) {
  const map = new Map()
  for (const row of rows || []) {
    for (const k of keys) {
      if (row?.[k]) {
        map.set(row[k], row)
        break
      }
    }
  }
  return map
}

const localization = loadLocalization()
const fps = loadJson('game-fps-weapons.json')
const comps = loadJson('game-components.json')
const bps = loadJson('game-blueprints.json')

const catalogs = {
  fpsByClass: mapByClass(fps?.weapons),
  componentByClass: mapByClass(comps?.components || comps?.items),
  blueprintByClass: mapByClass(bps?.blueprints),
}

const data = parseSiteLoot({ extractedRoot: EXTRACTED, localization, catalogs })
writeFileSync(OUT, JSON.stringify(data, null, 2))
console.log(`Wrote ${OUT}`)
console.log(JSON.stringify(data.summary, null, 2))
for (const loc of data.locationTypes) {
  const n = data.byLocation[loc.id]?.length || 0
  console.log(`  ${loc.label}: ${n} items`)
}
