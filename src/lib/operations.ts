import type { MemberReputationRow } from './reputation'
import { supabase } from './supabase'
import { EXTRA_CATALOG_RESOURCE_KEYS, EXTRA_CATALOG_RESOURCES } from '../config/extraResources'
import {
  extractBlueprintResources,
  type BlueprintWithSlots,
  type ExtractedBlueprintResource,
} from './blueprintResources'
import { validateOrderBlueprintIds } from './blueprintOrderable'
import {
  addResourceQuantities,
  fromMilliScu,
  normalizeResourceQuantity,
  toMilliScu,
} from './resourceQuantity'

export type CustomOrderStatus =
  | 'pending'
  | 'accepted'
  | 'in_progress'
  | 'ready_for_pickup'
  | 'fulfilled'
  | 'completed'
  | 'archived'
  | 'cancelled'

export interface BlueprintResourceRow {
  resource_key: string
  label: string
  is_active: boolean
  synced_at: string
}

export type InventoryScope = 'personal' | 'site'

export interface InventoryContext {
  scope: InventoryScope
  userId: string
}

export interface ResourceInventoryRow {
  id: string
  resource_key: string
  quality: number
  quantity: number
  updated_at: string
  updated_by: string | null
  user_id?: string
}

export interface ResourceCatalogEntry extends BlueprintResourceRow {
  quantity: number
  quality?: number
}

export interface PersonalInventoryCard {
  id: string
  resource_key: string
  quality: number
  quantity: number
  label: string
  is_active: boolean
}

export interface CustomOrderItem {
  id: string
  order_id: string
  resource_key: string
  quantity: number
}

export interface CustomOrderBlueprint {
  id: string
  order_id: string
  blueprint_id: string
  blueprint_title: string | null
  min_quality: number
  quantity: number
  unit_dfp_auec: number
  line_dfp_auec: number
  sort_order: number
}

export interface CustomOrderBlueprintInput {
  blueprintId: string
  blueprintTitle: string
  minQuality: number
  quantity: number
  unitDfpAuec: number
  lineDfpAuec: number
}

export interface CustomOrder {
  id: string
  requester_id: string
  title: string
  notes: string | null
  status: CustomOrderStatus
  blueprint_id: string | null
  min_quality: number
  quantity: number
  total_dfp_auec: number
  min_fulfiller_reputation: number | null
  assignee_id: string | null
  accepted_at: string | null
  ready_at: string | null
  completed_at: string | null
  dispute_opened_at: string | null
  dispute_ticket_id: string | null
  requester_archived_at: string | null
  fulfiller_archived_at: string | null
  created_at: string
  updated_at: string
  items?: CustomOrderItem[]
  blueprints?: CustomOrderBlueprint[]
  resource_lines?: CustomOrderResourceLine[]
  requester?: {
    rsi_handle: string | null
    display_name: string | null
    email: string | null
  }
  assignee?: {
    rsi_handle: string | null
    display_name: string | null
    email: string | null
  }
}

export interface UserNotification {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  payload: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export interface OrderFulfillment {
  id: string
  order_id: string
  fulfilled_by: string | null
  notes: string | null
  created_at: string
  items?: { resource_key: string; quantity: number }[]
  order?: Pick<CustomOrder, 'title' | 'status' | 'total_dfp_auec'>
}

export interface ResourceCatalogSyncResult {
  added: number
  reactivated: number
  deactivated: number
  totalActive: number
}

export interface CustomOrderResourceLine {
  id: string
  order_id: string
  resource_key: string
  resource_label: string
  min_quality: number
  quantity_scu: number
  unit_dfp_auec: number
  line_dfp_auec: number
  sort_order: number
}

export interface CustomOrderResourceInput {
  resourceKey: string
  resourceLabel: string
  minQuality: number
  quantityScu: number
  unitDfpAuec: number
  lineDfpAuec: number
}

export async function syncBlueprintResourceCatalog(
  blueprints: BlueprintWithSlots[]
): Promise<{ result?: ResourceCatalogSyncResult; error?: string }> {
  const extracted: ExtractedBlueprintResource[] = [
    ...extractBlueprintResources(blueprints),
    ...EXTRA_CATALOG_RESOURCES,
  ]
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
    .filter(
      (row) =>
        row.is_active &&
        !activeKeys.has(row.resource_key) &&
        !EXTRA_CATALOG_RESOURCE_KEYS.has(row.resource_key)
    )
    .map((row) => row.resource_key)

  if (toDeactivate.length > 0) {
    const { error: deactivateError } = await supabase
      .from('blueprint_resources')
      .update({ is_active: false, synced_at: now })
      .in('resource_key', toDeactivate)

    if (deactivateError) return { error: deactivateError.message }
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

export async function fetchPersonalInventoryCards(
  ctx: InventoryContext,
  options?: { includeInactive?: boolean }
): Promise<{ data: PersonalInventoryCard[]; lineKeys: string[]; error?: string }> {
  if (ctx.scope !== 'personal') {
    return { data: [], lineKeys: [], error: 'Personal inventory only' }
  }

  const [catalogResult, inventoryResult] = await Promise.all([
    fetchResourceCatalog(options),
    fetchInventory(ctx),
  ])

  if (catalogResult.error) return { data: [], lineKeys: [], error: catalogResult.error }
  if (inventoryResult.error) return { data: [], lineKeys: [], error: inventoryResult.error }

  const catalogByKey = new Map(catalogResult.data.map((r) => [r.resource_key, r]))

  const lineKeys = inventoryResult.data.map(
    (row) => `${row.resource_key}::${row.quality}`
  )

  const data = inventoryResult.data
    .filter((row) => Number(row.quantity) > 0)
    .map((row) => {
      const catalog = catalogByKey.get(row.resource_key)
      return {
        id: row.id,
        resource_key: row.resource_key,
        quality: row.quality,
        quantity: normalizeResourceQuantity(Number(row.quantity)),
        label: catalog?.label ?? row.resource_key,
        is_active: catalog?.is_active ?? true,
      }
    })
    .sort((a, b) => {
      const labelCmp = a.label.localeCompare(b.label)
      if (labelCmp !== 0) return labelCmp
      return a.quality - b.quality
    })

  return { data, lineKeys }
}

export async function fetchResourceCatalogWithInventory(
  ctx: InventoryContext,
  options?: {
    includeInactive?: boolean
  }
): Promise<{ data: ResourceCatalogEntry[]; error?: string }> {
  if (ctx.scope === 'personal') {
    const cards = await fetchPersonalInventoryCards(ctx, options)
    if (cards.error) return { data: [], error: cards.error }
    return {
      data: cards.data.map((card) => ({
        resource_key: card.resource_key,
        label: card.label,
        is_active: card.is_active,
        synced_at: '',
        quantity: card.quantity,
        quality: card.quality,
      })),
    }
  }

  const [catalogResult, inventoryResult] = await Promise.all([
    fetchResourceCatalog(options),
    fetchInventory(ctx),
  ])

  if (catalogResult.error) return { data: [], error: catalogResult.error }
  if (inventoryResult.error) return { data: [], error: inventoryResult.error }

  const catalogByKey = new Map(catalogResult.data.map((r) => [r.resource_key, r]))

  const data = inventoryResult.data
    .filter((row) => Number(row.quantity) > 0)
    .map((row) => {
      const catalog = catalogByKey.get(row.resource_key)
      return {
        resource_key: row.resource_key,
        label: catalog?.label ?? row.resource_key,
        is_active: catalog?.is_active ?? true,
        synced_at: catalog?.synced_at ?? '',
        quantity: normalizeResourceQuantity(Number(row.quantity)),
      }
    })
    .sort((a, b) => a.label.localeCompare(b.label))

  return { data }
}

export async function fetchInventory(ctx: InventoryContext): Promise<{
  data: ResourceInventoryRow[]
  error?: string
}> {
  if (ctx.scope === 'site') {
    const { data, error } = await supabase.rpc('get_site_total_inventory')

    if (error) return { data: [], error: error.message }

    const rows = ((data ?? []) as { resource_key: string; quantity: number }[]).map(
      (row) => ({
        id: row.resource_key,
        resource_key: row.resource_key,
        quality: 0,
        quantity: normalizeResourceQuantity(Number(row.quantity)),
        updated_at: '',
        updated_by: null,
      })
    )

    return { data: rows as ResourceInventoryRow[] }
  }

  const { data, error } = await supabase
    .from('personal_resource_inventory')
    .select('*')
    .eq('user_id', ctx.userId)
    .order('resource_key')
    .order('quality')

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as ResourceInventoryRow[] }
}

export async function addPersonalInventoryLine(input: {
  userId: string
  resourceKey: string
  quality: number
  quantityScu: number
}): Promise<{ error?: string }> {
  const qty = normalizeResourceQuantity(Math.max(0.001, input.quantityScu))
  const now = new Date().toISOString()

  const { data: existing, error: fetchError } = await supabase
    .from('personal_resource_inventory')
    .select('id, quantity')
    .eq('user_id', input.userId)
    .eq('resource_key', input.resourceKey)
    .eq('quality', input.quality)
    .maybeSingle()

  if (fetchError) return { error: fetchError.message }

  if (existing) {
    const nextQty = addResourceQuantities(Number(existing.quantity), qty)
    const { error } = await supabase
      .from('personal_resource_inventory')
      .update({ quantity: nextQty, updated_at: now })
      .eq('id', existing.id)

    if (error) return { error: error.message }
    return {}
  }

  const { error } = await supabase.from('personal_resource_inventory').insert({
    user_id: input.userId,
    resource_key: input.resourceKey,
    quality: input.quality,
    quantity: qty,
    updated_at: now,
  })

  if (error) return { error: error.message }
  return {}
}

export async function adjustInventoryQuantity(
  ctx: InventoryContext,
  resourceKey: string,
  quality: number,
  delta: number
): Promise<{ error?: string }> {
  if (ctx.scope === 'site') {
    return { error: 'Site Total is read-only — update My Resources instead' }
  }

  const { data: current, error: fetchError } = await supabase
    .from('personal_resource_inventory')
    .select('id, quantity')
    .eq('user_id', ctx.userId)
    .eq('resource_key', resourceKey)
    .eq('quality', quality)
    .maybeSingle()

  if (fetchError) return { error: fetchError.message }
  if (!current) return { error: 'Stock card not found — add it first' }

  const currentMilli = toMilliScu(Number(current.quantity))
  const deltaMilli = delta < 0 ? -toMilliScu(Math.abs(delta)) : toMilliScu(delta)
  const nextMilli = Math.max(0, currentMilli + deltaMilli)
  const nextQty = fromMilliScu(nextMilli)
  const now = new Date().toISOString()

  if (nextQty <= 0) {
    const { error } = await supabase
      .from('personal_resource_inventory')
      .delete()
      .eq('id', current.id)
    if (error) return { error: error.message }
    return {}
  }

  const { error } = await supabase
    .from('personal_resource_inventory')
    .update({ quantity: nextQty, updated_at: now })
    .eq('id', current.id)

  if (error) return { error: error.message }
  return {}
}

export async function setInventoryQuantity(
  ctx: InventoryContext,
  resourceKey: string,
  quality: number,
  quantity: number
): Promise<{ error?: string }> {
  if (ctx.scope === 'site') {
    return { error: 'Site Total is read-only — update My Resources instead' }
  }

  const nextQty = normalizeResourceQuantity(Math.max(0, quantity))
  const now = new Date().toISOString()

  const { data: current, error: fetchError } = await supabase
    .from('personal_resource_inventory')
    .select('id')
    .eq('user_id', ctx.userId)
    .eq('resource_key', resourceKey)
    .eq('quality', quality)
    .maybeSingle()

  if (fetchError) return { error: fetchError.message }
  if (!current) return { error: 'Stock card not found — add it first' }

  if (nextQty <= 0) {
    const { error } = await supabase
      .from('personal_resource_inventory')
      .delete()
      .eq('id', current.id)
    if (error) return { error: error.message }
    return {}
  }

  const { error } = await supabase
    .from('personal_resource_inventory')
    .update({ quantity: nextQty, updated_at: now })
    .eq('id', current.id)

  if (error) return { error: error.message }
  return {}
}

export async function fetchCustomOrders(options?: {
  /** Custom Orders page — only orders this member placed */
  requesterId?: string
}): Promise<{
  data: CustomOrder[]
  error?: string
}> {
  let query = supabase
    .from('custom_orders')
    .select(`
      *,
      items:custom_order_items(*),
      blueprints:custom_order_blueprints(*),
      resource_lines:custom_order_resource_lines(*),
      requester:profiles!custom_orders_requester_id_fkey(rsi_handle, display_name, email),
      assignee:profiles!custom_orders_assignee_id_fkey(rsi_handle, display_name, email)
    `)

  if (options?.requesterId) {
    query = query.eq('requester_id', options.requesterId)
  }

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as CustomOrder[] }
}

export interface UserOrderLimits {
  unrated_count: number
  buyer_order_count: number
  buyer_order_total: number
  fulfillment_count: number
  has_pending_buyer_rep: boolean
  has_pending_fulfiller_rep: boolean
  buyer_order_limit: number
  buyer_auec_limit: number
  buyer_min_order_value?: number
  fulfiller_order_limit: number
  can_create_order: boolean
  can_accept_order: boolean
}

export type CreateOrderErrorType =
  | 'unrated'
  | 'min_value'
  | 'duplicate_pending'
  | 'duplicate_active'
  | 'order_limit'
  | 'auec_limit'
  | 'generic'

export interface CreateOrderResult {
  data?: CustomOrder
  error?: string
  errorType?: CreateOrderErrorType
  existingOrderId?: string
  unratedCount?: number
  attemptCount?: number
}

export async function fetchUserOrderLimits(
  userId: string
): Promise<{ data?: UserOrderLimits; error?: string }> {
  const { data, error } = await supabase.rpc('get_user_order_limits', {
    p_user_id: userId,
  })

  if (error) return { error: error.message }
  return { data: data as UserOrderLimits }
}

export async function createCustomOrder(input: {
  requesterId: string
  title: string
  notes?: string
  totalDfpAuec: number
  minFulfillerReputation?: number | null
  blueprints: CustomOrderBlueprintInput[]
  resources: CustomOrderResourceInput[]
  items: { resourceKey: string; quantity: number }[]
  orderOverridesMap?: Record<string, boolean>
}): Promise<CreateOrderResult> {
  if (input.blueprints.length === 0 && input.resources.length === 0) {
    return { error: 'Add at least one blueprint or resource to the order' }
  }

  const orderCheck = validateOrderBlueprintIds(
    input.blueprints.map((bp) => bp.blueprintId),
    input.orderOverridesMap ?? {}
  )
  if (!orderCheck.ok) {
    return { error: 'This blueprint is not available for orders' }
  }

  const { data, error } = await supabase.rpc('create_custom_order', {
    p_title: input.title.trim(),
    p_notes: input.notes?.trim() || null,
    p_total_dfp_auec: Math.round(input.totalDfpAuec),
    p_min_fulfiller_reputation: input.minFulfillerReputation ?? null,
    p_blueprints: input.blueprints.map((bp) => ({
      blueprint_id: bp.blueprintId,
      blueprint_title: bp.blueprintTitle,
      min_quality: bp.minQuality,
      quantity: bp.quantity,
      unit_dfp_auec: Math.round(bp.unitDfpAuec),
      line_dfp_auec: Math.round(bp.lineDfpAuec),
    })),
    p_resources: input.resources.map((line) => ({
      resource_key: line.resourceKey,
      resource_label: line.resourceLabel,
      min_quality: line.minQuality,
      quantity_scu: normalizeResourceQuantity(line.quantityScu),
      unit_dfp_auec: Math.round(line.unitDfpAuec),
      line_dfp_auec: Math.round(line.lineDfpAuec),
    })),
    p_items: input.items.map((item) => ({
      resource_key: item.resourceKey,
      quantity: item.quantity,
    })),
  })

  if (error) {
    return { error: error.message, errorType: 'generic' }
  }

  const result = data as {
    success: boolean
    error?: string
    error_type?: string
    order_id?: string
    existing_order_id?: string
    unrated_count?: number
    attempt_count?: number
  }

  if (!result.success) {
    return {
      error: result.error ?? 'Failed to create order',
      errorType: (result.error_type as CreateOrderErrorType) ?? 'generic',
      existingOrderId: result.existing_order_id,
      unratedCount: result.unrated_count,
      attemptCount: result.attempt_count,
    }
  }

  // Fetch the created order to return full data
  const { data: order, error: fetchError } = await supabase
    .from('custom_orders')
    .select()
    .eq('id', result.order_id)
    .single()

  if (fetchError || !order) {
    return { error: fetchError?.message ?? 'Order created but failed to fetch' }
  }

  return { data: order as CustomOrder }
}

export async function updateCustomOrderRequester(input: {
  orderId: string
  title: string
  notes?: string
  totalDfpAuec: number
  minFulfillerReputation?: number | null
  blueprints: CustomOrderBlueprintInput[]
  resources: CustomOrderResourceInput[]
  items: { resourceKey: string; quantity: number }[]
  orderOverridesMap?: Record<string, boolean>
}): Promise<{ error?: string }> {
  if (input.blueprints.length === 0 && input.resources.length === 0) {
    return { error: 'Add at least one blueprint or resource to the order' }
  }

  const orderCheck = validateOrderBlueprintIds(
    input.blueprints.map((bp) => bp.blueprintId),
    input.orderOverridesMap ?? {}
  )
  if (!orderCheck.ok) {
    return { error: 'This blueprint is not available for orders' }
  }

  const firstBp = input.blueprints[0]
  const legacyBlueprintId =
    input.blueprints.length === 1 && input.resources.length === 0 ? firstBp.blueprintId : null

  const { error } = await supabase.rpc('update_custom_order_requester', {
    p_order_id: input.orderId,
    p_title: input.title.trim(),
    p_notes: input.notes?.trim() || null,
    p_total_dfp_auec: Math.round(input.totalDfpAuec),
    p_min_fulfiller_reputation: input.minFulfillerReputation ?? null,
    p_blueprint_id: legacyBlueprintId,
    p_min_quality: firstBp?.minQuality ?? input.resources[0]?.minQuality ?? 500,
    p_quantity: firstBp?.quantity ?? 1,
    p_blueprints: input.blueprints.map((bp, index) => ({
      blueprint_id: bp.blueprintId,
      blueprint_title: bp.blueprintTitle,
      min_quality: bp.minQuality,
      quantity: bp.quantity,
      unit_dfp_auec: Math.round(bp.unitDfpAuec),
      line_dfp_auec: Math.round(bp.lineDfpAuec),
      sort_order: index,
    })),
    p_resources: input.resources.map((line, index) => ({
      resource_key: line.resourceKey,
      resource_label: line.resourceLabel,
      min_quality: line.minQuality,
      quantity_scu: normalizeResourceQuantity(line.quantityScu),
      unit_dfp_auec: Math.round(line.unitDfpAuec),
      line_dfp_auec: Math.round(line.lineDfpAuec),
      sort_order: index,
    })),
    p_items: input.items.map((item) => ({
      resource_key: item.resourceKey,
      quantity: item.quantity,
    })),
  })

  if (error) return { error: error.message }
  return {}
}

export async function deleteCustomOrderRequester(
  orderId: string
): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('delete_custom_order_requester', {
    p_order_id: orderId,
  })
  if (error) return { error: error.message }
  return {}
}

export async function abandonCustomOrderFulfillment(
  orderId: string
): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('abandon_custom_order_fulfillment', {
    p_order_id: orderId,
  })
  if (error) return { error: error.message }
  return {}
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

export async function replaceCustomOrderFulfillmentItems(
  orderId: string,
  items: { resourceKey: string; quantity: number }[]
): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('replace_custom_order_fulfillment_items', {
    p_order_id: orderId,
    p_items: items.map((item) => ({
      resource_key: item.resourceKey,
      quantity: normalizeResourceQuantity(item.quantity),
    })),
  })
  if (error) return { error: error.message }
  return {}
}

export async function acceptCustomOrder(orderId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('accept_custom_order', { p_order_id: orderId })
  if (error) return { error: error.message }
  return {}
}

export async function startCustomOrderWork(orderId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('start_custom_order_work', { p_order_id: orderId })
  if (error) return { error: error.message }
  return {}
}

export async function completeOrderCraft(
  orderId: string,
  notes?: string
): Promise<{ fulfillmentId?: string; error?: string }> {
  const { data, error } = await supabase.rpc('complete_order_craft', {
    p_order_id: orderId,
    p_notes: notes ?? null,
  })

  if (error) return { error: error.message }
  return { fulfillmentId: data as string }
}

export async function confirmOrderPickup(orderId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('confirm_order_pickup', { p_order_id: orderId })
  if (error) return { error: error.message }
  return {}
}

export async function reportOrderDispute(
  orderId: string,
  description: string
): Promise<{ error?: string; ticketId?: string }> {
  const { data, error } = await supabase.rpc('report_order_dispute', {
    p_order_id: orderId,
    p_description: description.trim(),
  })

  if (error) return { error: error.message }

  const result = data as { success: boolean; error?: string; ticket_id?: string }
  if (!result.success) return { error: result.error ?? 'Failed to report problem' }
  return { ticketId: result.ticket_id }
}

export async function fetchDisputeOrderId(
  ticketId: string
): Promise<{ orderId?: string; error?: string }> {
  const { data, error } = await supabase.rpc('get_dispute_order_id', {
    p_ticket_id: ticketId,
  })

  if (error) return { error: error.message }
  return { orderId: (data as string | null) ?? undefined }
}

export async function resolveOrderDispute(
  orderId: string,
  outcome: 'cancel' | 'release'
): Promise<{ error?: string }> {
  const { data, error } = await supabase.rpc('resolve_order_dispute', {
    p_order_id: orderId,
    p_outcome: outcome,
  })

  if (error) return { error: error.message }

  const result = data as { success: boolean; error?: string }
  if (!result.success) return { error: result.error ?? 'Failed to resolve dispute' }
  return {}
}

export async function fetchMemberReputations(userIds: string[]): Promise<{
  data: Record<string, MemberReputationRow>
  error?: string
}> {
  const unique = [...new Set(userIds.filter(Boolean))]
  if (unique.length === 0) return { data: {} }

  const { data, error } = await supabase.rpc('get_member_reputations', {
    p_user_ids: unique,
  })

  if (error) return { data: {}, error: error.message }

  const map: Record<string, MemberReputationRow> = {}
  for (const row of (data ?? []) as MemberReputationRow[]) {
    map[row.user_id] = row
  }
  return { data: map }
}

export async function archiveCustomOrderWithRating(
  orderId: string,
  stars: number,
  comment?: string
): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('archive_custom_order_with_rating', {
    p_order_id: orderId,
    p_stars: stars,
    p_comment: comment ?? null,
  })

  if (error) return { error: error.message }
  return {}
}

export async function fetchUserNotifications(): Promise<{
  data: UserNotification[]
  error?: string
}> {
  const { data, error } = await supabase
    .from('user_notifications')
    .select('*')
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as UserNotification[] }
}

/** Dismiss a notification — deletes the row (no read history kept). */
export async function deleteUserNotification(notificationId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('user_notifications').delete().eq('id', notificationId)

  if (error) return { error: error.message }
  return {}
}

/** Dismiss all unread notifications — deletes rows (no read history kept). */
export async function deleteAllUserNotifications(): Promise<{ error?: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Not signed in' }

  const { error } = await supabase
    .from('user_notifications')
    .delete()
    .eq('user_id', user.id)
    .is('read_at', null)

  if (error) return { error: error.message }
  return {}
}

/** @deprecated Use completeOrderCraft — kept for back-compat with fulfill_custom_order RPC */
export async function fulfillCustomOrder(
  orderId: string,
  notes?: string
): Promise<{ fulfillmentId?: string; error?: string }> {
  return completeOrderCraft(orderId, notes)
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
      order:custom_orders(title, status, total_dfp_auec)
    `)
    .order('created_at', { ascending: false })

  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as OrderFulfillment[] }
}

export async function wipeResourceTracker(): Promise<{ deletedCount?: number; error?: string }> {
  const { data, error } = await supabase.rpc('admin_wipe_resource_tracker')

  if (error) return { error: error.message }
  return { deletedCount: Number(data ?? 0) }
}

export type { ExtractedBlueprintResource }
