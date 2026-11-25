import { useNavigate } from '@tanstack/react-router'
import SiteTooltip from '../SiteTooltip'
import { useAuth } from '../../contexts/AuthContext'
import { STAR_MAP_WINDOW, publishStarMapHandoff, type StarMapPayload } from '../../lib/starMapHighlight'
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
          const id = publishStarMapHandoff(payload)
          const href = `/star-map?handoff=${encodeURIComponent(id)}`
          const opened = window.open(href, STAR_MAP_WINDOW)
          if (opened) {
            // A named tab that is already open is often only focused. Load this run into it.
            try {
              if (!opened.location.href.includes(`handoff=${encodeURIComponent(id)}`)) opened.location.href = href
            } catch {
              // The new page has not committed yet.
            }
            opened.focus()
            return
          }
          startStarMapSession(payload)
          void navigate({ to: '/star-map', search: { handoff: id } })
        }}
      >
        View Map
      </button>
    </SiteTooltip>
  )
}
