import { useState } from 'react'
import AppModal from './layout/AppModal'
import type { MissionPrereq, PrereqMissionRef } from '../lib/blueprintMissionRewards'
import { formatMissionSolo } from '../lib/missionFrequency'
import MissionLocalityTag from './MissionLocalityTag'

/** Dedupe prereq missions across several reward missions (for blueprint modals). */
export function collectUniquePrereqs(
  lists: (MissionPrereq[] | null | undefined)[]
): MissionPrereq[] {
  const seen = new Set<string>()
  const result: MissionPrereq[] = []
  for (const list of lists) {
    for (const prereq of list ?? []) {
      const key = prereq.missions
        .map((m) => m.debugName || `${m.faction}|${m.title}`)
        .sort()
        .join('||') + `#${prereq.requiredCount}`
      if (seen.has(key)) continue
      seen.add(key)
      result.push(prereq)
    }
  }
  return result
}

/**
 * Overview layout for prereq rows: category + locality flag + Solo.
 * No system/region chips and no board-refresh time tags.
 *
 * @param showAsIntroPath — true for every option in an OR-group ("complete 1 of these"),
 *   so alternate unlock paths get the same Intro badge as the faction introContracts entry.
 */
function PrereqMissionRow({
  mission,
  showAsIntroPath = false,
}: {
  mission: PrereqMissionRef
  showAsIntroPath?: boolean
}) {
  const soloText = formatMissionSolo(mission.frequency ?? null)
  const showIntroBadge = Boolean(mission.isIntro || showAsIntroPath)
  const showNoBpBadge = mission.hasBlueprints === false

  return (
    <div className="px-3 py-2 rounded-lg border border-slate-700/80 bg-slate-800/40">
      <p className="text-sm leading-snug">
        <span className="text-slate-400">{mission.faction}:</span>{' '}
        <span className={mission.isLawful === false ? 'text-red-400' : 'text-green-300'}>
          {mission.title}
        </span>
      </p>
      <div className="flex flex-col gap-1 mt-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {showIntroBadge ? (
            <span className="text-[10px] px-1.5 py-0.5 bg-purple-950/50 text-purple-300 border border-purple-500/40 rounded">
              Intro mission — kick-starts this faction's contracts
            </span>
          ) : null}
          {showNoBpBadge ? (
            <span className="text-[10px] px-1.5 py-0.5 bg-purple-950/50 text-purple-300/80 border border-purple-500/30 rounded">
              No blueprint reward
            </span>
          ) : null}
          {mission.category && (
            <span className="text-[10px] px-1.5 py-0.5 bg-amber-950/50 text-amber-300 border border-amber-500/40 rounded">
              Contracts tab: {mission.category}
            </span>
          )}
          <MissionLocalityTag locality={mission.locality} />
        </div>
        {soloText ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] px-1.5 py-0.5 bg-red-950/50 text-red-400 border border-red-500/50 rounded font-medium">
              {soloText}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Inline list of prerequisite missions — used inside modals (overview layout). */
export function MissionPrereqList({ prereqs }: { prereqs: MissionPrereq[] }) {
  if (prereqs.length === 0) return null

  return (
    <div className="space-y-3">
      {prereqs.map((prereq, idx) => (
        <div key={idx}>
          <p className="text-xs text-slate-400 mb-1.5">
            {prereq.missions.length > 1
              ? `Complete ${prereq.requiredCount} of these missions first:`
              : prereq.requiredCount > 1
                ? `Complete this mission ${prereq.requiredCount} times first:`
                : 'Complete this mission first:'}
          </p>
          <div className="space-y-1.5">
            {prereq.missions.map((mission) => (
              <PrereqMissionRow
                key={mission.debugName || mission.title}
                mission={mission}
                showAsIntroPath={prereq.missions.length > 1}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

interface MissionPrereqTagProps {
  prereqMissions?: MissionPrereq[] | null
  /** Title of the gated mission, shown in the modal subtitle. */
  missionTitle?: string
}

/**
 * Clickable "Unlocked by prior mission" chip. Opens a modal listing the
 * intro/starter missions that must be completed before this mission appears
 * in the game's Contracts app.
 */
export default function MissionPrereqTag({ prereqMissions, missionTitle }: MissionPrereqTagProps) {
  const [open, setOpen] = useState(false)
  if (!prereqMissions?.length) return null

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            setOpen(true)
          }
        }}
        className="text-[10px] px-1.5 py-0.5 bg-purple-950/50 text-purple-300 border border-purple-500/40 rounded cursor-pointer hover:bg-purple-900/50 hover:border-purple-400/60 transition-colors"
        title="This mission only shows up after you complete a prerequisite mission — click for details"
      >
        🔒 Unlocked by prior mission
      </span>
      {open && (
        <AppModal
          title="Prerequisite missions"
          subtitle={missionTitle ? `Required before "${missionTitle}" appears` : 'Required before this mission appears'}
          onClose={() => setOpen(false)}
          size="md"
          zIndex={80}
        >
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              The game only offers this contract after you finish the mission(s) below — including
              starter missions that do not award blueprints themselves. Look for them in the
              in-game Contracts app under the listed tab.
            </p>
            <MissionPrereqList prereqs={prereqMissions} />
          </div>
        </AppModal>
      )}
    </>
  )
}
