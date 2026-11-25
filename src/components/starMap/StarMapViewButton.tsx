import { useNavigate } from '@tanstack/react-router'
import SiteTooltip from '../SiteTooltip'
import { useAuth } from '../../contexts/AuthContext'
import type { StarMapPayload } from '../../lib/starMapHighlight'
import { startStarMapSession } from '../../lib/starMapSession'

/** Opens the Star Map with a shopping run. Hidden until the Star Map is available. */
export default function StarMapViewButton({ payload }: { payload: StarMapPayload }) {
  const { canUseFeature } = useAuth()
  const navigate = useNavigate()
  if (!canUseFeature('star_map')) return null
  return (
    <SiteTooltip side="top" content="Open the Star Map with these stops. Each stop shows what to buy or sell.">
      <button
        type="button"
        className="site-btn-secondary rounded-md !px-2 !py-0.5 text-[11px]"
        onClick={() => {
          startStarMapSession(payload)
          void navigate({ to: '/star-map', search: {} })
        }}
      >
        View Map
      </button>
    </SiteTooltip>
  )
}
