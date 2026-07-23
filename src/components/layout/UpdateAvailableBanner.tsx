import { reloadForAppUpdate } from '../../lib/appVersion'

/**
 * Shown only when this tab's build id is behind the deployed /version.json.
 * Amber styling matches BP Dumper callouts so it reads as a high-priority site notice.
 */
export default function UpdateAvailableBanner() {
  return (
    <div
      className="bg-amber-950/90 border-b border-amber-500/50 shadow-md shadow-amber-950/50"
      role="status"
      aria-live="polite"
    >
      <div className="site-shell py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-center text-amber-100">
        <p>
          <strong className="text-amber-50">Site update available</strong>
          {' — '}
          Refresh to load the latest changes.
        </p>
        <button
          type="button"
          onClick={() => reloadForAppUpdate()}
          className="px-3 py-1.5 rounded-lg text-xs font-medium site-btn-shimmer site-filter-selected-amber whitespace-nowrap shrink-0"
        >
          Refresh
        </button>
      </div>
    </div>
  )
}
