import React, { useCallback, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useClickOutside } from '../../hooks/useClickOutside'
import {
  OAUTH_PROVIDERS,
  OAUTH_PROVIDER_LABELS,
  type OAuthProviderId,
} from '../../lib/authProviders'
import AuthProviderIcon from '../settings/AuthProviderIcon'

export default function SignInMenu() {
  const { signInWithGoogle, signInWithDiscord, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const [busyProvider, setBusyProvider] = useState<OAuthProviderId | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])
  useClickOutside(containerRef, open, close)

  const signingIn = loading || busyProvider !== null

  const signInHandlers: Record<OAuthProviderId, () => Promise<void>> = {
    google: signInWithGoogle,
    discord: signInWithDiscord,
  }

  const handleSignIn = async (provider: OAuthProviderId) => {
    setBusyProvider(provider)
    close()
    try {
      await signInHandlers[provider]()
    } catch {
      setBusyProvider(null)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={signingIn}
        className="site-btn-primary inline-flex items-center gap-1.5 !rounded-lg !px-3 !py-1.5 text-xs font-medium"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        {signingIn ? 'Signing in...' : 'Sign in'}
        {!signingIn && (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="site-menu-panel absolute right-0 top-full mt-2 w-52 z-[60] py-1"
        >
          <p className="px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500 border-b border-orange-500/15">
            Choose provider
          </p>
          {OAUTH_PROVIDERS.map((provider) => (
            <button
              key={provider}
              type="button"
              role="menuitem"
              onClick={() => void handleSignIn(provider)}
              className="site-dropdown-item flex items-center gap-3 px-3 py-2.5"
            >
              <AuthProviderIcon provider={provider} className="w-4 h-4 shrink-0" />
              <span>{OAUTH_PROVIDER_LABELS[provider]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
