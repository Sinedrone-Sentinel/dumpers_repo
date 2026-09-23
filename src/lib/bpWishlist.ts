import { useCallback, useEffect, useState } from 'react'
import gameBlueprints from '../data/game-blueprints.json'
import { isWholeUnitResource } from '../config/resourceTypes'
import {
  craftMaterialLabel,
  craftMaterialOptionsForSlot,
  craftMaterialResourceKey,
  type BlueprintWithSlots,
} from './blueprintResources'
import { hasEnough, buildOwnedStockIndex, type CraftStockCardLite, type OwnedStockIndex } from './craftFromStock'
import { calculateBlueprintDfpWithParts, calculateMaterialDfpLine, type BlueprintDfpInput } from './dfp'
import { formatQuantityForResource, fromMilliScu, toMilliScu } from './resourceQuantity'
import { supabase } from './supabase'

export const BP_WISHLIST_MAX_LISTS = 10
export const BP_WISHLIST_MAX_RECIPES = 20

export const BP_WISHLIST_LOCK_TOOLTIP =
  'Sign in to save blueprints to a wishlist. Each list keeps the blueprint, the material qualities you picked, and how many you want to craft. You can keep 10 lists, with 20 unique recipes on each.'

export interface WishlistMaterial {
  slotIndex: number
  resourceKey: string
  label: string
  quality: number
  scu: number
  wholeUnit: boolean
}

export interface WishlistItem {
  id: string
  wishlist_id: string
  blueprint_key: string
  blueprint_name: string
  quantity: number
  slot_qualities: Record<string, number>
  materials: WishlistMaterial[]
  recipe_signature: string
  created_at: string
}

export interface Wishlist {
  id: string
  name: string
  use_tracked_resources: boolean
  created_at: string
  updated_at: string
  items: WishlistItem[]
}

export interface WishlistAddResult {
  wishlistId: string
  status: 'added' | 'stacked' | 'full' | 'missing'
}

const blueprintByKey = new Map<string, BlueprintDfpInput>()
for (const bp of gameBlueprints.blueprints as BlueprintDfpInput[]) {
  if (bp.internalName) blueprintByKey.set(bp.internalName, bp)
}

function oneCraftAmount(
  option: { quantity?: number; standardCargoUnits?: number },
  slotCount: number,
  resourceKey: string
): number {
  const optQty = option.quantity ?? 1
  if (isWholeUnitResource(resourceKey)) return slotCount * optQty
  const units = option.standardCargoUnits ?? option.quantity ?? 0
  return fromMilliScu(toMilliScu(units) * slotCount)
}

export function snapshotWishlistRecipe(
  blueprint: BlueprintWithSlots & { internalName?: string },
  slotQualities: Record<number, number | null | undefined>
): { materials: WishlistMaterial[]; slotQualities: Record<number, number> } {
  const materials: WishlistMaterial[] = []
  const saved: Record<number, number> = {}
  ;(blueprint.slots ?? []).forEach((slot, slotIndex) => {
    const option = craftMaterialOptionsForSlot(slot)[0]
    if (!option) return
    const label = craftMaterialLabel(option)
    const resourceKey = craftMaterialResourceKey(option)
    if (!label || !resourceKey) return
    const quality = slotQualities[slotIndex]
    if (quality == null || !Number.isFinite(quality)) return
    const slotCount = slot.requiredCount ?? 1
    materials.push({
      slotIndex,
      resourceKey,
      label,
      quality,
      scu: oneCraftAmount(option, slotCount, resourceKey),
      wholeUnit: isWholeUnitResource(resourceKey),
    })
    saved[slotIndex] = quality
  })
  return { materials, slotQualities: saved }
}

function asMaterials(value: unknown): WishlistMaterial[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const rec = row as Record<string, unknown>
    const resourceKey = typeof rec.resourceKey === 'string' ? rec.resourceKey : ''
    const label = typeof rec.label === 'string' ? rec.label : ''
    if (!resourceKey || !label) return []
    return [{
      slotIndex: Number(rec.slotIndex) || 0,
      resourceKey,
      label,
      quality: Number(rec.quality) || 0,
      scu: Number(rec.scu) || 0,
      wholeUnit: Boolean(rec.wholeUnit),
    }]
  })
}

function asSlotQualities(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(raw)
    if (Number.isFinite(n)) out[key] = n
  }
  return out
}

function mapItem(row: Record<string, unknown>): WishlistItem {
  return {
    id: String(row.id),
    wishlist_id: String(row.wishlist_id),
    blueprint_key: String(row.blueprint_key ?? ''),
    blueprint_name: String(row.blueprint_name ?? 'Blueprint'),
    quantity: Number(row.quantity) || 1,
    slot_qualities: asSlotQualities(row.slot_qualities),
    materials: asMaterials(row.materials),
    recipe_signature: String(row.recipe_signature ?? ''),
    created_at: String(row.created_at ?? ''),
  }
}

export async function fetchBpWishlists(): Promise<Wishlist[]> {
  const { data, error } = await supabase
    .from('bp_wishlists')
    .select('id, name, use_tracked_resources, created_at, updated_at, bp_wishlist_items(*)')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Record<string, unknown>[]
  return rows.map((row) => {
    const rawItems = Array.isArray(row.bp_wishlist_items) ? row.bp_wishlist_items : []
    const items = rawItems
      .map((item) => mapItem(item as Record<string, unknown>))
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.blueprint_name.localeCompare(b.blueprint_name))
    return {
      id: String(row.id),
      name: String(row.name ?? ''),
      use_tracked_resources: Boolean(row.use_tracked_resources),
      created_at: String(row.created_at ?? ''),
      updated_at: String(row.updated_at ?? ''),
      items,
    }
  })
}

function rpcError(error: { message: string } | null): void {
  if (!error) return
  const message = error.message.replace(/^.*ERROR:\s*/i, '').trim()
  throw new Error(message || 'Could not update this wishlist')
}

export async function createBpWishlist(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_bp_wishlist', { p_name: name })
  rpcError(error)
  return String(data)
}

export async function renameBpWishlist(wishlistId: string, name: string): Promise<void> {
  const { error } = await supabase.rpc('rename_bp_wishlist', {
    p_wishlist_id: wishlistId,
    p_name: name,
  })
  rpcError(error)
}

export async function deleteBpWishlist(wishlistId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_bp_wishlist', { p_wishlist_id: wishlistId })
  rpcError(error)
}

export async function setBpWishlistUseTracked(wishlistId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_bp_wishlist_use_tracked', {
    p_wishlist_id: wishlistId,
    p_enabled: enabled,
  })
  rpcError(error)
}

export async function addBlueprintToWishlists(input: {
  wishlistIds: string[]
  blueprintKey: string
  blueprintName: string
  slotQualities: Record<number, number>
  materials: WishlistMaterial[]
  quantity: number
}): Promise<WishlistAddResult[]> {
  const { data, error } = await supabase.rpc('add_blueprint_to_wishlists', {
    p_wishlist_ids: input.wishlistIds,
    p_blueprint_key: input.blueprintKey,
    p_blueprint_name: input.blueprintName,
    p_slot_qualities: input.slotQualities,
    p_materials: input.materials,
    p_quantity: input.quantity,
  })
  rpcError(error)
  if (!Array.isArray(data)) return []
  return data.flatMap((row) => {
    if (!row || typeof row !== 'object') return []
    const rec = row as Record<string, unknown>
    const status = rec.status
    if (status !== 'added' && status !== 'stacked' && status !== 'full' && status !== 'missing') return []
    return [{ wishlistId: String(rec.wishlistId), status }]
  })
}

export async function setBpWishlistItemQuantity(itemId: string, quantity: number): Promise<void> {
  const { error } = await supabase.rpc('set_bp_wishlist_item_quantity', {
    p_item_id: itemId,
    p_quantity: quantity,
  })
  rpcError(error)
}

export async function removeBpWishlistItem(itemId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_bp_wishlist_item', { p_item_id: itemId })
  rpcError(error)
}

export async function gotItBpWishlistItem(itemId: string): Promise<void> {
  const { error } = await supabase.rpc('got_it_bp_wishlist_item', { p_item_id: itemId })
  rpcError(error)
}

export function useBpWishlists(userId: string | undefined) {
  const [lists, setLists] = useState<Wishlist[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!userId) {
      setLists([])
      setError(null)
      return
    }
    setLoading(true)
    try {
      setLists(await fetchBpWishlists())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load wishlists')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { lists, loading, error, reload, setError }
}

function slotQualityRecord(item: WishlistItem): Record<number, number> {
  const out: Record<number, number> = {}
  for (const [key, value] of Object.entries(item.slot_qualities)) {
    const idx = Number(key)
    if (Number.isFinite(idx)) out[idx] = value
  }
  return out
}

export function wishlistItemDfp(item: WishlistItem): number {
  const blueprint = blueprintByKey.get(item.blueprint_key)
  if (blueprint) {
    return calculateBlueprintDfpWithParts(blueprint, slotQualityRecord(item), item.quantity).total
  }
  return item.materials.reduce((sum, material) => {
    const line = calculateMaterialDfpLine(material.label, material.quality, material.scu * item.quantity)
    return sum + line.lineTotal
  }, 0)
}

export function wishlistQuantityTotal(items: WishlistItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0)
}

function addAmount(resourceKey: string, current: number, extra: number): number {
  if (isWholeUnitResource(resourceKey)) return Math.trunc(current) + Math.trunc(extra)
  return fromMilliScu(toMilliScu(current) + toMilliScu(extra))
}

export interface WishlistResourceTotal {
  key: string
  label: string
  resourceKey: string
  amount: number
  wholeUnit: boolean
}

/** One total per resource, qualities combined. Amounts include recipe quantity. */
export function combinedResourceTotals(items: WishlistItem[]): WishlistResourceTotal[] {
  const map = new Map<string, WishlistResourceTotal>()
  for (const item of items) {
    for (const material of item.materials) {
      const key = material.resourceKey
      const extra = isWholeUnitResource(material.resourceKey)
        ? Math.trunc(material.scu) * item.quantity
        : fromMilliScu(toMilliScu(material.scu) * item.quantity)
      const existing = map.get(key)
      if (existing) {
        existing.amount = addAmount(material.resourceKey, existing.amount, extra)
      } else {
        map.set(key, {
          key,
          label: material.label,
          resourceKey: material.resourceKey,
          amount: extra,
          wholeUnit: material.wholeUnit,
        })
      }
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export interface WishlistQualityTotal extends WishlistResourceTotal {
  quality: number
}

/** Resource + quality totals. Amounts include recipe quantity. */
export function qualityResourceTotals(items: WishlistItem[]): WishlistQualityTotal[] {
  const map = new Map<string, WishlistQualityTotal>()
  for (const item of items) {
    for (const material of item.materials) {
      const key = `${material.resourceKey}::${material.quality}`
      const extra = isWholeUnitResource(material.resourceKey)
        ? Math.trunc(material.scu) * item.quantity
        : fromMilliScu(toMilliScu(material.scu) * item.quantity)
      const existing = map.get(key)
      if (existing) {
        existing.amount = addAmount(material.resourceKey, existing.amount, extra)
      } else {
        map.set(key, {
          key,
          label: material.label,
          resourceKey: material.resourceKey,
          quality: material.quality,
          amount: extra,
          wholeUnit: material.wholeUnit,
        })
      }
    }
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label) || a.quality - b.quality)
}

export function formatWishlistAmount(resourceKey: string, amount: number, wholeUnit: boolean): string {
  const qty = formatQuantityForResource(resourceKey, amount)
  return wholeUnit ? qty : `${qty} SCU`
}

/** One-craft need per resource+quality on a single recipe (chips share a color). */
export function oneCraftDemand(item: WishlistItem): Map<string, { resourceKey: string; quality: number; amount: number }> {
  const map = new Map<string, { resourceKey: string; quality: number; amount: number }>()
  for (const material of item.materials) {
    const key = `${material.resourceKey}::${material.quality}`
    const existing = map.get(key)
    if (existing) {
      existing.amount = addAmount(material.resourceKey, existing.amount, material.scu)
    } else {
      map.set(key, { resourceKey: material.resourceKey, quality: material.quality, amount: material.scu })
    }
  }
  return map
}

export function stockAtQuality(owned: OwnedStockIndex, resourceKey: string, quality: number): number {
  return owned.get(resourceKey)?.byQuality.get(quality) ?? 0
}

export function demandCovered(
  owned: OwnedStockIndex,
  resourceKey: string,
  quality: number,
  amount: number
): boolean {
  return hasEnough(resourceKey, amount, stockAtQuality(owned, resourceKey, quality))
}

export function recipeReadyForOneCraft(item: WishlistItem, owned: OwnedStockIndex): boolean {
  if (item.materials.length === 0) return true
  for (const demand of oneCraftDemand(item).values()) {
    if (!demandCovered(owned, demand.resourceKey, demand.quality, demand.amount)) return false
  }
  return true
}

export function ownedIndexFromCards(cards: CraftStockCardLite[]): OwnedStockIndex {
  return buildOwnedStockIndex(cards)
}
