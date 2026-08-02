import AppModal from './layout/AppModal'
import type { BlueprintRewardMission } from '../lib/blueprintMissionRewards'
import { findBrowseMissionEntry } from '../lib/blueprintMissionRewards'
import type { Region } from '../lib/missions'
import { collectUniquePrereqs, MissionPrereqList } from './MissionPrereqInfo'
import MissionListingTags from './MissionListingTags'

interface BlueprintRewardMissionsModalProps {
  blueprintName: string
  missions: BlueprintRewardMission[]
  onClose: () => void
  onSelectMission: (mission: BlueprintRewardMission) => void
}

function regionsForMission(system?: string | null): Region[] {
  const key = system?.toLowerCase()
  return key === 'stanton' || key === 'pyro' || key === 'nyx' ? [key] : []
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
              region: mission.region,
              poolKey: mission.poolKey,
              debugName: mission.debugName,
              localityKey: mission.locality?.key,
            }) != null
            const rowKey = [
              mission.mission,
              mission.minReputation ?? 'null',
              mission.maxReputation ?? 'null',
              mission.system ?? 'unknown',
              mission.region ?? 'null',
              mission.poolKey || 'null',
              mission.locality?.key ?? 'null',
              mission.debugName || '',
            ].join('|')

            return (
              <li key={rowKey}>
                <button
                  type="button"
                  disabled={!canNavigate}
                  onClick={() => onSelectMission(mission)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    canNavigate
                      ? 'site-filter-idle hover:border-orange-500/40 cursor-pointer'
                      : 'site-filter-idle opacity-50 cursor-not-allowed'
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
                  </p>
                  <MissionListingTags
                    layout="overview"
                    className="flex flex-col gap-1 mt-1.5"
                    isLawful={mission.isLawful}
                    showVerifiedBadge
                    category={mission.category}
                    regions={regionsForMission(mission.system)}
                    subRegion={mission.region}
                    system={mission.system}
                    poolKey={mission.poolKey}
                    locality={mission.locality}
                    minStandingName={mission.standingName}
                    minReputation={mission.minReputation}
                    repCareerLabel={mission.repCareerLabel}
                    repEffects={mission.repEffects}
                    repPoints={mission.repPoints}
                    missionFaction={mission.faction}
                    missionTitle={mission.title}
                    prereqMissions={mission.prereqMissions}
                    dropChance={mission.chance}
                    frequency={mission.frequency}
                    notForRelease={mission.notForRelease}
                  />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </AppModal>
  )
}
