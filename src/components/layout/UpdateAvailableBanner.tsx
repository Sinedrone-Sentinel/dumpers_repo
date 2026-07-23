import { reloadForAppUpdate } from '../../lib/appVersion'

/**
 * Shown only when this tab's build id is behind the deployed /version.json.
 */
export default function UpdateAvailableBanner() {
  return (
    <div className="bg-cyan-950/70 border-b border-cyan-500/40">
      <div className="site-shell py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-center">
        <p className="text-cyan-100/95">
          <strong className="text-cyan-50">Site update available</strong>
          {' — '}
          Refresh to load the latest changes.
        </p>
        <button
          type="button"
          onClick={() => reloadForAppUpdate()}
          className="px-3 py-1 text-xs font-medium rounded border bg-cyan-600/90 text-white border-cyan-300/40 hover:bg-cyan-500 transition-colors shrink-0"
        >
          Refresh
        </button>
      </div>
    </div>
  )
}
