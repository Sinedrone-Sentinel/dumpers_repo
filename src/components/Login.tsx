import React, { useEffect, useState } from 'react'
import SiteBrandTitle from './SiteBrandTitle'
import { SITE_COPYRIGHT, SITE_SLOGAN } from '../config/site'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export default function Login() {
  const { signInWithGoogle, loading, enterGuestPreview } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [autoApproveEnabled, setAutoApproveEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    const fetchAutoApprove = async () => {
      const { data, error } = await supabase.rpc('get_auto_approve_enabled')
      if (!error && data !== null) {
        setAutoApproveEnabled(data)
      } else {
        setAutoApproveEnabled(false)
      }
    }
    fetchAutoApprove()
  }, [])

  const handleLogin = async () => {
    try {
      setError(null)
      await signInWithGoogle()
    } catch (e) {
      setError('Failed to sign in. Please try again.')
    }
  }

  return (
    <div className="site-page-bg min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="mb-8">
          <SiteBrandTitle size="hero" layout="stacked" slogan={SITE_SLOGAN} />
        </div>

        <div className="bg-slate-900/80 border border-slate-700 rounded-2xl p-8 shadow-2xl">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-white mb-2">Welcome</h2>
              <p className="text-slate-400 text-sm">
                Sign in with your Google account to track blueprints and sync across devices.
              </p>
            </div>

            {error && (
              <div className="bg-red-900/50 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white hover:bg-gray-100 text-gray-800 font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {loading ? 'Signing in...' : 'Sign in with Google'}
            </button>

            {autoApproveEnabled === false && (
              <div className="text-center text-slate-500 text-xs">
                <p>New accounts require approval from an officer.</p>
              </div>
            )}

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center" aria-hidden>
                <div className="w-full border-t border-slate-700" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-900/80 px-2 text-slate-500">or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={enterGuestPreview}
              className="w-full px-6 py-3 rounded-xl border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 hover:bg-slate-800/60 text-sm font-medium transition-all"
            >
              Continue in Offline Mode
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-slate-500 text-sm">
            {SITE_COPYRIGHT}
          </p>
        </div>
      </div>
    </div>
  )
}
