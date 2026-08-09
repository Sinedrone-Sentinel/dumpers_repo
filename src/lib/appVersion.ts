const BUILD_ID = import.meta.env.VITE_BUILD_ID as string | undefined

/** @deprecated Idle polling removed — update checks run on mount / tab focus only. */
export const APP_UPDATE_POLL_MS = 0

/** Second fetch delay so a CDN/partial publish race cannot flash the banner. */
const CONFIRM_GAP_MS = 2500

const NAG_SESSION_KEY = 'dr_update_nag_for'

function isPlausibleBuildId(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const id = value.trim()
  if (!id || id === 'dev') return false
  return /^(ci-)?[a-f0-9]{7,40}$/i.test(id)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/**
 * Deployed build id from version.json only.
 * Do not fetch `/` (document URL) — that was an idle-network footgun and is unnecessary
 * when version.json is published with the same deploy (see public/_headers).
 */
async function fetchDeployedBuildId(): Promise<string | null> {
  const response = await fetch(`/version.json?t=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return null

  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  if (contentType && !contentType.includes('application/json') && !contentType.includes('text/json')) {
    return null
  }

  const body = (await response.json()) as { buildId?: unknown }
  return isPlausibleBuildId(body.buildId) ? body.buildId.trim() : null
}

/** Formerly hard-reloaded on bfcache restore; that felt like random auto-refresh. Banner handles deploys. */
export function setupCacheBusting(): void {
  // no-op — do not call reloadForAppUpdate() on pageshow/persisted
}

/**
 * True when this tab's build is behind a confirmed deploy (version.json, twice).
 * Session-deduped so the same mismatch does not re-nag after dismiss/refresh loops.
 */
export async function isAppOutOfDate(): Promise<boolean> {
  if (!BUILD_ID || BUILD_ID === 'dev') return false

  try {
    const first = await fetchDeployedBuildId()
    if (!first || first === BUILD_ID) return false

    await sleep(CONFIRM_GAP_MS)

    const second = await fetchDeployedBuildId()
    if (!second || second !== first || second === BUILD_ID) return false

    // Same stale tab can re-trigger on every unlock — only nag once per mismatch pair.
    try {
      const nagKey = `${BUILD_ID}->${second}`
      if (sessionStorage.getItem(NAG_SESSION_KEY) === nagKey) return false
      sessionStorage.setItem(NAG_SESSION_KEY, nagKey)
    } catch {
      // sessionStorage unavailable — still allow the banner
    }

    return true
  } catch {
    return false
  }
}

/** Hard navigation so mobile browsers cannot keep a cached SPA shell. */
export function reloadForAppUpdate(): void {
  const url = new URL(window.location.href)
  url.searchParams.set('dr_reload', String(Date.now()))
  window.location.replace(url.toString())
}
