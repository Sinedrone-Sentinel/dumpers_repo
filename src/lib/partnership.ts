import { supabase } from './supabase'

export type ServiceKind = 'actionable' | 'informative'

export type ServiceType = {
  id: string
  slug: string
  label: string
  description?: string | null
  sort_order: number
  active: boolean
  service_kind?: ServiceKind
  details_hint?: string | null
}

export type PartnerApplication = {
  id: string
  org_sid: string
  org_name: string
  org_url?: string | null
  applicant_role_claim?: string | null
  notes?: string | null
  status: 'pending' | 'approved' | 'denied' | 'withdrawn'
  support_ticket_id?: string | null
  review_notes?: string | null
  reviewed_at?: string | null
  created_at: string
  applicant_rsi_handle?: string | null
  applicant_display_name?: string | null
  applicant_email?: string | null
}

export type PartnerOrgService = {
  id: string
  service_type_id: string
  slug: string
  label: string
  enabled: boolean
  pricing_label: string
  has_webhook: boolean
}

export type PartnerOrg = {
  id: string
  org_sid: string
  org_name: string
  active: boolean
  approved_at: string
  is_primary: boolean
  services: PartnerOrgService[]
}

export async function listServiceTypes(): Promise<ServiceType[]> {
  const { data, error } = await supabase.rpc('list_service_types', { p_active_only: true })
  if (error) return []
  return (data as ServiceType[]) ?? []
}

export async function submitPartnerApplication(input: {
  orgSid: string
  orgName: string
  orgUrl?: string
  roleClaim?: string
  notes?: string
}): Promise<{ success: boolean; error?: string; application_id?: string }> {
  const { data, error } = await supabase.rpc('submit_partner_org_application', {
    p_org_sid: input.orgSid,
    p_org_name: input.orgName,
    p_org_url: input.orgUrl || null,
    p_applicant_role_claim: input.roleClaim || null,
    p_notes: input.notes || null,
  })
  if (error) return { success: false, error: error.message }
  const row = data as { success?: boolean; error?: string; application_id?: string }
  if (!row?.success) return { success: false, error: row?.error || 'Submit failed' }
  return { success: true, application_id: row.application_id }
}

export async function listMyPartnerApplications(): Promise<PartnerApplication[]> {
  const { data, error } = await supabase.rpc('list_my_partner_applications')
  if (error) return []
  return (data as PartnerApplication[]) ?? []
}

export async function listPendingPartnerApplications(): Promise<{
  success: boolean
  error?: string
  applications: PartnerApplication[]
}> {
  const { data, error } = await supabase.rpc('list_pending_partner_applications')
  if (error) return { success: false, error: error.message, applications: [] }
  const row = data as { success?: boolean; error?: string; applications?: PartnerApplication[] }
  if (!row?.success) {
    return { success: false, error: row?.error || 'Failed to load', applications: [] }
  }
  return { success: true, applications: row.applications ?? [] }
}

export async function reviewPartnerApplication(
  applicationId: string,
  approve: boolean,
  reviewNotes?: string
): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('review_partner_org_application', {
    p_application_id: applicationId,
    p_approve: approve,
    p_review_notes: reviewNotes || null,
  })
  if (error) return { success: false, error: error.message }
  const row = data as { success?: boolean; error?: string }
  if (!row?.success) return { success: false, error: row?.error || 'Review failed' }
  return { success: true }
}

export async function listMyPartnerOrgs(): Promise<PartnerOrg[]> {
  const { data, error } = await supabase.rpc('list_my_partner_orgs')
  if (error) return []
  return (data as PartnerOrg[]) ?? []
}

export async function upsertPartnerOrgService(input: {
  partnerOrgId: string
  serviceTypeId: string
  enabled: boolean
  pricingLabel: string
  discordWebhookUrl?: string | null
}): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.rpc('upsert_partner_org_service', {
    p_partner_org_id: input.partnerOrgId,
    p_service_type_id: input.serviceTypeId,
    p_enabled: input.enabled,
    p_pricing_label: input.pricingLabel,
    p_discord_webhook_url: input.discordWebhookUrl ?? null,
  })
  if (error) return { success: false, error: error.message }
  const row = data as { success?: boolean; error?: string }
  if (!row?.success) return { success: false, error: row?.error || 'Save failed' }
  return { success: true }
}

export type RequestableServiceType = ServiceType & {
  partner_count: number
  service_kind: ServiceKind
  details_hint?: string | null
}

export type NotifiedPartnerOrg = {
  org_name: string
  org_sid: string
  pricing_label: string
}

export async function listRequestableServiceTypes(): Promise<RequestableServiceType[]> {
  const { data, error } = await supabase.rpc('list_requestable_service_types')
  if (error) return []
  return (data as RequestableServiceType[]) ?? []
}

const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024

function extForMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  return 'png'
}

export async function requestService(input: {
  serviceTypeId: string
  details: string
  screenshotFile?: File | Blob | null
  screenshotMime?: string
}): Promise<{
  success: boolean
  error?: string
  cooldown_seconds?: number
  request_id?: string
  service_label?: string
  service_kind?: ServiceKind
  notified_orgs?: NotifiedPartnerOrg[]
  delivery_count?: number
  posted_count?: number
  dispatch_errors?: string[]
  purged?: boolean
}> {
  const details = input.details.trim()
  if (!details || details.length > 250) {
    return { success: false, error: 'Details required (1–250 characters)' }
  }

  const { data, error } = await supabase.rpc('request_service', {
    p_service_type_id: input.serviceTypeId,
    p_details: details,
  })
  if (error) return { success: false, error: error.message }
  const row = data as {
    success?: boolean
    error?: string
    cooldown_seconds?: number
    request_id?: string
    service_label?: string
    service_kind?: ServiceKind
    notified_orgs?: NotifiedPartnerOrg[]
    delivery_count?: number
  }
  if (!row?.success || !row.request_id) {
    return {
      success: false,
      error: row?.error || 'Request failed',
      cooldown_seconds: row?.cooldown_seconds,
    }
  }

  const kind = row.service_kind || 'actionable'
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'Not signed in' }
  }

  if (kind === 'informative') {
    if (!input.screenshotFile) {
      await supabase.rpc('purge_service_request', { p_request_id: row.request_id })
      return { success: false, error: 'Screenshot required (Ctrl+V or choose a file)' }
    }
    const mime = input.screenshotMime || (input.screenshotFile as File).type || 'image/png'
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
      await supabase.rpc('purge_service_request', { p_request_id: row.request_id })
      return { success: false, error: 'Screenshot must be PNG, JPEG, or WebP' }
    }
    if (input.screenshotFile.size > MAX_SCREENSHOT_BYTES) {
      await supabase.rpc('purge_service_request', { p_request_id: row.request_id })
      return { success: false, error: 'Screenshot too large (max 8 MB)' }
    }
    const path = `${user.id}/${row.request_id}.${extForMime(mime)}`
    const { error: upError } = await supabase.storage
      .from('service-request-screenshots')
      .upload(path, input.screenshotFile, { contentType: mime, upsert: true })
    if (upError) {
      await supabase.rpc('purge_service_request', { p_request_id: row.request_id })
      return { success: false, error: upError.message || 'Screenshot upload failed' }
    }
    const { data: attachData, error: attachError } = await supabase.rpc(
      'attach_service_request_screenshot',
      { p_request_id: row.request_id, p_screenshot_path: path }
    )
    const attachRow = attachData as { success?: boolean; error?: string }
    if (attachError || !attachRow?.success) {
      await supabase.storage.from('service-request-screenshots').remove([path])
      await supabase.rpc('purge_service_request', { p_request_id: row.request_id })
      return { success: false, error: attachRow?.error || attachError?.message || 'Attach failed' }
    }
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) {
    return {
      success: true,
      request_id: row.request_id,
      service_label: row.service_label,
      service_kind: kind,
      notified_orgs: row.notified_orgs,
      delivery_count: row.delivery_count,
      posted_count: 0,
      dispatch_errors: ['Signed out before Discord fan-out'],
    }
  }

  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discord-services-dispatch`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ request_id: row.request_id }),
      }
    )
    const dispatch = (await res.json().catch(() => ({}))) as {
      success?: boolean
      posted_count?: number
      errors?: string[]
      error?: string
      purged?: boolean
    }
    if (!res.ok || !dispatch.success) {
      return {
        success: true,
        request_id: row.request_id,
        service_label: row.service_label,
        service_kind: kind,
        notified_orgs: row.notified_orgs,
        delivery_count: row.delivery_count,
        posted_count: dispatch.posted_count ?? 0,
        dispatch_errors: dispatch.errors || [dispatch.error || 'Discord fan-out failed'],
        purged: dispatch.purged,
      }
    }
    return {
      success: true,
      request_id: row.request_id,
      service_label: row.service_label,
      service_kind: kind,
      notified_orgs: row.notified_orgs,
      delivery_count: row.delivery_count,
      posted_count: dispatch.posted_count ?? 0,
      dispatch_errors: dispatch.errors,
      purged: dispatch.purged,
    }
  } catch (err) {
    return {
      success: true,
      request_id: row.request_id,
      service_label: row.service_label,
      service_kind: kind,
      notified_orgs: row.notified_orgs,
      delivery_count: row.delivery_count,
      posted_count: 0,
      dispatch_errors: [(err as Error).message || 'Discord fan-out failed'],
    }
  }
}
