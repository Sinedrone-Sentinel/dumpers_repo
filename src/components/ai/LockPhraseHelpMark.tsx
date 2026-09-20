import React from 'react'
import { ADVISOR_LOCK_PHRASE_HELP } from '../../lib/miningAdvisorLockPhraseHelp'
import SiteTooltip from '../SiteTooltip'

/** Explains the lock phrase wherever a member can save their Gemini key. */
export default function LockPhraseHelpMark(): React.ReactElement {
  return (
    <SiteTooltip
      side="left"
      ignoreOverlayPause
      toggleOnClick
      panelClassName="max-w-[20rem] text-left"
      content={
        <span className="block space-y-2">
          {ADVISOR_LOCK_PHRASE_HELP.map((item) => (
            <span key={item.q} className="block">
              <span className="block font-medium text-slate-100">{item.q}</span>
              <span className="block text-slate-300">{item.a}</span>
            </span>
          ))}
        </span>
      }
    >
      <button
        type="button"
        className="site-btn-icon !p-0.5 text-slate-400 hover:text-slate-200"
        aria-label="About the lock phrase"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
    </SiteTooltip>
  )
}
