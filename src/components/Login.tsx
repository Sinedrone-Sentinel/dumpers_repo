import React, { useState } from 'react'
import SiteBrandTitle from './SiteBrandTitle'
import { SITE_COPYRIGHT, SITE_SLOGAN } from '../config/site'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import OAuthSignInButtons from './auth/OAuthSignInButtons'

export default function Login() {
  const { loading, enterGuestPreview, oauthReturnError } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [autoApproveEnabled, setAutoApproveEnabled] = useState<boolean | null>(null)

  React.useEffect(() => {
    if (oauthReturnError) setError(oauthReturnError)
  }, [oauthReturnError])

  React.useEffect(() => {
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

  return (
    <div className="site-page-bg min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="mb-8">
          <SiteBrandTitle size="hero" layout="stacked" slogan={SITE_SLOGAN} />
        </div>

        <div className="site-modal-shell p-8 shadow-2xl">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-white mb-2">Welcome</h2>
              <p className="text-slate-400 text-sm">
                Sign in with Google or Discord to track blueprints and sync across devices.
              </p>
            </div>

            {error && (
              <div className="site-banner-error p-3 text-sm">
                {error}
              </div>
            )}

            <OAuthSignInButtons disabled={loading} onError={setError} />

            {autoApproveEnabled === false && (
              <div className="text-center text-slate-500 text-xs">
                <p>New accounts require approval from an officer.</p>
              </div>
            )}

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center" aria-hidden>
                <div className="w-full site-divider" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="site-page-bg px-2 text-slate-500">or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={enterGuestPreview}
              className="site-btn-secondary w-full px-6 py-3 rounded-xl text-sm font-medium"
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
