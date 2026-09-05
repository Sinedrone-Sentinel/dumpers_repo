import React, { useEffect, useState } from 'react'
import {
  consumeCitizenIdReturn,
  fetchMySpectrum,
  startCitizenIdLegacyGrace,
  startCitizenIdLink,
  unlinkCitizenId,
  type MySpectrum,
} from '../../lib/spectrum'
import SettingsField from './SettingsField'

type Props = {
  isSuperAdmin?: boolean
  hasActiveOrders: boolean
  onRefreshProfile: () => Promise<void>
  onMessage: (message: { type: 'success' | 'error'; text: string } | null) => void
}

export default function CitizenIdSettings({
  isSuperAdmin = false,
  hasActiveOrders,
  onRefreshProfile,
  onMessage,
}: Props) {
  const [spectrum, setSpectrum] = useState<MySpectrum | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [confirmUnlink, setConfirmUnlink] = useState(false)

  const reload = async () => {
    const result = await fetchMySpectrum()
    if (result.ok) setSpectrum(result.spectrum)
    setLoading(false)
  }

  useEffect(() => {
    const returned = consumeCitizenIdReturn()
    void (async () => {
      await reload()
      if (!returned) return
      if (returned.ok) {
        await onRefreshProfile()
        onMessage({ type: 'success', text: 'Citizen iD linked. Your Spectrum portrait is now your avatar.' })
        return
      }
      onMessage({
        type: 'error',
        text: returned.reason
          ? `Citizen iD link did not finish (${returned.reason}).`
          : 'Citizen iD link did not finish.',
      })
    })()
  }, [])

  const handleLink = async () => {
    onMessage(null)
    setBusy(true)
    const result = await startCitizenIdLink()
    setBusy(false)
    if (!result.ok) {
      onMessage({ type: 'error', text: result.error })
      return
    }
    window.location.assign(result.url)
  }

  const handleUnlink = async () => {
    onMessage(null)
    setBusy(true)
    const result = await unlinkCitizenId()
    setBusy(false)
    if (!result.ok) {
      onMessage({ type: 'error', text: result.error })
      return
    }
    setConfirmUnlink(false)
    await onRefreshProfile()
    await reload()
    onMessage({
      type: 'success',
      text: 'Citizen iD removed. Your RSI Handle is no longer verified.',
    })
  }

  const handleStartGrace = async () => {
    onMessage(null)
    setBusy(true)
    const result = await startCitizenIdLegacyGrace()
    setBusy(false)
    if (!result.ok) {
      onMessage({ type: 'error', text: result.error })
      return
    }
    await reload()
    onMessage({
      type: 'success',
      text: result.endsAt
        ? `Legacy bio verify grace ends ${new Date(result.endsAt).toLocaleDateString()}.`
        : 'Legacy grace started.',
    })
  }

  if (loading) {
    return <p className="site-hint">Loading Citizen iD status…</p>
  }

  const linked = Boolean(spectrum?.linked)

  return (
    <SettingsField
      label="Citizen iD"
      hint={
        linked
          ? hasActiveOrders
            ? 'Finish accepted orders (or delete your account) before removing this link.'
            : 'Removing the link un-verifies you and frees your RSI Handle — used when selling an account.'
          : spectrum?.needsLink
            ? 'Link Citizen iD to keep RSI verification after the grace period and to show your Spectrum orgs.'
            : 'Link Citizen iD to verify your RSI Handle and use your Spectrum portrait as your avatar.'
      }
    >
      {linked ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-300">
            Linked{spectrum?.rsiHandle ? ` as ${spectrum.rsiHandle}` : ''}.
            {spectrum?.primaryOrgSid ? ` Main org ${spectrum.primaryOrgSid}.` : ''}
          </p>
          {!confirmUnlink ? (
            <button
              type="button"
              className="site-btn-danger text-sm px-3 py-2"
              disabled={busy || hasActiveOrders}
              onClick={() => setConfirmUnlink(true)}
            >
              Remove Citizen iD link
            </button>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-slate-400">
                This un-verifies you on Dumper&apos;s Repo, frees the handle, and you lose Friends /
                Bazaar / order gates until you Link again.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="site-btn-secondary text-sm px-3 py-2"
                  disabled={busy}
                  onClick={() => setConfirmUnlink(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="site-btn-danger text-sm px-3 py-2"
                  disabled={busy || hasActiveOrders}
                  onClick={() => void handleUnlink()}
                >
                  {busy ? 'Removing…' : 'Confirm remove'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          className="site-btn-primary text-sm px-3 py-2"
          disabled={busy}
          onClick={() => void handleLink()}
        >
          {busy ? 'Opening Citizen iD…' : 'Link Citizen iD'}
        </button>
      )}

      {isSuperAdmin && (
        <div className="mt-3 pt-3 site-divider">
          <p className="site-hint mb-2">
            Super-admin: start the 90-day legacy grace (new bio verifies stop; existing bio-verified
            members must Link before the end date).
          </p>
          <button
            type="button"
            className="site-btn-secondary text-sm px-3 py-2"
            disabled={busy || Boolean(spectrum?.graceEndsAt)}
            onClick={() => void handleStartGrace()}
          >
            {spectrum?.graceEndsAt
              ? `Grace ends ${new Date(spectrum.graceEndsAt).toLocaleDateString()}`
              : 'Start 90-day Citizen iD grace'}
          </button>
        </div>
      )}
    </SettingsField>
  )
}
