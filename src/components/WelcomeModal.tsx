import React, { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

interface WelcomeModalProps {
  onClose: () => void
  onOpenSettings: () => void
}

export default function WelcomeModal({ onClose, onOpenSettings }: WelcomeModalProps) {
  const { user, profile, refreshProfile } = useAuth()
  const [step, setStep] = useState(0)
  const [rsiHandle, setRsiHandle] = useState(profile?.rsi_handle || '')
  const [saving, setSaving] = useState(false)

  const totalSteps = 3

  const handleSaveHandle = async () => {
    if (!user?.id || !rsiHandle.trim()) return
    
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ rsi_handle: rsiHandle.trim() })
      .eq('id', user.id)
    
    if (!error) {
      await refreshProfile()
    }
    setSaving(false)
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
                Our <strong className="text-white">Dumper's Fair Price (DFP)</strong> algorithm calculates 
                what resources and items are actually worth — no more getting gouged by grey market sellers 
                asking billions for items that take an hour to get.
              </p>
              <div className="mt-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <p className="text-xs text-slate-500">
                  <span className="text-orange-400 font-medium">Pro tip:</span> The Information Archive 
                  has a complete guide explaining every feature and how they work together.
                </p>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-white font-medium">Set Your RSI Handle</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Your RSI handle helps org members identify you. This is optional but recommended 
                for coordinating trades and crafting orders.
              </p>
              <div className="mt-4">
                <label className="block text-sm text-slate-300 mb-2">RSI Handle</label>
                <input
                  type="text"
                  value={rsiHandle}
                  onChange={(e) => setRsiHandle(e.target.value)}
                  placeholder="Your Star Citizen username"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30"
                />
                {rsiHandle.trim() && rsiHandle !== profile?.rsi_handle && (
                  <button
                    onClick={handleSaveHandle}
                    disabled={saving}
                    className="mt-3 px-4 py-2 text-sm bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white rounded-lg transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Handle'}
                  </button>
                )}
                {rsiHandle === profile?.rsi_handle && profile?.rsi_handle && (
                  <p className="mt-2 text-xs text-green-400 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Saved
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

                <button
                  onClick={() => { handleFinish(); onOpenSettings(); }}
                  className="w-full flex items-center gap-3 p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-orange-500/30 rounded-lg transition-all group text-left"
                >
                  <div className="p-2 rounded-lg bg-purple-600/20 text-purple-400 group-hover:bg-purple-600/30 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <span className="text-sm font-medium text-slate-200 group-hover:text-orange-300 transition-colors">
                      Configure Settings
                    </span>
                    <p className="text-xs text-slate-500">Set up your profile and preferences</p>
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
