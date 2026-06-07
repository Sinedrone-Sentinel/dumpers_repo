import React, { useMemo } from 'react'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { useBlueprintData } from './blueprints'
import { useAuth } from '../contexts/AuthContext'
import { useTargetList } from '../hooks/useTargetList'
import { buildMissionList, getMissionsForBlueprint } from '../lib/missions'

function MissionChecklistGroups({
  groups,
  onRemove,
}: {
  groups: ReturnType<typeof buildMissionList>
  onRemove: (mission: string) => void
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
            {group.missions.map((mission) => (
              <li key={mission.missionKey} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200">{mission.mission}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Waiting on: {mission.unacquiredBlueprintIds.length} blueprint
                      {mission.unacquiredBlueprintIds.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onRemove(mission.mission)}
                    className="shrink-0 px-2 py-1 text-xs text-red-400 hover:text-red-300 border border-red-500/30 rounded-lg hover:bg-red-950/30 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default function TargetsRoute() {
  const { acquiredBlueprints, isApproved } = useAuth()
  const { data: blueprints = [] } = useBlueprintData()
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
  } = useTargetList()

  const acquiredSet = useMemo(
    () => new Set(Object.keys(acquiredBlueprints).filter((k) => acquiredBlueprints[k])),
    [acquiredBlueprints]
  )

  const targetBlueprintRecords = useMemo(() => {
    return blueprints.filter((bp) => targetIds[bp.file])
  }, [blueprints, targetIds])

  const missionGroups = useMemo(
    () =>
      buildMissionList(
        targetBlueprintRecords.map((bp) => ({
          blueprintId: bp.file,
          blueprintName: bp.blueprintName ?? 'Unknown',
          rewardMissions: bp.rewardMissions,
        })),
        acquiredSet,
        missionPrefs
      ),
    [targetBlueprintRecords, acquiredSet, missionPrefs]
  )

  const activeMissionCount = missionGroups.reduce((sum, g) => sum + g.missions.length, 0)

  if (!isApproved) {
    return (
      <FeaturePageLayout
        title="Target BP List"
        subtitle="Track blueprints you want and the missions that reward them"
      >
        <div className="text-center py-16 text-slate-400">
          Available after your account is approved.
        </div>
      </FeaturePageLayout>
    )
  }

  return (
    <FeaturePageLayout
      title="Target BP List"
      subtitle="Build your mission checklist from the targets you are still hunting"
      actions={
        <button
          onClick={() => void refresh()}
          className="px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded-lg transition-colors"
        >
          Refresh
        </button>
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-500/40 text-red-300 text-sm">
          {error}
          {error.includes('relation') && (
            <p className="mt-2 text-red-200/80">
              Run migration <code className="text-red-100">011_target_bp_list.sql</code> in Supabase first.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs uppercase tracking-wide">Still needed</p>
          <p className="text-2xl font-bold text-white mt-1">{targetCount}</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-700 rounded-xl p-4">
          <p className="text-slate-500 text-xs uppercase tracking-wide">On checklist</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">{activeMissionCount}</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">Loading target list…</div>
      ) : targetCount === 0 ? (
        <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-dashed border-slate-700">
          <p className="text-slate-400 text-lg mb-2">No target blueprints yet</p>
          <p className="text-slate-500 text-sm">
            Open an un-acquired blueprint and use <strong className="text-amber-400">+ Target</strong> on the card.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(280px,360px)_1fr] gap-6 items-start">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-white">Your targets</h2>
            <div className="space-y-4">
              {targetBlueprintRecords.map((bp) => {
                const missions = getMissionsForBlueprint(
                  {
                    blueprintId: bp.file,
                    blueprintName: bp.blueprintName ?? 'Unknown',
                    rewardMissions: bp.rewardMissions,
                  },
                  acquiredSet
                )
                const addableMissions = missions.filter((m) => !isMissionOnChecklist(m.missionKey))

                return (
                  <div
                    key={bp.file}
                    className="bg-slate-900/50 border border-slate-700 rounded-xl overflow-hidden"
                  >
                    <div className="px-3 py-2.5 bg-slate-800/80 border-b border-slate-700 flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-white leading-snug">{bp.blueprintName}</p>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {addableMissions.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              void addAllMissionsToChecklist(addableMissions.map((m) => m.mission))
                            }
                            className="px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/40 rounded hover:bg-amber-950/40 transition-colors"
                          >
                            Add all
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => void toggleTarget(bp.file)}
                          className="px-2 py-0.5 text-[10px] text-red-400 hover:text-red-300 border border-red-500/30 rounded hover:bg-red-950/30 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </div>

                    {missions.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-slate-500">No reward missions for this blueprint.</p>
                    ) : (
                      <ul className="divide-y divide-slate-800/80">
                        {missions.map((m) => {
                          const onChecklist = isMissionOnChecklist(m.missionKey)
                          return (
                            <li key={m.missionKey}>
                              <button
                                type="button"
                                disabled={onChecklist}
                                onClick={() => void addMissionToChecklist(m.mission)}
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
                                <p className="text-xs text-slate-300 leading-snug">{m.mission}</p>
                              </button>
                            </li>
                          )
                        })}
                      </ul>
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
              onRemove={(mission) => void removeMissionFromChecklist(mission)}
            />
          </section>
        </div>
      )}
    </FeaturePageLayout>
  )
}
