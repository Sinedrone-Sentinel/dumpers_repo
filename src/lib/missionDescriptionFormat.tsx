import React from 'react'
import { parseMissionDescription } from './missionDescriptionParse'

function PlaceholderChip({
  label,
  kind,
  raw,
}: {
  label: string
  kind: 'mission' | 'emphasis'
  raw: string
}) {
  const isMission = kind === 'mission'
  return (
    <span
      title={
        isMission
          ? 'Filled in by the game when you accept this contract (location, target, amount, etc.)'
          : 'Highlighted term from the in-game mission text'
      }
      className={
        isMission
          ? 'inline-flex items-center align-baseline mx-0.5 px-1.5 py-0.5 rounded border text-[11px] font-semibold tracking-wide bg-violet-950/60 text-violet-200 border-violet-500/45'
          : 'inline-flex items-center align-baseline mx-0.5 px-1.5 py-0.5 rounded border text-[11px] font-medium bg-sky-950/50 text-sky-200 border-sky-500/40'
      }
    >
      {isMission ? (
        <>
          <span className="opacity-70 mr-1 font-normal normal-case">in-game</span>
          {label}
        </>
      ) : (
        label
      )}
      <span className="sr-only"> ({raw})</span>
    </span>
  )
}

/** Renders mission body with ~mission / EM placeholders as chips. */
export function MissionDescriptionText({ text }: { text: string }) {
  const segments = parseMissionDescription(text)
  if (segments.length === 0) return null

  return (
    <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <React.Fragment key={i}>{seg.text}</React.Fragment>
        ) : (
          <PlaceholderChip key={i} label={seg.label} kind={seg.kind} raw={seg.raw} />
        )
      )}
    </p>
  )
}
