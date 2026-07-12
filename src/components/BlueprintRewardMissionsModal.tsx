import AppModal from './layout/AppModal'
import type { BlueprintRewardMission } from '../lib/blueprintMissionRewards'
import { findBrowseMissionEntry } from '../lib/blueprintMissionRewards'
import { collectUniquePrereqs, MissionPrereqList } from './MissionPrereqInfo'

interface BlueprintRewardMissionsModalProps {
  blueprintName: string
  missions: BlueprintRewardMission[]
  onClose: () => void
  onSelectMission: (mission: BlueprintRewardMission) => void
}

export default function BlueprintRewardMissionsModal({
  blueprintName,
  missions,
  onClose,
  onSelectMission,
}: BlueprintRewardMissionsModalProps) {
  const prereqs = collectUniquePrereqs(missions.map((mission) => mission.prereqMissions))

  return (
    <AppModal
      title="Reward missions"
      subtitle={blueprintName}
      onClose={onClose}
      size="md"
    >
      {prereqs.length > 0 && (
        <div className="mb-4 p-3 rounded-lg border border-purple-500/30 bg-purple-950/20">
          <p className="text-sm font-semibold text-purple-300 mb-2">
            🔒 Prerequisite missions — do these first
          </p>
          <p className="text-xs text-slate-400 mb-2.5">
            Some missions below only appear in the Contracts app after you complete these
            intro missions.
          </p>
          <MissionPrereqList prereqs={prereqs} />
        </div>
      )}
      {missions.length === 0 ? (
        <p className="text-sm text-slate-500">No reward missions found for this blueprint.</p>
      ) : (
        <ul className="space-y-1">
          {missions.map((mission) => {
            const canNavigate = findBrowseMissionEntry(mission.mission, {
              faction: mission.faction,
              system: mission.system,
            }) != null
            const rowKey = [
              mission.mission,
              mission.minReputation ?? 'null',
              mission.maxReputation ?? 'null',
              mission.system ?? 'unknown',
            ].join('|')

            return (
              <li key={rowKey}>
                <button
                  type="button"
                  disabled={!canNavigate}
                  onClick={() => onSelectMission(mission)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    canNavigate
                      ? 'border-slate-700/80 hover:border-orange-500/40 hover:bg-slate-800/60 cursor-pointer'
                      : 'border-slate-800/60 opacity-50 cursor-not-allowed'
                  }`}
                  title={
                    canNavigate
                      ? 'Open this mission in Browse Missions'
                      : 'Mission browse entry not available'
                  }
                >
                  <p className="text-sm leading-snug">
                    <span className="text-slate-400">{mission.faction}:</span>{' '}
                    <span className={mission.isLawful ? 'text-green-300' : 'text-red-400'}>
                      {mission.title}
                    </span>
                    {(mission.prereqMissions?.length ?? 0) > 0 && (
                      <span
                        className="ml-1.5 text-[10px] text-purple-300/90"
                        title="Requires a prerequisite mission first — see the list above"
                      >
                        🔒
                      </span>
                    )}
                  </p>
                  {mission.locality?.label && (
                    <p
                      className="mt-0.5 text-[10px] text-sky-300/90"
                      title="This contract only shows up in your Contracts app while you're in this area"
                    >
                      📍 {mission.locality.label}
                    </p>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </AppModal>
  )
}
