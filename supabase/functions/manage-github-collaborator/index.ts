import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type GithubAction = 'invite' | 'update' | 'remove'
type GithubPermission = 'triage' | 'push' | 'maintain'

type Body = {
  applicationId?: string
  action?: GithubAction
  githubLogin?: string
  permission?: GithubPermission | 'admin' | string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeLogin(login: string | null | undefined): string | null {
  if (!login || typeof login !== 'string') return null
  const cleaned = login.trim().replace(/^@/, '').toLowerCase()
  return cleaned || null
}

function seatToPermission(seat: string | null | undefined): GithubPermission | null {
  switch ((seat || '').toLowerCase()) {
    case 'triage':
      return 'triage'
    case 'contributor':
    case 'reviewer':
      return 'push'
    case 'maintainer':
      return 'maintain'
    default:
      return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ success: false, error: 'Missing authorization' }, 401)
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user: caller },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !caller) {
      return jsonResponse({ success: false, error: 'Invalid session' }, 401)
    }

    const { data: callerProfile, error: profileError } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (profileError || !callerProfile) {
      return jsonResponse({ success: false, error: 'Profile not found' }, 403)
    }

    const isSuperAdmin = callerProfile.role === 'super-admin'
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let body: Body
    try {
      body = (await req.json()) as Body
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400)
    }

    let applicationId = typeof body.applicationId === 'string' ? body.applicationId.trim() : ''
    let action: GithubAction | null = null
    let githubLogin: string | null = normalizeLogin(body.githubLogin)
    let permission: GithubPermission | null = null

    type AppRow = {
      id: string
      user_id: string
      github_login: string
      seat: string
      github_permission: string | null
      github_pending_action: string | null
    }

    let application: AppRow | null = null

    if (applicationId) {
      const { data: appRow, error: appError } = await adminClient
        .from('contributor_applications')
        .select('id, user_id, github_login, seat, github_permission, github_pending_action')
        .eq('id', applicationId)
        .maybeSingle()

      if (appError || !appRow) {
        return jsonResponse({ success: false, error: 'Application not found' }, 404)
      }
      application = appRow as AppRow
      githubLogin = normalizeLogin(application.github_login)
      const pending = (application.github_pending_action || '').toLowerCase()
      if (pending === 'invite' || pending === 'update' || pending === 'remove') {
        action = pending
      } else if (['left', 'revoked'].includes(application.seat)) {
        action = 'remove'
      } else if (['triage', 'contributor', 'reviewer', 'maintainer'].includes(application.seat)) {
        action = application.github_permission ? 'update' : 'invite'
      }

      const fromApp =
        (application.github_permission as GithubPermission | null) ||
        seatToPermission(application.seat)
      permission = fromApp
    } else {
      const rawAction = (body.action || '').toLowerCase()
      if (rawAction === 'invite' || rawAction === 'update' || rawAction === 'remove') {
        action = rawAction
      }
      if (body.permission === 'triage' || body.permission === 'push' || body.permission === 'maintain') {
        permission = body.permission
      }
    }

    if (!action) {
      return jsonResponse({ success: false, error: 'action or applicationId with pending sync required' }, 400)
    }
    if (!githubLogin) {
      return jsonResponse({ success: false, error: 'githubLogin required' }, 400)
    }

    if (body.permission === 'admin') {
      return jsonResponse({ success: false, error: 'GitHub admin permission is never granted by this sync' }, 400)
    }

    const memberSelfRemove =
      !isSuperAdmin &&
      application != null &&
      application.user_id === caller.id &&
      (action === 'remove' || application.github_pending_action === 'remove') &&
      (['left', 'revoked'].includes(application.seat) || application.github_pending_action === 'remove')

    if (!isSuperAdmin && !memberSelfRemove) {
      return jsonResponse({ success: false, error: 'Permission denied' }, 403)
    }

    if ((action === 'invite' || action === 'update') && !permission) {
      return jsonResponse({ success: false, error: 'permission required for invite/update' }, 400)
    }

    const markSync = async (status: 'ok' | 'error', message: string | null) => {
      if (!applicationId) return
      await adminClient.rpc('admin_mark_contributor_github_sync', {
        p_application_id: applicationId,
        p_status: status,
        p_error: message,
      })
    }

    const { data: settings, error: settingsError } = await adminClient
      .from('site_settings')
      .select('github_owner, github_repo')
      .eq('id', 1)
      .maybeSingle()

    if (settingsError || !settings?.github_owner || !settings?.github_repo) {
      await markSync('error', 'GitHub owner/repo not configured in site_settings')
      return jsonResponse(
        { success: false, error: 'GitHub owner/repo not configured in site settings' },
        503,
      )
    }

    const owner = String(settings.github_owner).trim()
    const repo = String(settings.github_repo).trim()
    const token = Deno.env.get('GITHUB_CONTRIBUTORS_TOKEN')
    if (!token) {
      await markSync('error', 'GITHUB_CONTRIBUTORS_TOKEN is not set on the Edge Function')
      return jsonResponse(
        {
          success: false,
          error:
            'GITHUB_CONTRIBUTORS_TOKEN is not configured. Set it under Edge Function secrets, then retry sync.',
        },
        503,
      )
    }

    const url =
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}` +
      `/collaborators/${encodeURIComponent(githubLogin)}`
    const ghHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dumpers-repo-contributor-sync',
    }

    let ghRes: Response
    if (action === 'remove') {
      ghRes = await fetch(url, { method: 'DELETE', headers: ghHeaders })
    } else {
      ghHeaders['Content-Type'] = 'application/json'
      ghRes = await fetch(url, {
        method: 'PUT',
        headers: ghHeaders,
        body: JSON.stringify({ permission }),
      })
    }

    const ok =
      ghRes.ok ||
      ghRes.status === 204 ||
      (action === 'remove' && ghRes.status === 404)

    if (!ok) {
      let detail = `GitHub API ${ghRes.status}`
      try {
        const errBody = await ghRes.json()
        if (errBody?.message) detail = `${detail}: ${errBody.message}`
      } catch {
        /* ignore */
      }
      await markSync('error', detail)
      return jsonResponse({ success: false, error: detail, action, githubLogin }, 502)
    }

    await markSync('ok', null)
    return jsonResponse({
      success: true,
      action,
      githubLogin,
      permission: action === 'remove' ? null : permission,
      applicationId: applicationId || null,
      owner,
      repo,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return jsonResponse({ success: false, error: message }, 500)
  }
})
