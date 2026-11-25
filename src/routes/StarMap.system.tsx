import { useEffect, useMemo } from 'react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import StarMapSystemView from '../components/starMap/StarMapSystemView'
import { setAnalyticsSubTool } from '../lib/analytics'
import type { StarMapMarker } from '../lib/starMap'
import {
  expandRoute,
  markedIdsInSystem,
  payloadFromSearch,
  type StarMapSearch,
} from '../lib/starMapHighlight'
import { getStarMapData } from '../lib/starMapData'

export default function StarMapSystemRoute() {
  const { systemId = '' } = useParams({ strict: false }) as { systemId?: string }
  const search = useSearch({ strict: false }) as StarMapSearch
  const navigate = useNavigate()
  const { index, systems } = getStarMapData()
  const system = systems[systemId]
  const payload = useMemo(() => payloadFromSearch(search), [search])
  const markedIds = useMemo(() => markedIdsInSystem(payload, systems, systemId), [payload, systems, systemId])
  const routePoints = useMemo(() => expandRoute(payload, systems, index.links), [payload, systems, index])

  useEffect(() => {
    if (system) setAnalyticsSubTool(system.id)
  }, [system])

  const back = () => navigate({ to: '/star-map', search: {} })

  const jump = (marker: StarMapMarker) => {
    if (!marker.toSystem || !systems[marker.toSystem]) return
    navigate({
      to: '/star-map/$systemId',
      params: { systemId: marker.toSystem },
      search: { ...search, focus: marker.toMarkerId ?? undefined },
    })
  }

  return (
    <FeaturePageLayout title="Star Map">
      <div className="site-surface relative h-[calc(100vh-11rem)] min-h-[480px] overflow-hidden">
        {system ? (
          <StarMapSystemView
            key={`${system.id}:${search.focus ?? ''}`}
            system={system}
            index={index}
            markedIds={markedIds}
            routePoints={routePoints}
            focusMarkerId={search.focus}
            onBack={back}
            onJump={jump}
          />
        ) : (
          <div className="site-empty absolute inset-0 flex flex-col items-center justify-center gap-3">
            <p>That system is not on the map.</p>
            <button type="button" className="site-btn-secondary rounded-lg text-sm" onClick={back}>
              Back
            </button>
          </div>
        )}
      </div>
    </FeaturePageLayout>
  )
}
