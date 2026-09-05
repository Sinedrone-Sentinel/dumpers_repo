import { supabase } from './supabase'

export type SpectrumOrg = {
  org_sid: string
  is_primary: boolean
}

export type MySpectrum = {
  linked: boolean
  source: string | null
  rsiHandle: string | null
  primaryOrgSid: string | null
  avatarUrl: string | null
  orgs: SpectrumOrg[]
  graceEndsAt: string | null
  gatesOk: boolean
  needsLink: boolean
}

export function parseMySpectrum(data: Record<string, unknown> | null): MySpectrum | null {
  if (!data?.success) return null
  const orgsRaw = Array.isArray(data.orgs) ? data.orgs : []
  return {
    linked: Boolean(data.linked),
    source: typeof data.source === 'string' ? data.source : null,
    rsiHandle: typeof data.rsi_handle === 'string' ? data.rsi_handle : null,
    primaryOrgSid: typeof data.primary_org_sid === 'string' ? data.primary_org_sid : null,
    avatarUrl: typeof data.avatar_url === 'string' ? data.avatar_url : null,
    orgs: orgsRaw
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const org = row as Record<string, unknown>
        if (typeof org.org_sid !== 'string') return null
        return { org_sid: org.org_sid, is_primary: Boolean(org.is_primary) }
      })
      .filter((row): row is SpectrumOrg => row !== null),
    graceEndsAt: typeof data.grace_ends_at === 'string' ? data.grace_ends_at : null,
    gatesOk: Boolean(data.gates_ok),
    needsLink: Boolean(data.needs_link),
  }
}

export async function fetchMySpectrum(): Promise<
  { ok: true; spectrum: MySpectrum } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('get_my_spectrum')
  if (error) return { ok: false, error: error.message }
  const spectrum = parseMySpectrum((data ?? null) as Record<string, unknown> | null)
  if (!spectrum) return { ok: false, error: 'Could not load Spectrum status' }
  return { ok: true, spectrum }
}

export async function startCitizenIdLink(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('link-citizenid', { body: {} })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const payload = (await ctx.json()) as { error?: string }
        if (payload?.error) return { ok: false, error: payload.error }
      } catch {
        // fall through
      }
    }
    return { ok: false, error: error.message || 'Could not start Citizen iD' }
  }
  const url = (data as { url?: string } | null)?.url
  if (!url) return { ok: false, error: 'Citizen iD did not return an authorize URL' }
  return { ok: true, url }
}

export async function unlinkCitizenId(): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('unlink-citizenid', { body: {} })
  if (error) {
    const ctx = (error as { context?: Response }).context
    if (ctx && typeof ctx.json === 'function') {
      try {
        const payload = (await ctx.json()) as { error?: string }
        if (payload?.error) return { ok: false, error: payload.error }
      } catch {
        // fall through
      }
    }
    return { ok: false, error: error.message || 'Could not remove Citizen iD' }
  }
  if ((data as { error?: string } | null)?.error) {
    return { ok: false, error: String((data as { error: string }).error) }
  }
  return { ok: true }
}

export function consumeCitizenIdReturn(): { ok: boolean; reason?: string } | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const flag = params.get('citizenid')
  if (!flag) return null
  const reason = params.get('reason') || undefined
  params.delete('citizenid')
  params.delete('reason')
  const next = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`
  window.history.replaceState({}, '', next)
  return { ok: flag === 'linked', reason }
}

export async function startCitizenIdLegacyGrace(): Promise<
  { ok: true; endsAt: string | null } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('start_citizenid_legacy_grace')
  if (error) return { ok: false, error: error.message }
  const row = (data ?? null) as Record<string, unknown> | null
  if (!row?.success) return { ok: false, error: String(row?.error || 'Could not start grace period') }
  return { ok: true, endsAt: typeof row.ends_at === 'string' ? row.ends_at : null }
}
