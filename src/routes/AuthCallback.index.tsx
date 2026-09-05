import React, { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '../contexts/AuthContext'
import OAuthSignInButtons from '../components/auth/OAuthSignInButtons'

export default function AuthCallbackRoute() {
  const { user, loading, oauthReturnError } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (oauthReturnError) setError(oauthReturnError)
  }, [oauthReturnError])

  useEffect(() => {
    if (loading || !user) return
    void navigate({ to: '/' })
  }, [loading, user, navigate])

  return (
    <div className="site-page-bg min-h-screen text-slate-200 flex items-center justify-center p-4">
      <div className="site-panel w-full max-w-md p-8 text-center space-y-4">
        <h1 className="text-xl font-semibold text-white">
          {user ? 'Signed in' : error ? 'Sign-in did not finish' : 'Signing you in'}
        </h1>
        {error ? (
          <>
            <p className="site-banner-error text-left" role="alert">
              {error}
            </p>
            <OAuthSignInButtons onError={setError} />
          </>
        ) : (
          <p className="text-sm text-slate-400">
            Finishing Discord or Google sign-in. Stay on this page.
          </p>
        )}
      </div>
    </div>
  )
}
