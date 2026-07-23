const BUILD_ID = import.meta.env.VITE_BUILD_ID as string | undefined

/** How often long-lived tabs re-check for a new deploy. */
export const APP_UPDATE_POLL_MS = 5 * 60 * 1000

export function setupCacheBusting(): void {
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      window.location.reload()
    }
  })
}

/**
 * True when the running client build id differs from the latest deployed
 * `/version.json`. Skips local `dev` builds and network/parse failures.
 */
export async function isAppOutOfDate(): Promise<boolean> {
  if (!BUILD_ID || BUILD_ID === 'dev') return false

  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!response.ok) return false

    const { buildId } = (await response.json()) as { buildId?: string }
    return Boolean(buildId && buildId !== BUILD_ID)
  } catch {
    // Offline or version file missing — keep running without nagging
    return false
  }
}

/** Reload to pick up the newly deployed site. */
export function reloadForAppUpdate(): void {
  window.location.reload()
}
