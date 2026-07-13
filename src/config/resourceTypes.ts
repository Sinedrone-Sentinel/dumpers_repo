import {
  EXTRA_CATALOG_RESOURCE_KEYS,
  isSalvageResource,
  isGasResource,
  isHalogenResource,
  isFuelResource,
  isContrabandResource,
  isTradeGoodResource,
} from './extraResources'
import { WIKELO_ITEM_RESOURCE_KEYS } from './wikeloItems'

function slugifyResourceName(name: string | null | undefined): string {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export type ResourceType =
  | 'ore'
  | 'gem'
  | 'harvest'
  | 'shop_special'
  | 'salvage'
  | 'gas'
  | 'halogen'
  | 'fuel'
  | 'contraband'
  | 'trade_good'
  | 'wikelo_item'

const GEM_RESOURCE_KEYS = new Set([
  'aphorite',
  'beradom',
  'carinite',
  'dolivine',
  'feynmaline',
  'glacosite',
  'hadanite',
  'janalite',
  'sadaryx',
])

const HARVEST_RESOURCE_KEYS = new Set(['yormandi_eye', 'yormandi_tongue'])

const SHOP_SPECIAL_RESOURCE_KEYS = new Set([
  'saldynium_ore',
  // Wikelo Emporium currency — mission-awarded barter items, whole units
  'wikelo_favor',
  'polaris_bit',
  'council_scrip',
  'mg_scrip',
])

/** Whole-unit materials — gems, harvest, shop specials, Wikelo gear (never fractional). */
export function isWholeUnitResource(resourceKey: string): boolean {
  return (
    GEM_RESOURCE_KEYS.has(resourceKey) ||
    HARVEST_RESOURCE_KEYS.has(resourceKey) ||
    SHOP_SPECIAL_RESOURCE_KEYS.has(resourceKey) ||
    WIKELO_ITEM_RESOURCE_KEYS.has(resourceKey)
  )
}

/** Wikelo Emporium reward gear (armor, weapons, magazines) — whole units, no quality tiers. */
export function isWikeloItemResource(resourceKey: string): boolean {
  return WIKELO_ITEM_RESOURCE_KEYS.has(resourceKey)
}

export function isGemResource(resourceKey: string): boolean {
  return GEM_RESOURCE_KEYS.has(resourceKey)
}

export function isHarvestResource(resourceKey: string): boolean {
  return HARVEST_RESOURCE_KEYS.has(resourceKey)
}

export function isShopSpecialResource(resourceKey: string): boolean {
  return SHOP_SPECIAL_RESOURCE_KEYS.has(resourceKey)
}

export function getResourceType(resourceKey: string): ResourceType {
  if (isSalvageResource(resourceKey)) return 'salvage'
  if (isGasResource(resourceKey)) return 'gas'
  if (isHalogenResource(resourceKey)) return 'halogen'
  if (isFuelResource(resourceKey)) return 'fuel'
  if (isContrabandResource(resourceKey)) return 'contraband'
  if (isTradeGoodResource(resourceKey)) return 'trade_good'
  if (HARVEST_RESOURCE_KEYS.has(resourceKey)) return 'harvest'
  if (SHOP_SPECIAL_RESOURCE_KEYS.has(resourceKey)) return 'shop_special'
  if (WIKELO_ITEM_RESOURCE_KEYS.has(resourceKey)) return 'wikelo_item'
  if (GEM_RESOURCE_KEYS.has(resourceKey)) return 'gem'
  if (EXTRA_CATALOG_RESOURCE_KEYS.has(resourceKey)) return 'trade_good'
  return 'ore'
}

export function getResourceTypeFromLabel(label: string): ResourceType {
  return getResourceType(slugifyResourceName(label))
}

export function resourceLabelClassName(resourceKey: string): string {
  switch (getResourceType(resourceKey)) {
    case 'gem':
      return 'text-amber-400'
    case 'harvest':
      return 'text-purple-400'
    case 'shop_special':
      return 'text-cyan-400'
    case 'wikelo_item':
      return 'text-orange-400'
    case 'salvage':
      return 'text-emerald-400'
    case 'gas':
      return 'text-sky-400'
    case 'halogen':
      return 'text-lime-400'
    case 'fuel':
      return 'text-yellow-400'
    case 'contraband':
      return 'text-rose-400'
    case 'trade_good':
      return 'text-teal-400'
    default:
      return 'text-red-400'
  }
}

export function resourceChipClassName(resourceKey: string): string {
  switch (getResourceType(resourceKey)) {
    case 'gem':
      return 'bg-amber-950/30 text-amber-400 border-amber-500/20'
    case 'harvest':
      return 'bg-purple-950/30 text-purple-400 border-purple-500/20'
    case 'shop_special':
      return 'bg-cyan-950/30 text-cyan-400 border-cyan-500/20'
    case 'wikelo_item':
      return 'bg-orange-950/30 text-orange-400 border-orange-500/20'
    case 'salvage':
      return 'bg-emerald-950/30 text-emerald-400 border-emerald-500/20'
    case 'gas':
      return 'bg-sky-950/30 text-sky-400 border-sky-500/20'
    case 'halogen':
      return 'bg-lime-950/30 text-lime-400 border-lime-500/20'
    case 'fuel':
      return 'bg-yellow-950/30 text-yellow-400 border-yellow-500/20'
    case 'contraband':
      return 'bg-rose-950/30 text-rose-400 border-rose-500/20'
    case 'trade_good':
      return 'bg-teal-950/30 text-teal-400 border-teal-500/20'
    default:
      return 'bg-red-950/30 text-red-400 border-red-500/20'
  }
}

export function resourceQuantityUnitLabel(resourceKey: string): string {
  return isWholeUnitResource(resourceKey) ? 'units' : 'SCU'
}
