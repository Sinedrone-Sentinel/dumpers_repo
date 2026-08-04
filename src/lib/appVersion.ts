const BUILD_ID = import.meta.env.VITE_BUILD_ID as string | undefined

/** How often long-lived tabs re-check for a new deploy. */
export const APP_UPDATE_POLL_MS = 15 * 60 * 1000

/** Second fetch delay so a CDN/partial publish race cannot flash the banner. */
const CONFIRM_GAP_MS = 2500

function isPlausibleBuildId(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const id = value.trim()
  if (!id || id === 'dev') return false
  // GitHub SHA (full or short) or ci-* from workflows
  return /^(ci-)?[a-f0-9]{7,40}$/i.test(id)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function fetchDeployedBuildId(): Promise<string | null> {
  const response = await fetch(`/version.json?t=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) return null

  const contentType = (response.headers.get('content-type') || '').toLowerCase()
  if (contentType && !contentType.includes('application/json') && !contentType.includes('text/json')) {
    // Mistaken HTML/SPA fallback must never count as an update.
    return null
  }

  const body = (await response.json()) as { buildId?: unknown }
  return isPlausibleBuildId(body.buildId) ? body.buildId.trim() : null
}

export function setupCacheBusting(): void {
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      window.location.reload()
    }
  })
}

/**
 * True when the running client build id is behind a confirmed deployed
 * `/version.json`. Requires two agreeing remote reads spaced apart.
 */
export async function isAppOutOfDate(): Promise<boolean> {
  if (!BUILD_ID || BUILD_ID === 'dev') return false

  try {
    const first = await fetchDeployedBuildId()
    if (!first || first === BUILD_ID) return false

    await sleep(CONFIRM_GAP_MS)

    const second = await fetchDeployedBuildId()
    return Boolean(second && second === first && second !== BUILD_ID)
  } catch {
    return false
  }
}

/** Reload to pick up the newly deployed site. */
export function reloadForAppUpdate(): void {
  window.location.reload()
}
