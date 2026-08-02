import React, { useEffect, useState } from 'react'
import {
  formatChallengeExpiry,
  getMyRsiVerifyChallenge,
  issueRsiVerifyChallenge,
  rsiCitizenProfileUrl,
  validateRsiHandle,
  type RsiChallenge,
} from '../lib/rsiVerify'

type Props = {
  rsiHandle: string
  onRsiHandleChange: (value: string) => void
  isVerified: boolean
  inputDisabled?: boolean
  onVerified: () => void | Promise<void>
  onError?: (message: string) => void
  onSuccessMessage?: (message: string) => void
  /** Tighter layout for WelcomeModal */
  compact?: boolean
}

export default function RsiBioVerifyControls({
  rsiHandle,
  onRsiHandleChange,
  isVerified,
  inputDisabled = false,
  onVerified,
  onError,
  onSuccessMessage,
  compact = false,
}: Props) {
  const [challenge, setChallenge] = useState<RsiChallenge | null>(null)
  const [issuing, setIssuing] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (isVerified) {
      setChallenge(null)
      return
    }
    let cancelled = false
    void getMyRsiVerifyChallenge().then((active) => {
      if (!cancelled && active) setChallenge(active)
    })
    return () => {
      cancelled = true
    }
  }, [isVerified])

  const reportError = (message: string) => {
    setLocalError(message)
    onError?.(message)
  }

  const handleIssueCode = async () => {
    setIssuing(true)
    setLocalError(null)
    const result = await issueRsiVerifyChallenge(rsiHandle)
    setIssuing(false)

    if (!result.ok) {
      reportError(result.error)
      return
    }

    if (result.alreadyVerified) {
      onSuccessMessage?.('RSI Handle already verified.')
      await onVerified()
      return
    }

    setChallenge(result.challenge)
    if (result.challenge.handle !== rsiHandle.trim()) {
      onRsiHandleChange(result.challenge.handle)
    }
  }

  const handleVerify = async () => {
    setVerifying(true)
    setLocalError(null)
    try {
      const result = await validateRsiHandle(rsiHandle)
      if (!result.ok) {
        reportError(result.error)
        return
      }
      onSuccessMessage?.(
        result.alreadyVerified
          ? 'RSI Handle already verified.'
          : 'RSI Handle verified successfully! You can remove the code from your RSI bio.'
      )
      setChallenge(null)
      await onVerified()
    } catch {
      reportError('Network error during validation')
    } finally {
      setVerifying(false)
    }
  }

  const inputClass = compact
    ? `site-input flex-1 px-3 py-2 ${
        isVerified || inputDisabled ? 'opacity-60 cursor-not-allowed' : ''
      }`
    : `site-input flex-1 px-4 py-2.5 text-sm ${
        isVerified || inputDisabled ? 'opacity-60 cursor-not-allowed' : ''
      }`

  const btnClass =
    'site-btn-accent shrink-0 px-4 py-2.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={rsiHandle}
          onChange={(e) => {
            onRsiHandleChange(e.target.value)
            setLocalError(null)
          }}
          placeholder={compact ? 'Your Star Citizen username' : 'Enter your RSI handle...'}
          disabled={isVerified || inputDisabled}
          className={inputClass}
        />
        {!isVerified && (
          <button
            type="button"
            onClick={handleIssueCode}
            disabled={issuing || verifying || !rsiHandle.trim() || inputDisabled}
            className={btnClass}
            title="Get a temporary code to paste into your RSI bio"
          >
            {issuing ? 'Getting…' : challenge ? 'New code' : 'Get code'}
          </button>
        )}
      </div>

      {!isVerified && challenge && (
        <div className="site-banner-info px-3 py-3 space-y-2">
          <p className="text-xs text-slate-300 leading-relaxed">
            Paste this code into your <strong className="text-cyan-300">public RSI Bio</strong> on
            your citizen page, save, then click Verify. Code expires around{' '}
            <strong className="text-white">{formatChallengeExpiry(challenge.expiresAt)}</strong>.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="site-surface px-2.5 py-1.5 border-cyan-500/40 text-cyan-300 font-mono text-sm tracking-wider select-all">
              {challenge.code}
            </code>
            <a
              href={rsiCitizenProfileUrl(challenge.handle)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-cyan-400 hover:text-cyan-300 underline"
            >
              Open RSI profile
            </a>
          </div>
          <button
            type="button"
            onClick={handleVerify}
            disabled={verifying || issuing || inputDisabled}
            className="site-btn-primary w-full sm:w-auto px-4 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {verifying ? 'Checking bio…' : 'Verify'}
          </button>
        </div>
      )}

      {!isVerified && !challenge && (
        <p className={`text-xs text-slate-500 leading-relaxed ${compact ? '' : ''}`}>
          Step 1: enter your handle and click <strong className="text-slate-400">Get code</strong>.
          Step 2: paste the code into your public RSI Bio, save, then verify.
        </p>
      )}

      {localError && !onError && (
        <p className="text-xs text-red-400 flex items-start gap-1">
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {localError}
        </p>
      )}
    </div>
  )
}
