import { reloadForAppUpdate } from '../../lib/appVersion'

/**
 * Shown only when this tab's build id is behind the deployed /version.json.
 */
export default function UpdateAvailableBanner() {
  return (
    <div
      className="bg-cyan-950 border-b border-cyan-400/50 shadow-md shadow-cyan-950/40"
      role="status"
      aria-live="polite"
    >
      <div className="site-shell py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-center">
        <p className="text-cyan-50">
          <strong>Site update available</strong>
          {' — '}
          Refresh to load the latest changes.
        </p>
        <button
          type="button"
          onClick={() => reloadForAppUpdate()}
          className="px-3 py-1 text-xs font-medium rounded border bg-cyan-500 text-slate-950 border-cyan-200/50 hover:bg-cyan-400 transition-colors shrink-0"
        >
          Refresh
        </button>
      </div>
    </div>
  )
}
