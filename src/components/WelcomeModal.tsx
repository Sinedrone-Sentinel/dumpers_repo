import React, { useState, useId } from 'react'
import { Link } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useBodyScrollLock } from '../hooks/useBodyScrollLock'
import { useUiOverlayRegistration } from '../contexts/UiOverlayContext'

interface WelcomeModalProps {
  onClose: () => void
}

export default function WelcomeModal({ onClose }: WelcomeModalProps) {
  useBodyScrollLock(true)
  const overlayId = useId()
  useUiOverlayRegistration(overlayId, true)
  
  const { profile, refreshProfile } = useAuth()
  const [step, setStep] = useState(0)
  const [rsiHandle, setRsiHandle] = useState(profile?.rsi_handle || '')
  const [validating, setValidating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const totalSteps = 3
  const isVerified = profile?.rsi_handle_verified ?? false

  const handleValidateHandle = async () => {
    if (!rsiHandle.trim()) {
      setValidationError('Enter an RSI handle first.')
      return
    }

    setValidating(true)
    setValidationError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setValidationError('Not authenticated')
        setValidating(false)
        return
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-rsi-handle`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ handle: rsiHandle.trim() })
        }
      )

      const result = await response.json()

      if (!response.ok) {
        setValidationError(result.error || 'Validation failed')
      } else if (!result.valid) {
        setValidationError(result.error || 'RSI Handle not found')
        if (result.cleared) {
          setRsiHandle('') // Clear local input
          await refreshProfile() // Sync with DB
        }
      } else if (result.verified) {
        await refreshProfile()
      } else {
        setValidationError(result.error || 'Verification failed')
      }
    } catch {
      setValidationError('Network error during validation')
    }

    setValidating(false)
  }

  const handleFinish = async () => {
    // Mark welcome as seen
    await supabase.rpc('mark_welcome_seen')
    onClose()
  }

  const handleGoToArchive = async () => {
    await supabase.rpc('mark_welcome_seen')
    onClose()
    // Navigate handled by Link component
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 bg-gradient-to-br from-orange-600/20 to-slate-900 border-b border-slate-700">
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
                  i <= step ? 'bg-orange-500' : 'bg-slate-700'
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
                Our <strong className="text-white">Dumper's Fair-Value Price (DFP)</strong> algorithm calculates 
                what resources and items are actually worth — no more getting gouged by grey market sellers 
                asking billions for items that take an hour to get.
              </p>
              <div className="mt-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
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
              </p>
              <div className="mt-2 p-3 bg-amber-900/30 border border-amber-500/30 rounded-lg">
                <p className="text-xs text-amber-300 flex items-start gap-2">
                  <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>
                    <strong>Note:</strong> An RSI Handle is <strong>required</strong> to create Custom Orders 
                    or participate in Fulfillment. You can skip this for now but will need to set it later 
                    to access those features.
                  </span>
                </p>
              </div>
              <div className="mt-4">
                <label className="block text-sm text-slate-300 mb-2">RSI Handle</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={rsiHandle}
                    onChange={(e) => setRsiHandle(e.target.value)}
                    placeholder="Your Star Citizen username"
                    disabled={isVerified}
                    className={`flex-1 px-3 py-2 bg-slate-800 border rounded-lg text-white placeholder:text-slate-500 focus:outline-none transition-all ${
                      isVerified
                        ? 'border-slate-700 opacity-60 cursor-not-allowed'
                        : 'border-slate-700 focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30'
                    }`}
                  />
                  {!isVerified && (
                    <button
                      onClick={handleValidateHandle}
                      disabled={validating || !rsiHandle.trim()}
                      className="shrink-0 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Validate against RSI website"
                    >
                      {validating ? (
                        <span className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        </span>
                      ) : 'Validate'}
                    </button>
                  )}
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
                    Verified on RSI
                  </p>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                You can always change this later in your profile settings.
              </p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-white font-medium">You're All Set!</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                You're ready to start using Dumper's Repo. Here are some quick ways to get started:
              </p>
              
              <div className="space-y-3 mt-4">
                <Link
                  to="/archive"
                  onClick={handleGoToArchive}
                  className="flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-orange-500/30 rounded-lg transition-all group"
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
                </Link>

                <Link
                  to="/"
                  onClick={handleFinish}
                  className="flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-orange-500/30 rounded-lg transition-all group"
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
                </Link>

                <Link
                  to="/resources"
                  onClick={handleFinish}
                  className="flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-orange-500/30 rounded-lg transition-all group"
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
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-800/50 border-t border-slate-700 flex items-center justify-between">
          {step > 0 ? (
            <button
              onClick={() => setStep(step - 1)}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Back
            </button>
          ) : (
            <div />
          )}
          
          {step < totalSteps - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              className="px-5 py-2 text-sm bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="px-5 py-2 text-sm bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors"
            >
              Get Started
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
