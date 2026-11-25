import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import StarMapHandoffListener from '../components/starMap/StarMapHandoffListener'
import StarMapSystemView from '../components/starMap/StarMapSystemView'
import { starMapCanvasClass, starMapStageClass } from '../components/starMap/starMapFrame'
import { useAuth } from '../contexts/AuthContext'
import { setAnalyticsSubTool } from '../lib/analytics'
import type { StarMapMarker } from '../lib/starMap'
import { expandRoute, isDedicatedStarMapWindow, markedIdsInSystem, type StarMapPayload } from '../lib/starMapHighlight'
import { getStarMapData } from '../lib/starMapData'
import {
  clearStarMapSessionIfLeft,
  getStarMapSession,
  startStarMapSession,
  updateStarMapSession,
  useStarMapSession,
} from '../lib/starMapSession'

const EMPTY_PAYLOAD: StarMapPayload = {}

export default function StarMapSystemRoute() {
  const { systemId = '' } = useParams({ strict: false }) as { systemId?: string }
  const navigate = useNavigate()
  const { canUseFeature } = useAuth()
  const mapOnly = isDedicatedStarMapWindow() && !canUseFeature('star_map')
  const { index, systems } = getStarMapData()
  const system = systems[systemId]
  const session = useStarMapSession()
  const payload = session?.payload ?? EMPTY_PAYLOAD
  const wholeSystem = session?.wholeSystem === true
  const markedIds = useMemo(() => markedIdsInSystem(payload, systems, systemId), [payload, systems, systemId])
  const routePoints = useMemo(() => expandRoute(payload, systems, index.links), [payload, systems, index])

  useEffect(() => () => clearStarMapSessionIfLeft(), [])

  useEffect(() => {
    if (system) setAnalyticsSubTool(system.id)
  }, [system])

  const back = () => {
    updateStarMapSession({ wholeSystem: undefined, choicePending: false })
    navigate({ to: '/star-map', search: {} })
  }

  const jump = (marker: StarMapMarker) => {
    if (!marker.toSystem || !systems[marker.toSystem]) return
    if (!getStarMapSession()) startStarMapSession({})
    updateStarMapSession({ wholeSystem: true, choicePending: false })
    navigate({ to: '/star-map/$systemId', params: { systemId: marker.toSystem }, search: {} })
  }

  if (mapOnly) {
    return (
      <main className={starMapStageClass()}>
        <div className={`${starMapCanvasClass()} flex items-center justify-center`}>
          <p className="text-sm text-slate-300">Star Map is not available.</p>
        </div>
      </main>
    )
  }

  return (
    <main className={starMapStageClass()}>
      <div className={starMapCanvasClass()}>
        <StarMapHandoffListener systemId={system?.id} />
        {system ? (
          <StarMapSystemView
            key={system.id}
            system={system}
            index={index}
            markedIds={markedIds}
            routePoints={routePoints}
            shops={payload.shops}
            telemetry={payload.category === 'hauler' ? 'hauler' : 'shopping'}
            active={payload.active}
            wholeSystem={wholeSystem}
            focusId={session?.focusId ?? 0}
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
    </main>
  )
}
