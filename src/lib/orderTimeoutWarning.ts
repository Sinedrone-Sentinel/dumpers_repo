import { supabase } from './supabase'

export type TimeoutWarningRole = 'buyer' | 'seller' | 'fulfiller'

export interface TimeoutWarning {
  id: string
  violationType: string
  roleLabel: TimeoutWarningRole
  createdAt: string
}

function parseRole(value: unknown): TimeoutWarningRole {
  if (value === 'seller' || value === 'fulfiller' || value === 'buyer') return value
  return 'buyer'
}

export async function fetchPendingTimeoutWarning(): Promise<TimeoutWarning | null> {
  const { data, error } = await supabase.rpc('get_my_pending_timeout_warning')
  if (error || !data || typeof data !== 'object') return null
  const row = data as Record<string, unknown>
  if (typeof row.id !== 'string') return null
  return {
    id: row.id,
    violationType: typeof row.violation_type === 'string' ? row.violation_type : '',
    roleLabel: parseRole(row.role_label),
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
  }
}

export async function acknowledgeTimeoutWarning(): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('acknowledge_timeout_warning')
  if (error) return { success: false, error: error.message }
  const result = data as { success?: boolean; error?: string } | null
  if (result && result.success === false) {
    return { success: false, error: result.error || 'Could not acknowledge warning' }
  }
  return { success: true }
}
