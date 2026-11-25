import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import StarMapOverview from '../components/starMap/StarMapOverview'
import { setAnalyticsSubTool } from '../lib/analytics'
import { payloadFromSearch, resolveStarMapSystem, type StarMapSearch } from '../lib/starMapHighlight'
import { getStarMapData } from '../lib/starMapData'

export default function StarMapIndexRoute() {
  const search = useSearch({ strict: false }) as StarMapSearch
  const navigate = useNavigate()
  const { index, systems } = getStarMapData()
  const payload = useMemo(() => payloadFromSearch(search), [search])
  const resolution = useMemo(() => resolveStarMapSystem(payload, systems, index), [payload, systems, index])
  const [choiceDismissed, setChoiceDismissed] = useState(false)

  useEffect(() => {
    setAnalyticsSubTool('overview')
  }, [])

  const enter = (systemId: string) => {
    navigate({ to: '/star-map/$systemId', params: { systemId }, search: { ...search, focus: undefined } })
  }

  useEffect(() => {
    if (resolution.kind === 'single') {
      navigate({
        to: '/star-map/$systemId',
        params: { systemId: resolution.systemId },
        search: { ...search, focus: undefined },
        replace: true,
      })
    }
  }, [resolution, navigate, search])

  const choice = resolution.kind === 'multiple' || resolution.kind === 'none' ? resolution : null
  const nameOf = (id: string) => index.systems.find((s) => s.id === id)?.name ?? id

  return (
    <FeaturePageLayout title="Star Map">
      <div className="site-surface relative h-[calc(100vh-11rem)] min-h-[480px] overflow-hidden">
        <StarMapOverview index={index} onEnter={enter} />
        {choice && !choiceDismissed && (
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
                onClick={() => setChoiceDismissed(true)}
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
    </FeaturePageLayout>
  )
}
