import { supabase } from './supabase'

export const DISCORD_COLORS = {
  orders: 0x22c55e,
  order_new: 0x22c55e,
  order_fulfilled: 0x3b82f6,
  order_cancelled: 0xef4444,
  market_wtb_new: 0x22c55e,
  market_wts_new: 0x10b981,
  market_accepted: 0x3b82f6,
  market_cancelled: 0xef4444,
  market_coalesced: 0xf59e0b,
  my_order_accepted: 0x3b82f6,
  my_order_in_progress: 0x6366f1,
  my_order_ready: 0xf59e0b,
  my_order_completed: 0x22c55e,
  my_order_cancelled: 0xef4444,
  my_order_released: 0xef4444,
  my_order_timeout: 0xef4444,
  my_order_noshow: 0xef4444,
  my_order_dispute: 0xef4444,
  my_support_reply: 0x8b5cf6,
  my_support_resolved: 0x22c55e,
  my_friend_request: 0x3b82f6,
  my_friend_accepted: 0x22c55e,
  support: 0x8b5cf6,
  admin: 0xef4444,
  partnership_application: 0x8b5cf6,
  contributor_application: 0x3498db,
  success: 0x22c55e,
  warning: 0xeab308,
  error: 0xef4444,
  info: 0x5865f2,
}

export type DiscordEventType =
  | 'orders'
  | 'order_new'
  | 'order_fulfilled'
  | 'order_cancelled'
  | 'market_wtb_new'
  | 'market_wts_new'
  | 'market_accepted'
  | 'market_cancelled'
  | 'market_coalesced'
  | 'my_order_accepted'
  | 'my_order_in_progress'
  | 'my_order_ready'
  | 'my_order_completed'
  | 'my_order_cancelled'
  | 'my_order_released'
  | 'my_order_timeout'
  | 'my_order_noshow'
  | 'my_order_dispute'
  | 'my_support_reply'
  | 'my_support_resolved'
  | 'my_friend_request'
  | 'my_friend_accepted'
  | 'support'
  | 'admin'
  | 'partnership_application'
  | 'contributor_application'

export type DiscordEventCategory = 'personal' | 'marketplace' | 'support'

export interface DiscordField {
  name: string
  value: string
  inline?: boolean
}

export interface DiscordSettings {
  enabled: boolean
  orders_enabled: boolean
  order_new_enabled: boolean
  order_fulfilled_enabled: boolean
  order_cancelled_enabled: boolean
  blueprints_enabled: boolean
  support_enabled: boolean
  admin_enabled: boolean
  partnership_application_enabled: boolean
  contributor_application_enabled: boolean
  personal_discord_enabled: boolean
  market_coalesce_enabled: boolean
  market_coalesce_minutes: number
  official_webhook_url: string | null
  official_webhook_name: string | null
}

export interface DiscordPublicEventType {
  event_type: string
  enabled: boolean
  display_name: string
  description: string
  event_category: DiscordEventCategory
}

export interface DiscordWebhook {
  id: string
  webhook_url: string
  webhook_name: string
  subscribed_events: string[]
  registered_by: string | null
  created_at: string
  last_success_at: string | null
  failure_count: number
  active: boolean
}

export interface QueueStatus {
  /** Ready to send now (not waiting on coalesce timer). */
  pending_count: number
  /** Waiting on market coalesce debounce (`held_until`). */
  held_count?: number
  oldest_pending: string | null
  next_held_until?: string | null
  processed_today: number
}

export const DEFAULT_USER_DISCORD_EVENTS = [
  'my_order_accepted',
  'my_order_ready',
  'my_order_completed',
  'my_order_cancelled',
  'my_order_released',
  'my_order_timeout',
  'my_order_noshow',
  'my_order_dispute',
  'my_support_reply',
  'my_support_resolved',
  'my_friend_request',
  'my_friend_accepted',
]

export async function getDiscordSettings(): Promise<{
  success: boolean
  settings?: DiscordSettings
  error?: string
}> {
  try {
    const { data, error } = await supabase.rpc('get_discord_settings')

    if (error) {
      return { success: false, error: error.message }
    }

    if (!data || data.length === 0) {
      return { success: false, error: 'No settings found' }
    }

    return { success: true, settings: data[0] as DiscordSettings }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function updateDiscordSettings(settings: Partial<{
  enabled: boolean
  orders_enabled: boolean
  order_new_enabled: boolean
  order_fulfilled_enabled: boolean
  order_cancelled_enabled: boolean
  blueprints_enabled: boolean
  support_enabled: boolean
  admin_enabled: boolean
  partnership_application_enabled: boolean
  contributor_application_enabled: boolean
  personal_discord_enabled: boolean
  market_coalesce_enabled: boolean
  market_coalesce_minutes: number
  official_webhook_url: string
  official_webhook_name: string
}>): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.rpc('update_discord_settings', {
      p_enabled: settings.enabled ?? null,
      p_orders_enabled: settings.orders_enabled ?? null,
      p_order_new_enabled: settings.order_new_enabled ?? null,
      p_order_fulfilled_enabled: settings.order_fulfilled_enabled ?? null,
      p_order_cancelled_enabled: settings.order_cancelled_enabled ?? null,
      p_blueprints_enabled: settings.blueprints_enabled ?? null,
      p_support_enabled: settings.support_enabled ?? null,
      p_admin_enabled: settings.admin_enabled ?? null,
      p_partnership_application_enabled: settings.partnership_application_enabled ?? null,
      p_contributor_application_enabled: settings.contributor_application_enabled ?? null,
      p_personal_discord_enabled: settings.personal_discord_enabled ?? null,
      p_market_coalesce_enabled: settings.market_coalesce_enabled ?? null,
      p_market_coalesce_minutes: settings.market_coalesce_minutes ?? null,
      p_official_webhook_url: settings.official_webhook_url ?? null,
      p_official_webhook_name: settings.official_webhook_name ?? null,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function getDiscordQueueStatus(): Promise<{
  success: boolean
  status?: QueueStatus
  error?: string
}> {
  try {
    const { data, error } = await supabase.rpc('get_discord_queue_status')

    if (error) {
      return { success: false, error: error.message }
    }

    if (Array.isArray(data) && data.length > 0) {
      return { success: true, status: data[0] as QueueStatus }
    }

    return { success: true, status: data as QueueStatus }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function clearDiscordQueue(
  onlyProcessed: boolean = true
): Promise<{ success: boolean; deleted?: number; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('clear_discord_queue', {
      p_only_processed: onlyProcessed,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, deleted: data }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function getDiscordWebhooks(): Promise<{
  success: boolean
  webhooks?: DiscordWebhook[]
  error?: string
}> {
  try {
    const { data, error } = await supabase
      .from('discord_webhooks')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, webhooks: data as DiscordWebhook[] }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function toggleDiscordWebhook(
  webhookId: string,
  active: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('discord_webhooks')
      .update({ active })
      .eq('id', webhookId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function deleteDiscordWebhook(
  webhookId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('discord_webhooks')
      .delete()
      .eq('id', webhookId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function registerDiscordWebhook(
  webhookUrl: string,
  webhookName: string,
  subscribedEvents: string[],
  registeredBy?: string
): Promise<{ success: boolean; webhookId?: string; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('register_discord_webhook', {
      p_webhook_url: webhookUrl,
      p_webhook_name: webhookName,
      p_subscribed_events: subscribedEvents,
      p_registered_by: registeredBy ?? null,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    if (data && typeof data === 'object') {
      if (data.success) {
        return { success: true, webhookId: data.webhook_id }
      } else {
        return { success: false, error: data.error || 'Registration failed' }
      }
    }

    return { success: true, webhookId: data }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export interface UserWebhook {
  id: string
  webhook_url: string
  webhook_name: string
  subscribed_events: string[]
  created_at: string
  last_success_at: string | null
  failure_count: number
  active: boolean
}

export async function syncMyDiscordEventWebhooks(
  entries: Array<{ event_type: string; webhook_name: string; webhook_url: string }>
): Promise<{ success: boolean; error?: string; eventType?: string }> {
  try {
    const { data, error } = await supabase.rpc('sync_my_discord_event_webhooks', {
      p_entries: entries,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    if (data && typeof data === 'object') {
      if (data.success) {
        return { success: true }
      }
      return {
        success: false,
        error: data.error || 'Failed to update webhooks',
        eventType: data.event_type ?? undefined,
      }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function getMyDiscordWebhooks(): Promise<{
  success: boolean
  webhooks?: UserWebhook[]
  error?: string
}> {
  try {
    const { data, error } = await supabase.rpc('get_my_discord_webhooks')

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, webhooks: data as UserWebhook[] }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function deleteMyDiscordWebhook(
  webhookId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('delete_my_discord_webhook', {
      p_webhook_id: webhookId,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    if (data && typeof data === 'object') {
      return { success: data.success, error: data.error }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function updateMyDiscordWebhook(
  webhookId: string,
  updates: { webhook_name?: string; subscribed_events?: string[] }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('update_my_discord_webhook', {
      p_webhook_id: webhookId,
      p_webhook_name: updates.webhook_name ?? null,
      p_subscribed_events: updates.subscribed_events ?? null,
    })

    if (error) {
      return { success: false, error: error.message }
    }

    if (data && typeof data === 'object') {
      return { success: data.success, error: data.error }
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function getDiscordPublicEventTypes(): Promise<{
  success: boolean
  eventTypes?: DiscordPublicEventType[]
  error?: string
}> {
  try {
    const { data, error } = await supabase.rpc('get_discord_public_event_types')

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, eventTypes: data as DiscordPublicEventType[] }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function processDiscordQueue(): Promise<{
  success: boolean
  processed?: number
  sent?: number
  errors?: string[]
  notices?: string[]
  error?: string
}> {
  try {
    const { data, error } = await supabase.functions.invoke('send-discord', {
      body: { include_held: true },
    })

    if (error) {
      return { success: false, error: error.message }
    }

    if (data?.error) {
      return { success: false, error: data.error }
    }

    return {
      success: true,
      processed: data?.processed ?? 0,
      sent: data?.sent ?? 0,
      errors: Array.isArray(data?.errors) ? (data.errors as string[]) : undefined,
      notices: Array.isArray(data?.notices) ? (data.notices as string[]) : undefined,
    }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

