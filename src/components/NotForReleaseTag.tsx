/** Shared NFR chip — content is in game files but flagged not for release. */
export const NOT_FOR_RELEASE_TOOLTIP =
  'Not For Release (NFR) in the game files — allegedly not offered in live play, but it was found in the extracted data so we still list it here.'

export default function NotForReleaseTag({ className = '' }: { className?: string }) {
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 bg-rose-950/50 text-rose-300 border border-rose-500/45 rounded font-medium cursor-help ${className}`}
      title={NOT_FOR_RELEASE_TOOLTIP}
    >
      NFR
    </span>
  )
}
