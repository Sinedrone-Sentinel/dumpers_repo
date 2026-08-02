import React, { useCallback, useEffect, useState } from 'react'
import type { UserIdentity } from '@supabase/supabase-js'
import { useAuth } from '../../contexts/AuthContext'
import {
  OAUTH_PROVIDERS,
  OAUTH_PROVIDER_LABELS,
  type OAuthProviderId,
} from '../../lib/authProviders'
import AuthProviderIcon from './AuthProviderIcon'
import SettingsField from './SettingsField'
import SettingsSection from './SettingsSection'

function formatLinkedDate(iso: string | undefined): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return null
  }
}

export default function ConnectedAccountsSettings({
  onMessage,
}: {
  onMessage: (message: { type: 'success' | 'error'; text: string } | null) => void
}) {
  const { user, getLinkedIdentities, linkWithGoogle, linkWithDiscord, unlinkProvider } = useAuth()
  const [identities, setIdentities] = useState<UserIdentity[]>([])
  const [loading, setLoading] = useState(true)
  const [busyProvider, setBusyProvider] = useState<OAuthProviderId | null>(null)

  const reloadIdentities = useCallback(async () => {
    if (!user) {
      setIdentities([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const linked = await getLinkedIdentities()
      setIdentities(linked)
    } catch {
      onMessage({ type: 'error', text: 'Failed to load connected accounts.' })
    } finally {
      setLoading(false)
    }
  }, [user, getLinkedIdentities, onMessage])

  useEffect(() => {
    void reloadIdentities()
  }, [reloadIdentities])

  const identityForProvider = (provider: OAuthProviderId) =>
    identities.find((identity) => identity.provider === provider)

  const linkHandlers: Record<OAuthProviderId, () => Promise<void>> = {
    google: linkWithGoogle,
    discord: linkWithDiscord,
  }

  const handleLink = async (provider: OAuthProviderId) => {
    onMessage(null)
    setBusyProvider(provider)
    try {
      await linkHandlers[provider]()
    } catch {
      onMessage({ type: 'error', text: `Failed to connect ${OAUTH_PROVIDER_LABELS[provider]}.` })
      setBusyProvider(null)
    }
  }

  const handleUnlink = async (provider: OAuthProviderId, identity: UserIdentity) => {
    if (identities.length < 2) return

    onMessage(null)
    setBusyProvider(provider)
    try {
      await unlinkProvider(identity)
      await reloadIdentities()
      onMessage({
        type: 'success',
        text: `${OAUTH_PROVIDER_LABELS[provider]} disconnected.`,
      })
    } catch {
      onMessage({ type: 'error', text: `Failed to disconnect ${OAUTH_PROVIDER_LABELS[provider]}.` })
    } finally {
      setBusyProvider(null)
    }
  }

  const canUnlink = identities.length >= 2

  return (
    <SettingsSection
      title="Connected Accounts"
      description="Link Google or Discord to sign in with either method on one account"
    >
      <SettingsField
        label="Sign-in methods"
        hint={
          canUnlink
            ? 'When emails match, sign-in automatically merges into your existing account. You can also connect providers manually here.'
            : 'Connect a second sign-in method if you want options. You must keep at least one connected.'
        }
      >
        <div className="space-y-3">
          {OAUTH_PROVIDERS.map((provider) => {
            const identity = identityForProvider(provider)
            const linkedDate = formatLinkedDate(identity?.created_at)
            const isBusy = busyProvider === provider

            return (
              <div
                key={provider}
                className="flex flex-wrap items-center justify-between gap-3 site-surface px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <AuthProviderIcon provider={provider} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{OAUTH_PROVIDER_LABELS[provider]}</p>
                    <p className="text-xs text-slate-400">
                      {loading
                        ? 'Checking…'
                        : identity
                          ? linkedDate
                            ? `Connected · ${linkedDate}`
                            : 'Connected'
                          : 'Not connected'}
                    </p>
                  </div>
                </div>

                {identity ? (
                  <button
                    type="button"
                    onClick={() => void handleUnlink(provider, identity)}
                    disabled={!canUnlink || isBusy || loading}
                    title={
                      canUnlink
                        ? `Disconnect ${OAUTH_PROVIDER_LABELS[provider]}`
                        : 'Keep at least one sign-in method connected'
                    }
                    className="site-btn-secondary shrink-0 !px-3 !py-1.5 text-sm disabled:cursor-not-allowed"
                  >
                    {isBusy ? 'Working…' : 'Disconnect'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleLink(provider)}
                    disabled={isBusy || loading}
                    className="site-btn-secondary shrink-0 !px-3 !py-1.5 text-sm disabled:cursor-not-allowed"
                  >
                    {isBusy ? 'Redirecting…' : 'Connect'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </SettingsField>
    </SettingsSection>
  )
}
