import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { DUMPER_APPS_DISPLAY_NAME } from '../config/bpDumper'
import { useBlueprintData } from './blueprints'
import { useAuth } from '../contexts/AuthContext'
import { useBpDumperModal } from '../contexts/BpDumperModalContext'
import { useBlueprintOrderOverrides } from '../hooks/useBlueprintOrderOverrides'
import { useTargetList } from '../hooks/useTargetList'
import { catalogIsReward } from '../lib/blueprintOrderable'
import { isDefaultBlueprint } from '../lib/defaultBlueprints'
import { buildMissionList, getMissionsForBlueprint, missionKey, type MissionListEntry } from '../lib/missions'
import { findBrowseMissionEntry, getRewardMissionsForBlueprint } from '../lib/blueprintMissionRewards'
import {
  formatBlueprintUnlockBadge,
  getBlueprintUnlockInfo,
  getPoolsForBlueprint,
} from '../lib/missionAcquisition'
import BrowseMissionsView from '../components/BrowseMissionsView'
import BpDumperCallout from '../components/bpDumper/BpDumperCallout'
import MissionListingTags from '../components/MissionListingTags'
import { readMissionTrackerUiState, writeMissionTrackerUiState, makeBrowseMissionKey } from '../lib/missionTrackerUiState'
import { setAnalyticsSubTool } from '../lib/analytics'

type ViewMode = 'tracker' | 'browse'

function MissionMetaLine({
  mission,
}: {
  mission: Pick<
    MissionListEntry,
    | 'regions'
    | 'subRegion'
    | 'system'
    | 'category'
    | 'repMin'
    | 'repMax'
    | 'repEffects'
    | 'prereqMissions'
    | 'locality'
    | 'giver'
    | 'title'
    | 'mission'
    | 'minStandingName'
    | 'minReputation'
    | 'repCareerLabel'
    | 'dropChance'
    | 'isLawful'
    | 'aUecMin'
    | 'aUecMax'
    | 'frequency'
    | 'notForRelease'
  >
}) {
  return (
    <MissionListingTags
      className="flex flex-col gap-1 mt-0.5"
      isLawful={mission.isLawful}
      showVerifiedBadge
      category={mission.category}
      regions={mission.regions}
      subRegion={mission.subRegion}
      system={mission.system}
      locality={mission.locality}
      minStandingName={mission.minStandingName}
      minReputation={mission.minReputation}
      showRepUnknown
      repCareerLabel={mission.repCareerLabel}
      aUecMin={mission.aUecMin}
      aUecMax={mission.aUecMax}
      repEffects={mission.repEffects}
      repMin={mission.repMin}
      repMax={mission.repMax}
      missionFaction={mission.giver}
      missionTitle={mission.title || mission.mission}
      prereqMissions={mission.prereqMissions}
      dropChance={mission.dropChance}
      frequency={mission.frequency}
      notForRelease={mission.notForRelease}
    />
  )
}

function BlueprintUnlockBadge({
  blueprintId,
  isReward,
}: {
  blueprintId: string
  isReward?: boolean
}) {
  const info = getBlueprintUnlockInfo(blueprintId)
  const label = formatBlueprintUnlockBadge(blueprintId, isReward)
  const known = info.unlockMinReputation != null || info.isAvailableByDefault
  const showWarning = known && info.isInferred

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border ${
        known
          ? 'text-purple-300 border-purple-500/40 bg-purple-950/30'
          : 'text-slate-500 border-slate-600/40 bg-slate-900/40'
      }`}
    >
      {label}
      {showWarning && (
        <span
          className="inline-flex items-center justify-center w-3.5 h-3.5 text-[8px] font-bold text-amber-900 bg-amber-400 rounded cursor-help"
          title="This unlock level is estimated from community data and may not be 100% accurate"
        >
          !
        </span>
      )}
    </span>
  )
}

function MissionChecklistGroups({
  groups,
  onRemove,
  onOpenInBrowse,
}: {
  groups: ReturnType<typeof buildMissionList>
  onRemove: (mission: { missionKey: string; mission: string }) => void
  onOpenInBrowse?: (mission: MissionListEntry) => void
}) {
  if (groups.length === 0) {
    return (
      <p className="text-slate-500 text-sm bg-slate-900/40 rounded-xl p-4 border border-slate-800">
        No missions on your checklist yet. Add missions from your targets on the left, or use{' '}
        <strong className="text-amber-300/90">Add all</strong> per blueprint.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div
          key={group.giver}
          className="bg-slate-900/50 border border-slate-700 rounded-xl overflow-hidden"
        >
          <div className="px-4 py-2 bg-slate-800/80 border-b border-slate-700">
            <h3 className="text-sm font-semibold text-purple-300">{group.giver}</h3>
          </div>
          <ul className="divide-y divide-slate-800">
            {group.missions.map((mission) => {
              return (
                <li
                  key={mission.missionKey}
                  className="px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {onOpenInBrowse ? (
                        <button
                          type="button"
                          onClick={() => onOpenInBrowse(mission)}
                          className={`text-sm text-left hover:underline underline-offset-2 ${
                            mission.isLawful ? 'text-green-300 hover:text-green-200' : 'text-red-400 hover:text-red-300'
                          }`}
                          title="View blueprints for this mission in Browse Missions"
                        >
                          {mission.title}
                        </button>
                      ) : (
                        <p className={`text-sm ${mission.isLawful ? 'text-green-300' : 'text-red-400'}`}>{mission.title}</p>
                      )}
                      <MissionMetaLine mission={mission} />
                      <p className="text-xs text-slate-500 mt-1">
                        Waiting on: {mission.unacquiredBlueprintIds.length} blueprint
                        {mission.unacquiredBlueprintIds.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onRemove(mission)}
                      className="shrink-0 px-2 py-1 text-xs text-red-400 hover:text-red-300 border border-red-500/30 rounded-lg hover:bg-red-950/30 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

function formatEmptyMissionMessage(blueprintId: string): string {
  if (getRewardMissionsForBlueprint(blueprintId).length > 0) {
    return 'No reward missions for this blueprint.'
  }
  const pools = getPoolsForBlueprint(blueprintId)
  if (catalogIsReward(blueprintId) && pools.length > 0) {
    const poolLabel = pools[0].replace(/^xenothreat2_/i, 'XenoThreat ').replace(/_/g, ' ')
    return `In reward pool ${poolLabel} — mission link pending data update.`
  }
  return 'No reward missions for this blueprint.'
}

export default function TargetsRoute() {
  const { acquiredBlueprints, isApproved, isGuestPreview, user, toggleAcquired } = useAuth()
  const { openBpDumperModal } = useBpDumperModal()
  const isGuest = isGuestPreview && !user
  const { data: blueprints = [] } = useBlueprintData()
  const { overridesMap } = useBlueprintOrderOverrides()
  const [viewMode, setViewMode] = useState<ViewMode>(() => readMissionTrackerUiState().topView)
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    return new Set(readMissionTrackerUiState().collapsedBlueprintIds)
  })

  useEffect(() => {
    writeMissionTrackerUiState({
      topView: viewMode,
      collapsedBlueprintIds: [...collapsedIds],
    })
  }, [viewMode, collapsedIds])

  useEffect(() => {
    setAnalyticsSubTool(viewMode === 'browse' ? 'browse_missions' : 'my_tracker')
  }, [viewMode])

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const openMissionInBrowse = useCallback((mission: MissionListEntry) => {
    const entry = findBrowseMissionEntry(mission.mission, {
      faction: mission.giver,
      system: mission.system,
      region: mission.subRegion,
      localityKey: mission.locality?.key,
    })
    if (!entry) return

    writeMissionTrackerUiState({
      topView: 'browse',
      browse: {
        selectedFaction: entry.faction,
        selectedMissionKey: makeBrowseMissionKey(entry),
        searchTerm: '',
      },
    })
    setViewMode('browse')
  }, [])

  // Build a map of blueprint ID to its mission keys for cleanup
  const blueprintMissionKeysMap = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const bp of blueprints) {
      const keys: string[] = []
      for (const reward of getRewardMissionsForBlueprint(bp.internalName)) {
        const mission = reward.mission?.trim()
        if (!mission) continue
        keys.push(missionKey(`${mission}|${reward.minReputation ?? ''}|${reward.maxReputation ?? ''}`))
      }
      map[bp.internalName] = keys
    }
    return map
  }, [blueprints])

  const getMissionKeysForBlueprint = useCallback(
    (blueprintId: string) => blueprintMissionKeysMap[blueprintId] ?? [],
    [blueprintMissionKeysMap]
  )

  const {
    targetIds,
    missionPrefs,
    loading,
    error,
    toggleTarget,
    addMissionToChecklist,
    removeMissionFromChecklist,
    addAllMissionsToChecklist,
    isMissionOnChecklist,
    targetCount,
    refresh,
  } = useTargetList(overridesMap, getMissionKeysForBlueprint)

  const acquiredSet = useMemo(
    () => new Set(Object.keys(acquiredBlueprints).filter((k) => acquiredBlueprints[k])),
    [acquiredBlueprints]
  )

  const targetBlueprintRecords = useMemo(() => {
    return blueprints
      .filter((bp) => targetIds[bp.internalName] && !acquiredSet.has(bp.internalName))
      .sort((a, b) => (a.blueprintName ?? '').localeCompare(b.blueprintName ?? ''))
  }, [blueprints, targetIds, acquiredSet])

  const missionGroups = useMemo(
    () =>
      buildMissionList(
        targetBlueprintRecords.map((bp) => ({
          blueprintId: bp.internalName,
          blueprintName: bp.blueprintName ?? 'Unknown',
          rewardMissions: bp.rewardMissions,
        })),
        acquiredSet,
        missionPrefs
      ),
    [targetBlueprintRecords, acquiredSet, missionPrefs]
  )

  const activeMissionCount = missionGroups.reduce((sum, g) => sum + g.missions.length, 0)

  const handleAddToTrackerFromBrowse = useCallback(
    (blueprintId: string) => {
      void toggleTarget(blueprintId)
    },
    [toggleTarget]
  )

  const isOnTargetList = useCallback(
    (blueprintId: string) => !!targetIds[blueprintId],
    [targetIds]
  )

  if (!isApproved && !isGuest) {
    return (
      <FeaturePageLayout
        title="Mission Tracker"
        subtitle="Star Citizen blueprint mission tracker"
        seoIntro="Track which reputation missions reward crafting blueprints, build a wishlist of recipes you still need, and browse faction contracts by location and standing. Sync unlocks with BP Dumper while you play."
      >
        <div className="text-center py-16 text-slate-400">
          Available after your account is approved.
        </div>
      </FeaturePageLayout>
    )
  }

  return (
    <FeaturePageLayout
      title="Mission Tracker"
      subtitle="Star Citizen blueprint mission tracker"
      seoIntro="Track which reputation missions reward crafting blueprints, build a wishlist of recipes you still need, and browse faction contracts by location and standing. Sync unlocks with BP Dumper while you play."
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={openBpDumperModal}
            className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-600 rounded-lg transition-colors"
          >
            {DUMPER_APPS_DISPLAY_NAME}
          </button>
          <Link
            to="/targets/live"
            className="site-btn-primary !rounded-lg !px-3 !py-1.5 text-sm"
          >
            Live Tracker
          </Link>
          {viewMode === 'tracker' && (
            <button
              onClick={() => void refresh()}
              className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded-lg transition-colors"
            >
              Refresh
            </button>
          )}
        </div>
      }
    >
      {/* View Mode Toggle */}
      <div className="flex items-center gap-2 p-1 bg-slate-800/50 rounded-lg w-fit mb-6">
        <button
          onClick={() => setViewMode('tracker')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors site-btn-shimmer ${
            viewMode === 'tracker'
              ? 'site-filter-selected-orange'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          My Tracker
        </button>
        <button
          onClick={() => setViewMode('browse')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors site-btn-shimmer ${
            viewMode === 'browse'
              ? 'site-filter-selected-orange'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Browse Missions
        </button>
      </div>

      <BpDumperCallout onOpenModal={openBpDumperModal} />

      {isGuest && viewMode === 'tracker' && (
        <div className="mb-4 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-950/30 text-xs text-amber-200/90">
          <strong className="text-amber-100">Offline Mode</strong> — Your tracked missions save in this browser only. 
          Sign in to sync across devices.
        </div>
      )}

      {error && viewMode === 'tracker' && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/40 text-red-300 text-sm">
          {error}
          {error.includes('relation') && (
            <p className="mt-2 text-red-200/80">
              Run migration <code className="text-red-100">011_target_bp_list.sql</code> in Supabase first.
            </p>
          )}
        </div>
      )}

      {/* Browse Missions View */}
      {viewMode === 'browse' && (
        <BrowseMissionsView
          acquiredBlueprints={acquiredBlueprints}
          onAddToTracker={handleAddToTrackerFromBrowse}
          onMarkAcquired={toggleAcquired}
          isOnTargetList={isOnTargetList}
        />
      )}

      {/* Tracker View */}
      {viewMode === 'tracker' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-500 text-xs uppercase tracking-wide">Targets</p>
              <p className="text-2xl font-bold text-white mt-1">{targetCount}</p>
            </div>
            <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
              <p className="text-slate-500 text-xs uppercase tracking-wide">On checklist</p>
              <p className="text-2xl font-bold text-amber-400 mt-1">{activeMissionCount}</p>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-400">Loading tracked blueprints…</div>
          ) : targetCount === 0 ? (
            <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-slate-700">
              <p className="text-slate-400 text-lg mb-2">No tracked blueprints yet</p>
              <p className="text-slate-500 text-sm">
                Use the <strong className="text-amber-400">Track</strong> button on a blueprint card or inside the blueprint details,
                or switch to <strong className="text-orange-400">Browse Missions</strong> to explore mission pools.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_1fr] gap-6 items-start">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Your targets</h2>
              <div className="flex items-center gap-1">
                {!targetBlueprintRecords.every(bp => collapsedIds.has(bp.internalName)) && (
                  <button
                    type="button"
                    onClick={() => setCollapsedIds(new Set(targetBlueprintRecords.map(bp => bp.internalName)))}
                    className="px-2 py-1 text-xs text-slate-400 hover:text-white border border-slate-600 hover:border-slate-500 rounded transition-colors"
                  >
                    Close All
                  </button>
                )}
                {collapsedIds.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setCollapsedIds(new Set())}
                    className="px-2 py-1 text-xs text-slate-400 hover:text-white border border-slate-600 hover:border-slate-500 rounded transition-colors"
                  >
                    Open All
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-4">
              {targetBlueprintRecords.map((bp) => {
                const missions = getMissionsForBlueprint(
                  {
                    blueprintId: bp.internalName,
                    blueprintName: bp.blueprintName ?? 'Unknown',
                    rewardMissions: bp.rewardMissions,
                  },
                  acquiredSet
                )
                const addableMissions = missions.filter((m) => !isMissionOnChecklist(m.missionKey))

                return (
                  <div
                    key={bp.internalName}
                    className="bg-slate-900/50 border border-slate-700 rounded-xl overflow-hidden"
                  >
                    <div className="px-3 py-2.5 bg-slate-800/80 border-b border-slate-700 flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleCollapsed(bp.internalName)}
                        className="flex items-start gap-2 min-w-0 flex-1 text-left hover:opacity-80 transition-opacity"
                      >
                        <svg
                          className={`w-4 h-4 mt-0.5 text-slate-400 shrink-0 transition-transform duration-200 ${
                            collapsedIds.has(bp.internalName) ? '-rotate-90' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white leading-snug">{bp.blueprintName}</p>
                          <div className="mt-1">
                            <BlueprintUnlockBadge
                              blueprintId={bp.internalName}
                              isReward={getRewardMissionsForBlueprint(bp.internalName).length > 0}
                            />
                          </div>
                        </div>
                      </button>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {isDefaultBlueprint(bp.internalName) ? (
                          <span className="px-2.5 py-1 text-[10px] font-bold text-emerald-300/80 bg-emerald-950/40 border border-emerald-700/40 rounded">
                            Starter BP
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void toggleAcquired(bp.internalName)}
                            className="px-2.5 py-1 text-[10px] font-bold text-emerald-900 bg-emerald-500 hover:bg-emerald-400 border border-emerald-400 rounded shadow-sm transition-colors"
                          >
                            ✓ Got It!
                          </button>
                        )}
                        <div className="flex items-center gap-1">
                          {addableMissions.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                void addAllMissionsToChecklist(
                                  addableMissions.map((m) => ({
                                    key: m.missionKey,
                                    label: m.mission,
                                  }))
                                )
                              }
                              className="px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/40 rounded hover:bg-amber-950/40 transition-colors"
                            >
                              Add all
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void toggleTarget(bp.internalName)}
                            className="px-2 py-0.5 text-[10px] text-red-400 hover:text-red-300 border border-red-500/30 rounded hover:bg-red-950/30 transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>

                    {!collapsedIds.has(bp.internalName) && (
                      missions.length === 0 ? (
                        <p className="px-3 py-3 text-xs text-slate-500">{formatEmptyMissionMessage(bp.internalName)}</p>
                      ) : (
                        <ul className="divide-y divide-slate-800/80">
                          {missions.map((m) => {
                            const onChecklist = isMissionOnChecklist(m.missionKey)
                            return (
                              <li key={m.missionKey}>
                                <button
                                  type="button"
                                  disabled={onChecklist}
                                  onClick={() => void addMissionToChecklist(m.missionKey, m.mission)}
                                  className={`w-full text-left px-3 py-2.5 transition-colors ${
                                    onChecklist
                                      ? 'opacity-40 cursor-not-allowed bg-slate-950/20'
                                      : 'hover:bg-slate-800/50 cursor-pointer'
                                  }`}
                                  title={
                                    onChecklist
                                      ? 'Already on your checklist'
                                      : 'Add to mission checklist'
                                  }
                                >
                                  <p className={`text-xs leading-snug ${m.isLawful ? 'text-green-300' : 'text-red-400'}`}>{m.mission}</p>
                                  <MissionMetaLine mission={m} />
                                </button>
                              </li>
                            )
                          })}
                        </ul>
                      )
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">Mission checklist</h2>
            <MissionChecklistGroups
              groups={missionGroups}
              onRemove={(mission) =>
                void removeMissionFromChecklist(mission.missionKey, mission.mission)
              }
              onOpenInBrowse={openMissionInBrowse}
            />
          </section>
        </div>
          )}
        </>
      )}
    </FeaturePageLayout>
  )
}
