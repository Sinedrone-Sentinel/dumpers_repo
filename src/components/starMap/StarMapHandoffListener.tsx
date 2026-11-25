import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { STAR_MAP_CHANNEL, resolveStarMapSystem, type StarMapPayload } from '../../lib/starMapHighlight'
import { getStarMapData } from '../../lib/starMapData'
import { startStarMapSession, updateStarMapSession } from '../../lib/starMapSession'

/**
 * The hauler keeps its own tab. Each View Map replaces the run in this tab,
 * including when the browser only focuses the named tab and does not navigate.
 */
export default function StarMapHandoffListener({ systemId }: { systemId?: string }) {
  const navigate = useNavigate()
  const { systems, index } = getStarMapData()

  useEffect(() => {
    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel(STAR_MAP_CHANNEL)
    } catch {
      return
    }
    channel.onmessage = (event: MessageEvent<{ payload?: StarMapPayload }>) => {
      const payload = event.data?.payload
      if (!payload) return
      startStarMapSession(payload)
      const res = resolveStarMapSystem(payload, systems, index)
      if (res.kind !== 'single') {
        updateStarMapSession({ choicePending: true })
        if (systemId) void navigate({ to: '/star-map', search: {} })
        return
      }
      updateStarMapSession({ choicePending: false })
      if (res.systemId !== systemId) {
        void navigate({ to: '/star-map/$systemId', params: { systemId: res.systemId }, search: {} })
      }
    }
    return () => channel?.close()
  }, [navigate, systems, index, systemId])

  return null
}
