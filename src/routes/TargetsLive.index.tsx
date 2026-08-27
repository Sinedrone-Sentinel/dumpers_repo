import React, { useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { setAnalyticsSubTool } from '../lib/analytics'
import { DUMPER_APPS_DISPLAY_NAME } from '../config/bpDumper'
import { useBpDumperModal } from '../contexts/BpDumperModalContext'
import { useLiveMissionTracker } from '../hooks/useLiveMissionTracker'

export default function TargetsLiveRoute() {
  const { openBpDumperModal } = useBpDumperModal()
  const { loading, refreshing, error, isConnected, statusBar, hideMissionLists, missions, remaining, refresh } =
    useLiveMissionTracker()

  useEffect(() => {
    setAnalyticsSubTool('live_tracker')
  }, [])

  return (
    <FeaturePageLayout
      title="Live Mission Tracker"
      subtitle="Active in-game missions and pool blueprints still to acquire"
      actions={
        <div className="flex items-center gap-2">
          {isConnected && (
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="site-btn-secondary px-3 py-1.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
              title="Re-pull active missions and blueprints from the server"
            >
              {refreshing ? 'Syncing…' : 'ReSync'}
            </button>
          )}
          <Link
            to="/targets"
            className="site-btn-secondary px-3 py-1.5 text-sm"
          >
            Mission Tracker
          </Link>
        </div>
      }
    >
      {error && (
        <div className="mb-4 site-banner-error">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading live tracker…</p>
      ) : isConnected ? (
        <>
          <div
            className={`mb-6 flex items-start gap-3 rounded-lg border px-4 py-3 ${statusBar.barClass}`}
            role="status"
            aria-live="polite"
          >
            <span
              className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${statusBar.dotClass}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium leading-snug ${statusBar.textClass}`}>
                {statusBar.message}
              </p>
              {statusBar.subMessage && (
                <p className={`mt-1 text-xs leading-relaxed opacity-90 ${statusBar.textClass}`}>
                  {statusBar.subMessage}
                </p>
              )}
            </div>
          </div>

          {hideMissionLists ? (
            <div className="site-empty px-6 py-12">
              <p className="text-sm text-slate-500">
                Mission and blueprint lists are hidden until you are back in the Persistent Universe.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[320px]">
              <section className="site-section flex flex-col">
                <header className="site-section-header px-4 py-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Active missions ({missions.length})
                  </h2>
                </header>
                <ul className="flex-1 divide-y divide-slate-800/80 overflow-y-auto max-h-[480px]">
                  {missions.length === 0 ? (
                    <li className="px-4 py-8 text-sm text-slate-500 text-center">
                      Accept a blueprint mission in-game to see it here.
                    </li>
                  ) : (
                    missions.map((mission) => (
                      <li
                        key={mission.missionGuid}
                        className={`px-4 py-3 text-sm ${
                          mission.hasZeroRemaining ? 'text-red-400' : 'text-slate-200'
                        }`}
                      >
                        <p
                          className={`font-medium leading-snug ${
                            mission.isLawful ? 'text-green-300' : 'text-red-400'
                          } ${mission.hasZeroRemaining ? '!text-red-400' : ''}`}
                        >
                          {mission.displayLabel}
                        </p>
                        {mission.hasBlueprintPool && (
                          <p className="text-xs mt-1.5 text-slate-500">
                            {mission.remainingCount} blueprint{mission.remainingCount === 1 ? '' : 's'}{' '}
                            remaining in pool
                          </p>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </section>

              <section className="site-section flex flex-col">
                <header className="site-section-header px-4 py-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Remaining to acquire ({remaining.length})
                  </h2>
                </header>
                <ul className="flex-1 divide-y divide-slate-800/80 overflow-y-auto max-h-[480px]">
                      {remaining.length === 0 ? (
                    <li className="px-4 py-8 text-sm text-slate-500 text-center">
                      {missions.length === 0
                        ? 'Pool blueprints from active missions appear here.'
                        : missions.some((mission) => mission.hasBlueprintPool)
                          ? 'All pool blueprints from active missions are already acquired.'
                          : 'None of these missions drop pool blueprints.'}
                    </li>
                  ) : (
                    remaining.map((bp) => (
                      <li key={bp.internalName} className="px-4 py-3 text-sm text-slate-200">
                        <p className="font-medium">{bp.blueprintName}</p>
                        {bp.categoryName && (
                          <p className="text-xs mt-0.5 text-slate-500">{bp.categoryName}</p>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </section>
            </div>
          )}
        </>
      ) : (
        <div className="site-surface px-6 py-10 text-center max-w-lg mx-auto">
          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-500" aria-hidden />
            <p className="text-base font-medium text-slate-200">{DUMPER_APPS_DISPLAY_NAME} not connected</p>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">
            Start BP Dumper in watch mode with your API key, then keep this page open. Mission and
            blueprint lists are hidden until connected.
          </p>
          <button
            type="button"
            onClick={openBpDumperModal}
            className="mt-6 site-btn-primary px-4 py-2 text-sm font-medium"
          >
            Open {DUMPER_APPS_DISPLAY_NAME}
          </button>
        </div>
      )}
    </FeaturePageLayout>
  )
}
