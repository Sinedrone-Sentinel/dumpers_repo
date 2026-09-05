import React, { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  OAUTH_PROVIDERS,
  OAUTH_PROVIDER_LABELS,
  type OAuthProviderId,
} from '../../lib/authProviders'
import { IN_APP_BROWSER_MESSAGE, openSiteInSystemBrowser, useInAppBrowser } from '../../lib/inAppBrowser'
import AuthProviderIcon from '../settings/AuthProviderIcon'
import InAppBrowserSignInNotice from './InAppBrowserSignInNotice'

interface OAuthSignInButtonsProps {
  layout?: 'stacked' | 'row'
  disabled?: boolean
  onError?: (message: string) => void
}

export default function OAuthSignInButtons({
  layout = 'stacked',
  disabled = false,
  onError,
}: OAuthSignInButtonsProps) {
  const { signInWithGoogle, signInWithDiscord, loading } = useAuth()
  const [busyProvider, setBusyProvider] = useState<OAuthProviderId | null>(null)
  const inAppBrowser = useInAppBrowser()

  const signingIn = loading || busyProvider !== null
  const isDisabled = disabled || signingIn

  const signInHandlers: Record<OAuthProviderId, () => Promise<void>> = {
    google: signInWithGoogle,
    discord: signInWithDiscord,
  }

  const handleSignIn = async (provider: OAuthProviderId) => {
    if (inAppBrowser) {
      onError?.(IN_APP_BROWSER_MESSAGE)
      openSiteInSystemBrowser()
      return
    }
    setBusyProvider(provider)
    try {
      await signInHandlers[provider]()
    } catch {
      onError?.(`Failed to sign in with ${OAUTH_PROVIDER_LABELS[provider]}. Please try again.`)
      setBusyProvider(null)
    }
  }

  const containerClass =
    layout === 'row' ? 'flex flex-wrap items-center gap-3' : 'space-y-3'

  return (
    <div className={inAppBrowser ? 'w-full space-y-3' : undefined}>
      {inAppBrowser && <InAppBrowserSignInNotice />}
      <div className={containerClass}>
      {OAUTH_PROVIDERS.map((provider) => {
        const isBusy = busyProvider === provider
        const isGoogle = provider === 'google'

        return (
          <button
            key={provider}
            type="button"
            onClick={() => void handleSignIn(provider)}
            disabled={isDisabled}
            className={
              layout === 'row'
                ? isGoogle
                  ? 'px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2'
                  : 'px-4 py-2 rounded-lg bg-[#5865F2] hover:bg-[#4752C4] text-white text-sm font-medium transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2'
                : isGoogle
                  ? 'w-full flex items-center justify-center gap-3 px-6 py-3 bg-white hover:bg-gray-100 text-gray-800 font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed'
                  : 'w-full flex items-center justify-center gap-3 px-6 py-3 bg-[#5865F2] hover:bg-[#4752C4] text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed'
            }
          >
            <AuthProviderIcon provider={provider} />
            {isBusy ? 'Signing in...' : `Sign in with ${OAUTH_PROVIDER_LABELS[provider]}`}
          </button>
        )
      })}
      </div>
    </div>
  )
}
