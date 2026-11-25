import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { STAR_MAP_CHANNEL, readLiveHaul, resolveStarMapSystem, type StarMapPayload } from '../../lib/starMapHighlight'
import { getStarMapData } from '../../lib/starMapData'
import { getStarMapSession, showStarMapPayload, startStarMapSession, updateStarMapSession } from '../../lib/starMapSession'

/**
 * The map tab follows View Map, and a Smart Hauler run that is still going.
 * Closing the tab does not end the run. Opening the map again reads it back.
 */
export default function StarMapHandoffListener({ systemId }: { systemId?: string }) {
  const navigate = useNavigate()
  const { systems, index } = getStarMapData()

  useEffect(() => {
    const showingCart = () => {
      const current = getStarMapSession()
      const payload = current?.payload
      return payload?.category === 'shopping' && !!(payload.shops?.length || payload.route?.length || payload.marks?.length || payload.start)
    }
    const adoptHaul = (payload: StarMapPayload | null) => {
      if (payload && showingCart()) return
      if (!payload) {
        if (getStarMapSession()?.payload.category === 'hauler') showStarMapPayload({})
        return
      }
      showStarMapPayload(payload)
      const res = resolveStarMapSystem(payload, systems, index)
      if (res.kind === 'single' && res.systemId !== systemId) {
        void navigate({ to: '/star-map/$systemId', params: { systemId: res.systemId }, search: {} })
      }
    }

    const params = new URLSearchParams(window.location.search)
    if (!params.get('handoff')) adoptHaul(readLiveHaul())

    let channel: BroadcastChannel | null = null
    try {
      channel = new BroadcastChannel(STAR_MAP_CHANNEL)
    } catch {
      return
    }
    channel.onmessage = (event: MessageEvent<{ kind?: string; payload?: StarMapPayload | null }>) => {
      if (event.data?.kind === 'haul') {
        adoptHaul(event.data.payload ?? null)
        return
      }
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
