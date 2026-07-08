/**
 * Canonical ore names and hand-mineable classification for mining location parsing.
 * Hand-mineables are excluded from the ship RS Tracker reference (FPS gems + select ground-vehicle gems).
 */

import {
  buildOreMasterList,
  parseCompendiumOreNames,
  resolveCanonicalOreName,
} from './miningOreCanonical.mjs'
import {
  GROUND_VEHICLE_GEMS,
  HAND_MINEABLE_ORES,
  stripMineableLabel,
} from './miningOreConsts.mjs'

export { HAND_MINEABLE_ORES, GROUND_VEHICLE_GEMS, stripMineableLabel }

/** @deprecated Use ORE_SPELLING_ALIASES from miningOreCanonical — kept for imports. */
export { ORE_SPELLING_ALIASES as ORE_COMPENDIUM_ALIASES } from './miningOreCanonical.mjs'

/**
 * Ship-mining preset slug → canonical ore name (RS Tracker / composition display).
 * Shared by parseMiningSpawns and hppMineablePresets.
 */
export const SHIP_ORE_SLUG_TO_NAME = {
  quantainium: 'Quantainium',
  stileron: 'Stileron',
  sileron: 'Stileron',
  savrilium: 'Savrilium',
  ouratite: 'Ouratite',
  riccite: 'Riccite',
  lindinium: 'Lindinium',
  beryl: 'Beryl',
  taranite: 'Taranite',
  borase: 'Borase',
  gold: 'Gold',
  bexalite: 'Bexalite',
  laranite: 'Laranite',
  aslarite: 'Aslarite',
  titanium: 'Titanium',
  tungsten: 'Tungsten',
  agricium: 'Agricium',
  torite: 'Torite',
  hephaestanite: 'Hephaestanite',
  tin: 'Tin',
  quartz: 'Quartz',
  corundum: 'Corundum',
  copper: 'Copper',
  silicon: 'Silicon',
  iron: 'Iron',
  aluminium: 'Aluminum',
  aluminum: 'Aluminum',
  ice: 'Ice',
}

/** Composition element display names that differ from MineableElement record stems. */
export const COMPOSITION_ELEMENT_ALIASES = {
  Sileron: 'Stileron',
  Aluminium: 'Aluminum',
}

/**
 * Normalize a composition part element name from game MineableElement records.
 */
export function normalizeCompositionElementName(rawName) {
  const trimmed = String(rawName || '').trim()
  if (!trimmed || trimmed === 'Unknown') return trimmed || 'Unknown'
  if (COMPOSITION_ELEMENT_ALIASES[trimmed]) return COMPOSITION_ELEMENT_ALIASES[trimmed]
  const fromSlug = SHIP_ORE_SLUG_TO_NAME[trimmed.toLowerCase()]
  if (fromSlug) return fromSlug
  return normalizeCompendiumOreName(trimmed)
}

/** Spawn keys → preferred compendium / guide location label. */
export const SPAWN_KEY_PREFERRED_GUIDE_NAME = {
  Pyro2: 'Monox',
}

export function normalizeCompendiumOreName(name, masterList = null) {
  return resolveCanonicalOreName(name, masterList)
}

/**
 * FPS gem habitat at a specific body from localization mineable lines.
 * No parenthetical → surface and caves; "(Caves only)" → caves only.
 */
export function parseHandMineableHabitatRaw(raw) {
  const text = String(raw || '').trim()
  const paren = text.match(/\(([^)]+)\)\s*$/)
  if (!paren) return 'both'
  const note = paren[1].toLowerCase()
  if (note.includes('caves only') || note === 'caves') return 'caves'
  if (note.includes('surface only') || note === 'surface') return 'surface'
  if (note.includes('surface') && note.includes('cave')) return 'both'
  return 'both'
}

/**
 * Normalize a raw desc / compendium ore label against the compendium master list.
 * @param {string} raw
 * @param {Set<string> | string[] | null} [masterList]
 */
export function normalizeMineableLabel(raw, masterList = null) {
  return resolveCanonicalOreName(stripMineableLabel(raw), masterList)
}

export function isHandMineableOre(name) {
  return HAND_MINEABLE_ORES.has(normalizeCompendiumOreName(name))
}

/** Manual / FPS / ground-vehicle mine type (distinct from ship-ore rarity tier). */
export function isHandMineableType(name) {
  const canonical = normalizeCompendiumOreName(name)
  return HAND_MINEABLE_ORES.has(canonical) || GROUND_VEHICLE_GEMS.has(canonical)
}

export function preferredGuideNameForSpawnKey(spawnKey, fallback) {
  return SPAWN_KEY_PREFERRED_GUIDE_NAME[spawnKey] ?? fallback
}

export { buildOreMasterList, parseCompendiumOreNames }
