import React from 'react'

interface GuestPreviewBannerProps {
  onExit: () => void
}

export default function GuestPreviewBanner({ onExit }: GuestPreviewBannerProps) {
  return (
    <div className="bg-amber-950/60 border-b border-amber-500/30">
      <div className="site-shell py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
        <p className="text-amber-200/90">
          <strong className="text-amber-100">Offline Mode</strong> — Your data saves in this browser only. 
          Sign in to sync across devices and keep it permanently.
          Member accounts are{' '}
          <strong className="text-amber-100 font-medium">free</strong> with{' '}
          <strong className="text-amber-100 font-medium">full access</strong>.
        </p>
        <button
          type="button"
          onClick={onExit}
          className="px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-200/80 hover:text-amber-100 hover:border-amber-400/60 text-xs transition-colors shrink-0 self-start sm:self-auto"
        >
          Sign in
        </button>
      </div>
    </div>
  )
}
