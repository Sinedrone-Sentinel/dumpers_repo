import React from 'react'

interface MoleCrewModeCheckboxProps {
  crewMode: boolean
  onCrewModeChange: (crew: boolean) => void
}

/** Rock Calculator header — checked = crew turrets; unchecked = solo (one head at a time). */
export default function MoleCrewModeCheckbox({
  crewMode,
  onCrewModeChange,
}: MoleCrewModeCheckboxProps) {
  return (
    <label className="mt-1 flex items-center gap-2 cursor-pointer w-fit">
      <input
        type="checkbox"
        checked={crewMode}
        onChange={(event) => onCrewModeChange(event.target.checked)}
        className="rounded border-slate-600 bg-slate-800 text-orange-500 focus:ring-orange-500/40"
      />
      <span className="text-xs text-slate-300">Crew</span>
    </label>
  )
}
