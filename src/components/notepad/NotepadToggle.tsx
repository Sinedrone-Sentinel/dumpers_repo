import { useNotepad } from '../../contexts/NotepadContext'
import SiteTooltip from '../SiteTooltip'

export default function NotepadToggle({ className = '' }: { className?: string }) {
  const { open, toggle, dirty } = useNotepad()

  return (
    <SiteTooltip content={open ? 'Hide notepad' : 'Notepad'}><button
      type="button"
      onClick={toggle}
      className={`site-chrome-control w-9 h-9 ${open ? 'border-amber-400/60 text-amber-200' : ''} ${className}`.trim()}
      aria-label={open ? 'Hide notepad' : 'Show notepad'}
      aria-expanded={open}
      aria-controls="site-notepad-panel"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.6}
          d="M14 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2v-6M8 9h4M8 13h3M8 17h6"
        />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.6}
          d="M18.5 3.5a1.77 1.77 0 012.5 2.5L14 13l-3 .75.75-3 6.75-7.25z"
        />
      </svg>
      {dirty ? (
        <span
          className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-400 ring-2 ring-slate-950"
          aria-hidden
        />
      ) : null}
    </button></SiteTooltip>
  )
}
