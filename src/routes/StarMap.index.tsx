import { useEffect, useMemo } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import StarMapOverview from '../components/starMap/StarMapOverview'
import { setAnalyticsSubTool } from '../lib/analytics'
import { payloadFromSearch, resolveStarMapSystem, type StarMapSearch } from '../lib/starMapHighlight'
import { getStarMapData } from '../lib/starMapData'
import {
  clearStarMapSessionIfLeft,
  startStarMapSession,
  updateStarMapSession,
  useStarMapSession,
} from '../lib/starMapSession'

export default function StarMapIndexRoute() {
  const search = useSearch({ strict: false }) as StarMapSearch
  const navigate = useNavigate()
  const { index, systems } = getStarMapData()
  const session = useStarMapSession()
  const hasIncoming = !!(search.marks || search.route || search.start)

  useEffect(() => {
    setAnalyticsSubTool('overview')
    return () => clearStarMapSessionIfLeft()
  }, [])

  // Take what was sent, then drop it from the URL so history cannot replay it.
  useEffect(() => {
    if (!hasIncoming) return
    const payload = payloadFromSearch(search)
    startStarMapSession(payload)
    const res = resolveStarMapSystem(payload, systems, index)
    if (res.kind === 'single') {
      updateStarMapSession({ choicePending: false })
      navigate({ to: '/star-map/$systemId', params: { systemId: res.systemId }, search: {}, replace: true })
    } else {
      if (res.kind === 'empty') updateStarMapSession({ choicePending: false })
      navigate({ to: '/star-map', search: {}, replace: true })
    }
  }, [hasIncoming, search, systems, index, navigate])

  const resolution = useMemo(
    () => (session ? resolveStarMapSystem(session.payload, systems, index) : null),
    [session, systems, index],
  )

  const enter = (systemId: string) => {
    updateStarMapSession({ choicePending: false, wholeSystem: undefined })
    navigate({ to: '/star-map/$systemId', params: { systemId }, search: {} })
  }

  const choice =
    session?.choicePending && resolution && (resolution.kind === 'multiple' || resolution.kind === 'none')
      ? resolution
      : null
  const nameOf = (id: string) => index.systems.find((s) => s.id === id)?.name ?? id

  return (
    <main className="site-shell relative z-10 py-6 min-w-0 w-full overflow-x-hidden">
      <div className="site-surface relative h-[calc(100vh-8rem)] min-h-[480px] overflow-hidden">
        <StarMapOverview index={index} onEnter={enter} />
        {choice && (
          <div className="site-tooltip-panel absolute top-4 left-1/2 -translate-x-1/2 z-20 w-[min(92%,26rem)]" role="dialog">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-slate-200">
                {choice.kind === 'multiple'
                  ? 'This information covers more than one system. Choose a system to view it in.'
                  : 'No system matches this information. Choose a system to view it in.'}
              </p>
              <button
                type="button"
                className="site-btn-icon !p-1 shrink-0"
                aria-label="Close"
                onClick={() => updateStarMapSession({ choicePending: false })}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {choice.systemIds.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="site-btn-secondary rounded-lg text-xs !px-3 !py-1.5"
                  onClick={() => enter(id)}
                >
                  {nameOf(id)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
