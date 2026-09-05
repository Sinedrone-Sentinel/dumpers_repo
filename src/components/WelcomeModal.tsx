import React, { useState, useId, useRef, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useUiOverlayRegistration } from '../contexts/UiOverlayContext'
import { SITE_RULES_SECTION } from '../lib/archiveGuide/welcomeSections'
import RsiBioVerifyControls from './RsiBioVerifyControls'
import { startCitizenIdLink } from '../lib/spectrum'

interface WelcomeModalProps {
  /** Called only after mark_welcome_seen succeeds — onboarding is not dismissible. */
  onComplete: () => void
}

/** Lightweight **bold** markers → React nodes. */
function renderRich(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="text-slate-200">
        {part}
      </strong>
    ) : (
      part
    ),
  )
}

export default function WelcomeModal({ onComplete }: WelcomeModalProps) {
  useBodyScrollLock(true)
  const overlayId = useId()
  useUiOverlayRegistration(overlayId, true)
  
  const { profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [rsiHandle, setRsiHandle] = useState(profile?.rsi_handle || '')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [finishError, setFinishError] = useState<string | null>(null)
  const [rulesScrolledToEnd, setRulesScrolledToEnd] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const [linkingCitizenId, setLinkingCitizenId] = useState(false)
  const rulesScrollRef = useRef<HTMLDivElement>(null)

  const totalSteps = 4
  const rulesStep = 2
  const isVerified = profile?.rsi_handle_verified ?? false

  useEffect(() => {
    if (step !== rulesStep) {
      setRulesScrolledToEnd(false)
      return
    }

    const el = rulesScrollRef.current
    if (!el) return

    const checkScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 8
      if (atBottom) setRulesScrolledToEnd(true)
    }

    // Content may fit without scrolling (tall viewports) — unlock immediately.
    checkScroll()
    el.addEventListener('scroll', checkScroll, { passive: true })
    return () => el.removeEventListener('scroll', checkScroll)
  }, [step])

  const finishWelcome = async (to?: string) => {
    if (finishing) return
    setFinishing(true)
    setFinishError(null)
    try {
      const { error } = await supabase.rpc('mark_welcome_seen')
      if (error) throw error
      onComplete()
      if (to) void navigate({ to })
    } catch {
      setFinishError('Could not finish onboarding. Please try again.')
    } finally {
      setFinishing(false)
    }
  }

  const canAdvance =
    step !== rulesStep || rulesScrolledToEnd

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-lg site-modal-shell overflow-hidden">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 bg-gradient-to-br from-orange-600/20 to-slate-900 site-divider">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-600/30 border border-orange-500/30">
              <svg className="w-6 h-6 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Welcome to Dumper's Repo!</h2>
              <p className="text-sm text-slate-400">Let's get you started</p>
            </div>
          </div>
          
          {/* Progress dots */}
          <div className="flex gap-2 mt-4">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i <= step ? 'bg-orange-500' : 'bg-orange-950/50'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[280px]">
          {step === 0 && (
            <div className="space-y-4">
              <h3 className="text-white font-medium">What is Dumper's Repo?</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Dumper's Repo is a community-driven platform for Star Citizen crafting, resource tracking, 
                and <strong className="text-orange-300">fair-value pricing</strong>.
              </p>
              <p className="text-sm text-slate-400 leading-relaxed">
                Our <strong className="text-white">Dumper's Fair-Value Price (DFP)</strong> system calculates 
                what resources and items are actually worth — no more getting gouged by grey market sellers 
                asking billions for items that take an hour to get.
              </p>
              <div className="mt-4 p-3 site-surface">
                <p className="text-xs text-slate-500">
                  <span className="text-orange-400 font-medium">Pro tip:</span> The{' '}
                  <a
                    href="/archive"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-400 hover:text-orange-300 underline"
                  >
                    Information Archive
                  </a>{' '}
                  has a complete guide explaining every feature and how they work together.
                </p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-white font-medium flex items-center gap-2">
                Set Your RSI Handle
                {isVerified && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-cyan-900/50 border border-cyan-500/30 rounded text-[10px] text-cyan-400 font-semibold">
                    <span className="italic">RSI</span>
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </span>
                )}
              </h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Your RSI handle helps other players identify you when coordinating trades and crafting.
                It is only saved after Verify succeeds — typing a handle or getting a code alone does not set it.
              </p>
              <div className="mt-2 p-3 bg-amber-900/30 border border-amber-500/30 rounded-lg">
                <p className="text-xs text-amber-300 flex items-start gap-2">
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>
                    <strong>Note:</strong> A verified RSI Handle is <strong>required</strong> to create Custom Orders
                    or participate in Fulfillment. You can skip this for now but will need to complete it later
                    to access those features.
                  </span>
                </p>
              </div>
              <div className="mt-4">
                <label className="site-label">RSI Handle</label>
                <RsiBioVerifyControls
                  compact
                  rsiHandle={rsiHandle}
                  onRsiHandleChange={(value) => {
                    setRsiHandle(value)
                    setValidationError(null)
                  }}
                  isVerified={isVerified}
                  onVerified={async () => {
                    setValidationError(null)
                    await refreshProfile()
                  }}
                  onError={setValidationError}
                />
                <div className="mt-3">
                  <button
                    type="button"
                    className="site-btn-primary text-sm px-3 py-2 w-full"
                    disabled={linkingCitizenId || isVerified}
                    onClick={() => {
                      void (async () => {
                        setLinkingCitizenId(true)
                        const result = await startCitizenIdLink()
                        if (!result.ok) {
                          setValidationError(result.error)
                          setLinkingCitizenId(false)
                          return
                        }
                        window.location.assign(result.url)
                      })()
                    }}
                  >
                    {linkingCitizenId ? 'Opening Citizen iD…' : 'Link Citizen iD instead'}
                  </button>
                </div>

                {validationError && (
                  <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {validationError}
                  </p>
                )}

                {isVerified && (
                  <p className="mt-2 text-xs text-cyan-400 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Verified — you can remove the code from your RSI bio.
                  </p>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                You can always change this later in your profile settings.
              </p>
            </div>
          )}

          {step === rulesStep && (
            <div className="space-y-3">
              <h3 className="text-white font-medium">{SITE_RULES_SECTION.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                {renderRich(SITE_RULES_SECTION.intro)}
              </p>
              <div
                ref={rulesScrollRef}
                className="max-h-[220px] overflow-y-auto site-surface p-3 space-y-3"
              >
                {SITE_RULES_SECTION.groups.map((group) => (
                  <div key={group.id}>
                    <h4 className="text-xs font-semibold text-slate-200 mb-1.5">{group.title}</h4>
                    <ul className="text-xs text-slate-400 space-y-1.5">
                      {group.items.map((item) => (
                        <li key={item}>• {renderRich(item)}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              {!rulesScrolledToEnd && (
                <p className="text-xs text-amber-300/90">Scroll to the end to continue</p>
              )}
              <p className="text-xs text-slate-500">
                By continuing you acknowledge our{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 underline-offset-2 hover:text-sky-300 hover:underline"
                >
                  Privacy Policy
                </a>
                .
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-white font-medium">You're All Set!</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                You're ready to start using Dumper's Repo. Here are some quick ways to get started:
              </p>
              
              <div className="space-y-3 mt-4">
                <button
                  type="button"
                  disabled={finishing}
                  onClick={() => void finishWelcome('/archive')}
                  className="w-full flex items-center gap-3 p-3 site-surface hover:border-orange-500/30 transition-all group text-left disabled:opacity-60"
                >
                  <div className="p-2 rounded-lg bg-orange-600/20 text-orange-400 group-hover:bg-orange-600/30 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-slate-200 group-hover:text-orange-300 transition-colors">
                      Read the Full Guide
                    </span>
                    <p className="text-xs text-slate-500">Learn about every feature in detail</p>
                  </div>
                  <svg className="w-4 h-4 text-slate-500 group-hover:text-orange-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                <button
                  type="button"
                  disabled={finishing}
                  onClick={() => void finishWelcome('/')}
                  className="w-full flex items-center gap-3 p-3 site-surface hover:border-orange-500/30 transition-all group text-left disabled:opacity-60"
                >
                  <div className="p-2 rounded-lg bg-blue-600/20 text-blue-400 group-hover:bg-blue-600/30 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-slate-200 group-hover:text-orange-300 transition-colors">
                      Browse Blueprints
                    </span>
                    <p className="text-xs text-slate-500">Start exploring what you can craft</p>
                  </div>
                  <svg className="w-4 h-4 text-slate-500 group-hover:text-orange-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                <button
                  type="button"
                  disabled={finishing}
                  onClick={() => void finishWelcome('/resources')}
                  className="w-full flex items-center gap-3 p-3 site-surface hover:border-orange-500/30 transition-all group text-left disabled:opacity-60"
                >
                  <div className="p-2 rounded-lg bg-purple-600/20 text-purple-400 group-hover:bg-purple-600/30 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-slate-200 group-hover:text-orange-300 transition-colors">
                      Track Your Resources
                    </span>
                    <p className="text-xs text-slate-500">Log mined materials and see DFP values</p>
                  </div>
                  <svg className="w-4 h-4 text-slate-500 group-hover:text-orange-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 site-divider space-y-2">
          {finishError && <p className="site-error-text text-center">{finishError}</p>}
          <div className="flex items-center justify-between">
            {step > 0 ? (
              <button
                onClick={() => setStep(step - 1)}
                className="site-btn-ghost"
              >
                Back
              </button>
            ) : (
              <div />
            )}
            
            {step < totalSteps - 1 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canAdvance}
                className="site-btn-primary !rounded-lg !px-5 !py-2 text-sm"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                disabled={finishing}
                onClick={() => void finishWelcome()}
                className="site-btn-primary !rounded-lg !px-5 !py-2 text-sm"
              >
                {finishing ? 'Saving…' : 'Get Started'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
