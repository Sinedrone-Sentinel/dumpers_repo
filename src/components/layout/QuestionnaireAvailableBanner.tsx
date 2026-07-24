type Props = {
  title: string
  onOpen: () => void
  onDecline: () => void
}

/**
 * Guest-facing prompt for a pending questionnaire (same chrome slot family as
 * UpdateAvailableBanner).
 */
export default function QuestionnaireAvailableBanner({ title, onOpen, onDecline }: Props) {
  return (
    <div
      className="bg-cyan-950/90 border-b border-cyan-500/40 shadow-md shadow-cyan-950/40"
      role="status"
      aria-live="polite"
    >
      <div className="site-shell py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-center text-cyan-100">
        <p>
          <strong className="text-cyan-50">Questionnaire available</strong>
          {' — '}
          {title}
          {' '}
          <span className="text-cyan-200/80">(answers are anonymous)</span>
        </p>
        <button
          type="button"
          onClick={onOpen}
          className="px-3 py-1.5 rounded-lg text-xs font-medium site-btn-shimmer bg-cyan-800/80 hover:bg-cyan-700 text-white border border-cyan-500/40 whitespace-nowrap shrink-0"
        >
          Open
        </button>
        <button
          type="button"
          onClick={onDecline}
          className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-500/60 text-slate-200 hover:bg-slate-800/80 whitespace-nowrap shrink-0"
        >
          Decline
        </button>
      </div>
    </div>
  )
}
