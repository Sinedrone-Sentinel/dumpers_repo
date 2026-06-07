import { supabase } from './supabase'
import {
  extractBlueprintResources,
  type BlueprintWithSlots,
  type ExtractedBlueprintResource,
} from './blueprintResources'

export type CustomOrderStatus = 'pending' | 'in_progress' | 'fulfilled' | 'cancelled'

export interface BlueprintResourceRow {
  resource_key: string
  label: string
  is_active: boolean
  synced_at: string
}

export interface ResourceInventoryRow {
  id: string
  resource_key: string
  quantity: number
  updated_at: string
  updated_by: string | null
}

export interface ResourceCatalogEntry extends BlueprintResourceRow {
  quantity: number
}

export interface CustomOrderItem {
  id: string
  order_id: string
  resource_key: string
  quantity: number
}

export interface CustomOrder {
  id: string
  requester_id: string
  title: string
  notes: string | null
  status: CustomOrderStatus
  created_at: string
  updated_at: string
  items?: CustomOrderItem[]
  requester?: {
    rsi_handle: string | null
    display_name: string | null
    email: string | null
  }
}

export interface OrderFulfillment {
  id: string
  order_id: string
  fulfilled_by: string | null
  notes: string | null
  created_at: string
  items?: { resource_key: string; quantity: number }[]
  order?: Pick<CustomOrder, 'title' | 'status'>
}

export interface ResourceCatalogSyncResult {
  added: number
  reactivated: number
  deactivated: number
  totalActive: number
}

export async function syncBlueprintResourceCatalog(
  blueprints: BlueprintWithSlots[]
): Promise<{ result?: ResourceCatalogSyncResult; error?: string }> {
  const extracted = extractBlueprintResources(blueprints)
  const activeKeys = new Set(extracted.map((r) => r.resourceKey))
  const now = new Date().toISOString()

  if (extracted.length > 0) {
    const { error: upsertError } = await supabase.from('blueprint_resources').upsert(
      extracted.map((resource) => ({
        resource_key: resource.resourceKey,
        label: resource.label,
        is_active: true,
        synced_at: now,
      })),
      { onConflict: 'resource_key' }
    )

    if (upsertError) return { error: upsertError.message }
  }

  const { data: existing, error: fetchError } = await supabase
    .from('blueprint_resources')
    .select('resource_key, is_active')

  if (fetchError) return { error: fetchError.message }

  const toDeactivate = (existing ?? [])
    .filter((row) => row.is_active && !activeKeys.has(row.resource_key))
    .map((row) => row.resource_key)

  if (toDeactivate.length > 0) {
    const { error: deactivateError } = await supabase
      .from('blueprint_resources')
      .update({ is_active: false, synced_at: now })
      .in('resource_key', toDeactivate)

    if (deactivateError) return { error: deactivateError.message }
  }

  const inventorySeed = extracted.map((resource) => ({
    resource_key: resource.resourceKey,
    quantity: 0,
  }))

  if (inventorySeed.length > 0) {
    const { error: inventoryError } = await supabase
      .from('resource_inventory')
      .upsert(inventorySeed, { onConflict: 'resource_key', ignoreDuplicates: true })

    if (inventoryError) return { error: inventoryError.message }
  }

  const priorKeys = new Set((existing ?? []).map((row) => row.resource_key))
  const added = extracted.filter((r) => !priorKeys.has(r.resourceKey)).length
  const reactivated = extracted.filter((r) => {
    const row = (existing ?? []).find((e) => e.resource_key === r.resourceKey)
    return row && !row.is_active
  }).length

  return {
    result: {
      added,
      reactivated,
      deactivated: toDeactivate.length,
      totalActive: extracted.length,
    },
  }
}

export async function fetchResourceCatalog(options?: {
  includeInactive?: boolean
}): Promise<{ data: BlueprintResourceRow[]; error?: string }> {
  let query = supabase
    .from('blueprint_resources')
    .select('*')
    .order('label')

  if (!options?.includeInactive) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as BlueprintResourceRow[] }
}

export async function fetchResourceCatalogWithInventory(options?: {
  includeInactive?: boolean
}): Promise<{ data: ResourceCatalogEntry[]; error?: string }> {
  const [catalogResult, inventoryResult] = await Promise.all([
    fetchResourceCatalog(options),
    fetchInventory(),
  ])

  if (catalogResult.error) return { data: [], error: catalogResult.error }
  if (inventoryResult.error) return { data: [], error: inventoryResult.error }

  const quantityByKey: Record<string, number> = {}
  inventoryResult.data.forEach((row) => {
    quantityByKey[row.resource_key] = Number(row.quantity)
  })

  const data = catalogResult.data.map((resource) => ({
    ...resource,
    quantity: quantityByKey[resource.resource_key] ?? 0,
  }))

  return { data }
}

export async function fetchInventory(): Promise<{
  data: ResourceInventoryRow[]
  error?: string
}> {
  const { data, error } = await supabase
    .from('resource_inventory')
    .select('*')
    .order('resource_key')

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as ResourceInventoryRow[] }
}

export async function adjustInventoryQuantity(
  resourceKey: string,
  delta: number
): Promise<{ error?: string }> {
  const { data: current, error: fetchError } = await supabase
    .from('resource_inventory')
    .select('quantity')
    .eq('resource_key', resourceKey)
    .maybeSingle()

  if (fetchError) return { error: fetchError.message }

  const nextQty = Math.max(0, Number(current?.quantity ?? 0) + delta)

  const { error } = await supabase
    .from('resource_inventory')
    .upsert(
      { resource_key: resourceKey, quantity: nextQty, updated_at: new Date().toISOString() },
      { onConflict: 'resource_key' }
    )

  if (error) return { error: error.message }
  return {}
}

export async function setInventoryQuantity(
  resourceKey: string,
  quantity: number
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('resource_inventory')
    .upsert(
      {
        resource_key: resourceKey,
        quantity: Math.max(0, quantity),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'resource_key' }
    )

  if (error) return { error: error.message }
  return {}
}

export async function fetchCustomOrders(): Promise<{
  data: CustomOrder[]
  error?: string
}> {
  const { data, error } = await supabase
    .from('custom_orders')
    .select(`
      *,
      items:custom_order_items(*),
      requester:profiles!custom_orders_requester_id_fkey(rsi_handle, display_name, email)
    `)
    .order('created_at', { ascending: false })

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as CustomOrder[] }
}

export async function createCustomOrder(input: {
  requesterId: string
  title: string
  notes?: string
  items: { resourceKey: string; quantity: number }[]
}): Promise<{ data?: CustomOrder; error?: string }> {
  const { data: order, error: orderError } = await supabase
    .from('custom_orders')
    .insert({
      requester_id: input.requesterId,
      title: input.title.trim(),
      notes: input.notes?.trim() || null,
      status: 'pending',
    })
    .select()
    .single()

  if (orderError || !order) {
    return { error: orderError?.message ?? 'Failed to create order' }
  }

  if (input.items.length > 0) {
    const { error: itemsError } = await supabase.from('custom_order_items').insert(
      input.items.map((item) => ({
        order_id: order.id,
        resource_key: item.resourceKey,
        quantity: item.quantity,
      }))
    )

    if (itemsError) {
      await supabase.from('custom_orders').delete().eq('id', order.id)
      return { error: itemsError.message }
    }
  }

  return { data: order as CustomOrder }
}

export async function updateCustomOrderStatus(
  orderId: string,
  status: CustomOrderStatus
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('custom_orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId)

  if (error) return { error: error.message }
  return {}
}

export async function fulfillCustomOrder(
  orderId: string,
  notes?: string
): Promise<{ fulfillmentId?: string; error?: string }> {
  const { data, error } = await supabase.rpc('fulfill_custom_order', {
    p_order_id: orderId,
    p_notes: notes ?? null,
  })

  if (error) return { error: error.message }
  return { fulfillmentId: data as string }
}

export async function fetchFulfillments(): Promise<{
  data: OrderFulfillment[]
  error?: string
}> {
  const { data, error } = await supabase
    .from('order_fulfillments')
    .select(`
      *,
      items:fulfillment_items(resource_key, quantity),
      order:custom_orders(title, status)
    `)
    .order('created_at', { ascending: false })

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as OrderFulfillment[] }
}

export type { ExtractedBlueprintResource }
