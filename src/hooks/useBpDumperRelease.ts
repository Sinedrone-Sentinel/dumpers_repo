import { useCallback, useState } from 'react'
import {
  BpDumperReleaseInfo,
  buildFallbackReleaseInfo,
  fetchBpDumperRelease,
} from '../lib/bpDumperRelease'
import { useAsyncEffect } from './useAsyncEffect'

export function useBpDumperRelease(enabled = true) {
  const [release, setRelease] = useState<BpDumperReleaseInfo>(() => buildFallbackReleaseInfo())
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const next = await fetchBpDumperRelease()
      setRelease(next)
    } catch {
      setError('Could not load latest release from GitHub')
      setRelease(buildFallbackReleaseInfo())
    } finally {
      setLoading(false)
    }
  }, [])

  useAsyncEffect(async ({ cancelled }) => {
    if (!enabled) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const next = await fetchBpDumperRelease()
      if (!cancelled) setRelease(next)
    } catch {
      if (!cancelled) {
        setError('Could not load latest release from GitHub')
        setRelease(buildFallbackReleaseInfo())
      }
    } finally {
      if (!cancelled) setLoading(false)
    }
  }, [enabled])

  return { release, loading, error, refresh }
}
