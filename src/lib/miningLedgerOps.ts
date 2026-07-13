import { supabase } from './supabase'
import {
  createEmptyMiningLedgerData,
  parseCrewShares,
  type MiningLedgerCollaborator,
  type MiningLedgerData,
  type MiningLedgerDetail,
  type MiningLedgerListItem,
  MINING_LEDGER_SCHEMA_VERSION,
} from './miningLedger'

interface RpcResult {
  success?: boolean
  error?: string
  id?: string
  ledger?: Record<string, unknown>
}

function parseLedgerData(raw: unknown): MiningLedgerData {
  const empty = createEmptyMiningLedgerData()
  if (!raw || typeof raw !== 'object') return empty
  const obj = raw as Partial<MiningLedgerData> & {
    priceQuality?: number
    totalPayout?: number
  }
  const { priceQuality: _legacyPriceQuality, totalPayout: _legacyTotalPayout, ...rest } = obj
  return {
    schemaVersion: MINING_LEDGER_SCHEMA_VERSION,
    ...rest,
    seededCrewUserIds: Array.isArray(obj.seededCrewUserIds)
      ? obj.seededCrewUserIds.map(String)
      : [],
    miningRows: Array.isArray(obj.miningRows) ? obj.miningRows : [],
    deductibles: Array.isArray(obj.deductibles) ? obj.deductibles : empty.deductibles,
    otherProfits: Array.isArray(obj.otherProfits) ? obj.otherProfits : [],
    priceOverrides: Array.isArray(obj.priceOverrides) ? obj.priceOverrides : [],
    crew: Array.isArray(obj.crew)
      ? (obj.crew as MiningLedgerData['crew']).map((row) => ({
          id: String(row.id),
          playerName: String(row.playerName ?? ''),
          linkedUserId:
            row.linkedUserId != null && row.linkedUserId !== ''
              ? String(row.linkedUserId)
              : null,
          shares: parseCrewShares(row.shares),
          role: String(row.role ?? ''),
          alternateCompensation: String(row.alternateCompensation ?? ''),
          isPaid: Boolean(row.isPaid),
          paidPayoutAuec:
            row.paidPayoutAuec != null && Number.isFinite(Number(row.paidPayoutAuec))
              ? Number(row.paidPayoutAuec)
              : null,
        }))
      : [],
  }
}

export async function fetchMiningLedgers(): Promise<{
  data: MiningLedgerListItem[]
  error: string | null
}> {
  const { data, error } = await supabase.rpc('list_mining_ledgers')
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as MiningLedgerListItem[], error: null }
}

export async function fetchMiningLedger(ledgerId: string): Promise<{
  data: MiningLedgerDetail | null
  error: string | null
}> {
  const { data, error } = await supabase.rpc('get_mining_ledger', { p_ledger_id: ledgerId })
  if (error) return { data: null, error: error.message }

  const result = data as RpcResult
  if (!result?.success || !result.ledger) {
    return { data: null, error: result?.error ?? 'Failed to load ledger' }
  }

  const ledger = result.ledger
  return {
    data: {
      id: String(ledger.id),
      name: String(ledger.name),
      created_by: String(ledger.created_by),
      created_at: String(ledger.created_at),
      updated_at: String(ledger.updated_at),
      creator_display: ledger.creator_display ? String(ledger.creator_display) : null,
      data: parseLedgerData(ledger.data),
      collaborators: (Array.isArray(ledger.collaborators)
        ? ledger.collaborators
        : []) as MiningLedgerCollaborator[],
    },
    error: null,
  }
}

export async function createMiningLedger(
  name: string,
  initialData?: MiningLedgerData
): Promise<{
  id: string | null
  error: string | null
}> {
  const { data, error } = await supabase.rpc('create_mining_ledger', {
    p_name: name,
    p_data: initialData ?? createEmptyMiningLedgerData(),
  })
  if (error) return { id: null, error: error.message }
  const result = data as RpcResult
  if (!result?.success) return { id: null, error: result?.error ?? 'Failed to create ledger' }
  return { id: result.id ?? null, error: null }
}

export async function updateMiningLedger(
  ledgerId: string,
  input: { name?: string; data?: MiningLedgerData }
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('update_mining_ledger', {
    p_ledger_id: ledgerId,
    p_name: input.name ?? null,
    p_data: input.data ?? null,
  })
  if (error) return { error: error.message }
  const result = data as RpcResult
  if (!result?.success) return { error: result?.error ?? 'Failed to save ledger' }
  return { error: null }
}

export interface MiningLedgerSiteStats {
  archivedLedgerCount: number
  crewMemberCount: number
  totalPayoutAuec: number
}

export async function fetchMiningLedgerSiteStats(): Promise<{
  data: MiningLedgerSiteStats | null
  error: string | null
}> {
  const { data, error } = await supabase.rpc('get_mining_ledger_site_stats')
  if (error) return { data: null, error: error.message }

  const row = data as {
    archived_ledger_count?: number
    crew_member_count?: number
    total_payout_auec?: number
  } | null

  return {
    data: {
      archivedLedgerCount: Number(row?.archived_ledger_count ?? 0),
      crewMemberCount: Number(row?.crew_member_count ?? 0),
      totalPayoutAuec: Number(row?.total_payout_auec ?? 0),
    },
    error: null,
  }
}

export async function closeMiningLedger(
  ledgerId: string,
  options?: { recordArchiveStats?: boolean; totalPayoutAuec?: number }
): Promise<{ error: string | null }> {
  const payout = options?.totalPayoutAuec
  const { data, error } = await supabase.rpc('close_mining_ledger', {
    p_ledger_id: ledgerId,
    p_record_archive_stats: options?.recordArchiveStats ?? false,
    p_total_payout_auec:
      payout != null && Number.isFinite(payout) ? Math.max(0, Math.round(payout)) : null,
  })
  if (error) return { error: error.message }
  const result = data as RpcResult
  if (!result?.success) return { error: result?.error ?? 'Failed to close ledger' }
  return { error: null }
}

export async function addMiningLedgerCollaborator(
  ledgerId: string,
  userId: string
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('add_mining_ledger_collaborator', {
    p_ledger_id: ledgerId,
    p_user_id: userId,
  })
  if (error) return { error: error.message }
  const result = data as RpcResult
  if (!result?.success) return { error: result?.error ?? 'Failed to add collaborator' }
  return { error: null }
}

export async function removeMiningLedgerCollaborator(
  ledgerId: string,
  userId: string
): Promise<{ error: string | null }> {
  const { data, error } = await supabase.rpc('remove_mining_ledger_collaborator', {
    p_ledger_id: ledgerId,
    p_user_id: userId,
  })
  if (error) return { error: error.message }
  const result = data as RpcResult
  if (!result?.success) return { error: result?.error ?? 'Failed to remove collaborator' }
  return { error: null }
}

export interface VerifiedMemberSearchResult {
  id: string
  rsi_handle: string | null
  display_name: string | null
}

export async function searchVerifiedMembersForLedger(
  query: string
): Promise<{ data: VerifiedMemberSearchResult[]; error: string | null }> {
  const { data, error } = await supabase.rpc('search_verified_members_for_ledger', {
    p_query: query,
  })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as VerifiedMemberSearchResult[], error: null }
}

export async function lookupRsiVerifiedMemberByHandle(
  handle: string
): Promise<{ data: VerifiedMemberSearchResult | null; error: string | null }> {
  const trimmed = handle.trim()
  if (!trimmed) return { data: null, error: null }

  const { data, error } = await supabase.rpc('lookup_rsi_verified_member_by_handle', {
    p_handle: trimmed,
  })
  if (error) return { data: null, error: error.message }
  const rows = (data ?? []) as VerifiedMemberSearchResult[]
  return { data: rows[0] ?? null, error: null }
}
