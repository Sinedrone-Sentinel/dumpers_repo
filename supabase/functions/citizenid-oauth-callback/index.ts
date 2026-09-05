// Citizen iD redirects here (no user JWT). Exchange code, upsert Spectrum, bounce to the site.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type JwtPayload = Record<string, unknown>

function siteRedirect(pathQuery: string): Response {
  const site = (Deno.env.get('PUBLIC_SITE_URL') || 'https://dumpers-repo.com').replace(/\/$/, '')
  return new Response(null, {
    status: 302,
    headers: { Location: `${site}/${pathQuery.replace(/^\//, '')}` },
  })
}

function decodeJwt(token: string): JwtPayload {
  const part = token.split('.')[1]
  if (!part) return {}
  const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4)
  try {
    return JSON.parse(atob(padded)) as JwtPayload
  } catch {
    return {}
  }
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number') return String(value)
  return null
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter((item): item is string => Boolean(item))
  }
  const single = asString(value)
  return single ? [single] : []
}

function rolesOf(payload: JwtPayload): string[] {
  const raw = payload.role ?? payload.roles
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') return [raw]
  return []
}

serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const oauthError = url.searchParams.get('error')
  const oauthDesc = url.searchParams.get('error_description')

  if (oauthError) {
    return siteRedirect(`?citizenid=error&reason=${encodeURIComponent(oauthDesc || oauthError)}`)
  }
  if (!code || !state) {
    return siteRedirect('?citizenid=error&reason=missing_code')
  }

  const clientId = Deno.env.get('CITIZENID_CLIENT_ID')
  const clientSecret = Deno.env.get('CITIZENID_CLIENT_SECRET')
  const authority = (Deno.env.get('CITIZENID_AUTHORITY') || 'https://citizenid.space').replace(/\/$/, '')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const redirectUri =
    Deno.env.get('CITIZENID_REDIRECT_URI') ||
    `${supabaseUrl.replace(/\/$/, '')}/functions/v1/citizenid-oauth-callback`

  if (!clientId || !clientSecret) {
    return siteRedirect('?citizenid=error&reason=not_configured')
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: pending, error: pendingError } = await admin
    .from('spectrum_oauth_pending')
    .select('user_id, code_verifier, expires_at')
    .eq('state', state)
    .maybeSingle()

  if (pendingError || !pending) {
    return siteRedirect('?citizenid=error&reason=expired')
  }
  if (new Date(pending.expires_at).getTime() < Date.now()) {
    await admin.from('spectrum_oauth_pending').delete().eq('state', state)
    return siteRedirect('?citizenid=error&reason=expired')
  }

  const tokenRes = await fetch(`${authority}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code_verifier: pending.code_verifier,
    }),
  })

  const tokenJson = await tokenRes.json().catch(() => ({}))
  await admin.from('spectrum_oauth_pending').delete().eq('state', state)

  if (!tokenRes.ok || !tokenJson.id_token) {
    return siteRedirect('?citizenid=error&reason=token')
  }

  const claims = decodeJwt(String(tokenJson.id_token))
  const roles = rolesOf(claims)
  const verified = roles.some((role) =>
    role.replace(/\./g, '/').toLowerCase().includes('status/verified'),
  )
  const handle = asString(claims['urn:user:rsi:username'])
  const sub = asString(claims.sub)
  if (!verified || !handle || !sub) {
    return siteRedirect('?citizenid=error&reason=unverified')
  }

  const accountType = roles.some((role) =>
    role.replace(/\./g, '/').toLowerCase().includes('accounttype/organization'),
  )
    ? 'organization'
    : 'citizen'

  const { data: profile } = await admin
    .from('profiles')
    .select('avatar_url')
    .eq('id', pending.user_id)
    .maybeSingle()

  const { data: upsert, error: upsertError } = await admin.rpc('upsert_spectrum_from_citizenid', {
    p_user_id: pending.user_id,
    p_citizenid_sub: sub,
    p_rsi_handle: handle,
    p_rsi_citizen_id: asString(claims['urn:user:rsi:citizenId']),
    p_rsi_spectrum_id: asString(claims['urn:user:rsi:spectrumId']),
    p_rsi_display_name: asString(claims['urn:user:rsi:displayName']),
    p_enlisted_at: asString(claims['urn:user:rsi:enlistedAt']),
    p_avatar_url: asString(claims['urn:user:rsi:avatar:url']),
    p_primary_org_sid: asString(claims['urn:user:rsi:orgs:primary']),
    p_public_org_sids: asStringList(claims['urn:user:rsi:orgs:public']),
    p_account_type: accountType,
    p_cid_verified: true,
    p_claims: claims,
    p_oauth_avatar_url: profile?.avatar_url ?? null,
    p_refresh_token: asString(tokenJson.refresh_token),
  })

  if (upsertError || upsert?.success === false) {
    const reason = encodeURIComponent(String(upsert?.error || upsertError?.message || 'upsert'))
    return siteRedirect(`?citizenid=error&reason=${reason}`)
  }

  return siteRedirect('?citizenid=linked')
})
