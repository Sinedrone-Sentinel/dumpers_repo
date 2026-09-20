import { lazy, Suspense, useState } from 'react'

const SiteHelpModal = lazy(() => import('./SiteHelpModal'))

/**
 * Header entry point for the site Help chat, right-most so it reads as "help
 * with this site" rather than part of the account controls.
 *
 * Owns its own modal state — no Layout plumbing — and lazy-loads the chat so the
 * baked Archive knowledge never weighs on first paint.
 */
export default function SiteHelpChip({ disabled = false }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className="site-chrome-control w-9 h-9 flex items-center justify-center disabled:opacity-40"
        aria-label="Help"
        title="Help — ask how this site works"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
      {open ? (
        <Suspense fallback={null}>
          <SiteHelpModal onClose={() => setOpen(false)} />
        </Suspense>
      ) : null}
    </>
  )
}
