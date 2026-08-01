import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useClickOutside } from '../../hooks/useClickOutside'
import { useAuth } from '../../contexts/AuthContext'
import AppModal from './AppModal'
import {
  listRequestableServiceTypes,
  requestService,
  type RequestableServiceType,
} from '../../lib/partnership'

interface RequestServicesControlProps {
  disabled?: boolean
}

const MAX_DETAILS = 250

export default function RequestServicesControl({ disabled = false }: RequestServicesControlProps) {
  const { profile, isApproved } = useAuth()
  const verified = Boolean(profile?.rsi_handle_verified)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [services, setServices] = useState<RequestableServiceType[]>([])
  const [compose, setCompose] = useState<RequestableServiceType | null>(null)
  const [details, setDetails] = useState('')
  const [screenshot, setScreenshot] = useState<{ blob: Blob; previewUrl: string; mime: string } | null>(
    null
  )
  const [submitting, setSubmitting] = useState(false)
  const [deliveredModal, setDeliveredModal] = useState<{
    title: string
    detail: string
    kind: 'actionable' | 'informative'
  } | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pasteBoxRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])
  useClickOutside(containerRef, open && !disabled && !compose, close)

  const clearScreenshot = useCallback(() => {
    setScreenshot((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
  }, [])

  const resetCompose = useCallback(() => {
    setCompose(null)
    setDetails('')
    setFormError(null)
    clearScreenshot()
  }, [clearScreenshot])

  useEffect(() => {
    if (!open || disabled || !verified || !isApproved) return
    let cancelled = false
    setLoading(true)
    void listRequestableServiceTypes().then((rows) => {
      if (!cancelled) {
        setServices(rows)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [open, disabled, verified, isApproved])

  const takeImageBlob = (blob: Blob) => {
    if (!blob.type.startsWith('image/')) {
      setFormError('Paste or choose an image (PNG, JPEG, or WebP).')
      return
    }
    const mime =
      blob.type === 'image/jpeg' || blob.type === 'image/webp' || blob.type === 'image/png'
        ? blob.type
        : 'image/png'
    clearScreenshot()
    setScreenshot({ blob, previewUrl: URL.createObjectURL(blob), mime })
    setFormError(null)
  }

  useEffect(() => {
    if (!compose || compose.service_kind !== 'informative') return
    const el = pasteBoxRef.current
    if (!el) return

    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault()
          const file = item.getAsFile()
          if (file) takeImageBlob(file)
          break
        }
      }
    }
    el.addEventListener('paste', onPaste)
    return () => el.removeEventListener('paste', onPaste)
  }, [compose])

  if (!isApproved || !verified) return null

  const onSubmitCompose = async () => {
    if (!compose) return
    setSubmitting(true)
    setFormError(null)
    const result = await requestService({
      serviceTypeId: compose.id,
      details,
      screenshotFile: compose.service_kind === 'informative' ? screenshot?.blob : null,
      screenshotMime: screenshot?.mime,
    })
    setSubmitting(false)
    if (!result.success) {
      const cooldown =
        result.cooldown_seconds && result.cooldown_seconds > 0
          ? ` (${Math.ceil(result.cooldown_seconds / 60)} min cooldown left)`
          : ''
      setFormError((result.error || 'Request failed') + cooldown)
      return
    }
    const orgNames = (result.notified_orgs || []).map((o) => o.org_name).join(', ')
    const posted = result.posted_count ?? 0
    const kind = result.service_kind || compose.service_kind
    resetCompose()
    setOpen(false)
    if (posted === 0) {
      setDeliveredModal({
        kind,
        title: `${result.service_label || compose.label} — Discord post failed`,
        detail:
          (result.dispatch_errors || []).join(' · ') ||
          'Partners may need the Dumper Services bot (Attach Files) in their channel.',
      })
      return
    }
    setDeliveredModal({
      kind,
      title:
        kind === 'informative'
          ? 'Your tip has been delivered'
          : 'Your service request has been sent',
      detail:
        kind === 'informative'
          ? `Sent to ${posted} partner channel${posted === 1 ? '' : 's'}${
              orgNames ? ` (${orgNames})` : ''
            }. Tip data is not kept on the site after delivery.`
          : `Notified ${posted} partner channel${posted === 1 ? '' : 's'}${
              orgNames ? `: ${orgNames}` : ''
            }. First Accept wins within 30 minutes — you’ll get a modal with their org and listed pricing.`,
    })
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((v) => !v)
        }}
        className={`relative p-2 rounded-lg transition-colors ${
          open
            ? 'bg-orange-600/30 text-orange-200'
            : 'text-slate-400 hover:text-orange-300 hover:bg-slate-800/80'
        } disabled:opacity-40`}
        aria-label="Request partner services"
        title="Request Services"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.75}
            d="M18.364 5.636A9 9 0 105.636 18.364M15 9l-6 6m0-6l6 6"
          />
          <circle cx="12" cy="12" r="3" strokeWidth={1.75} />
        </svg>
      </button>

      {open && !compose && (
        <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 rounded-xl border border-slate-700 bg-slate-900 shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-slate-800">
            <p className="text-sm font-medium text-white">Request Services</p>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
              Only services offered by at least one partner. 30 min lifetime · 31 min cooldown.
            </p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <p className="px-3 py-4 text-xs text-slate-500">Loading services…</p>
            ) : services.length === 0 ? (
              <p className="px-3 py-4 text-sm text-slate-300 leading-relaxed text-center">
                Sorry, No Services are being offered at this time.
              </p>
            ) : (
              <ul>
                {services.map((s) => (
                  <li key={s.id} className="border-t border-slate-800 first:border-t-0">
                    <button
                      type="button"
                      onClick={() => {
                        setCompose(s)
                        setDetails('')
                        setFormError(null)
                        clearScreenshot()
                      }}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-800/80 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-slate-100 font-medium">{s.label}</span>
                        <span className="text-[10px] text-slate-500 tabular-nums">
                          {s.service_kind === 'informative' ? 'tip' : 'accept'} · {s.partner_count}
                        </span>
                      </div>
                      {s.description ? (
                        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                          {s.description}
                        </p>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {compose && (
        <AppModal
          title={compose.label}
          subtitle={
            compose.service_kind === 'informative'
              ? 'Intel tip · no Accept · screenshot required'
              : 'Partner Accept · 30 minute window'
          }
          onClose={resetCompose}
          size="md"
          zIndex={80}
          footer={
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={resetCompose}
                className="px-3 py-2 text-sm text-slate-300 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void onSubmitCompose()}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send'}
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-sm">
            <label className="block space-y-1">
              <span className="text-xs text-slate-400">
                Details ({details.length}/{MAX_DETAILS})
              </span>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value.slice(0, MAX_DETAILS))}
                rows={4}
                placeholder={compose.details_hint || 'Describe your situation…'}
                className="site-input w-full px-3 py-2 text-sm"
              />
            </label>

            {compose.service_kind === 'informative' && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">
                  Starmap screenshot with <code className="text-slate-300">r_DisplayInfo 3</code>{' '}
                  visible — click the box and press Ctrl+V, or choose a file.
                </p>
                <div
                  ref={pasteBoxRef}
                  tabIndex={0}
                  className="rounded-xl border border-dashed border-slate-600 bg-slate-950/50 min-h-[120px] p-3 outline-none focus:border-cyan-500/50"
                  onClick={() => pasteBoxRef.current?.focus()}
                >
                  {screenshot ? (
                    <img
                      src={screenshot.previewUrl}
                      alt="Screenshot preview"
                      className="max-h-48 mx-auto rounded-lg"
                    />
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-8">
                      Ctrl+V to paste image here
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer">
                    Choose file
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) takeImageBlob(f)
                      }}
                    />
                  </label>
                  {screenshot ? (
                    <button
                      type="button"
                      onClick={clearScreenshot}
                      className="text-xs text-slate-500 hover:text-slate-300"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            {formError ? <p className="text-xs text-red-300">{formError}</p> : null}
          </div>
        </AppModal>
      )}

      {deliveredModal && (
        <AppModal
          title={deliveredModal.title}
          onClose={() => setDeliveredModal(null)}
          size="sm"
          zIndex={80}
          footer={
            <button
              type="button"
              onClick={() => setDeliveredModal(null)}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg"
            >
              Close
            </button>
          }
        >
          <p className="text-sm text-slate-300 leading-relaxed">{deliveredModal.detail}</p>
        </AppModal>
      )}
    </div>
  )
}
