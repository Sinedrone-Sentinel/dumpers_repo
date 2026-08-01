import React from 'react'
import AppModal from './layout/AppModal'
import type { ServiceRequestAcceptedDetail } from '../lib/serviceRequestAccepted'

interface ServiceRequestAcceptedModalProps {
  detail: ServiceRequestAcceptedDetail
  onClose: () => void
}

/** Shown when a partner org Accepts the member's service request — org + pricing required. */
export default function ServiceRequestAcceptedModal({
  detail,
  onClose,
}: ServiceRequestAcceptedModalProps) {
  return (
    <AppModal
      title="Service request accepted"
      subtitle={`${detail.serviceLabel} · partner response`}
      onClose={onClose}
      size="sm"
      zIndex={80}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg"
        >
          Got it
        </button>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-slate-300 leading-relaxed">
          A partner org accepted your request. Coordinate in Discord / in-game using the details
          below — their listed price is what they committed to for this service.
        </p>
        <dl className="rounded-xl border border-slate-700 bg-slate-950/50 divide-y divide-slate-800">
          <div className="px-4 py-3 flex justify-between gap-3">
            <dt className="text-slate-500 shrink-0">Service</dt>
            <dd className="text-slate-200 text-right font-medium">{detail.serviceLabel}</dd>
          </div>
          <div className="px-4 py-3 flex justify-between gap-3">
            <dt className="text-slate-500 shrink-0">Accepted by</dt>
            <dd className="text-slate-200 text-right font-medium">
              {detail.orgName}
              {detail.orgSid ? (
                <span className="block text-xs text-slate-500 font-normal mt-0.5">
                  ({detail.orgSid})
                </span>
              ) : null}
            </dd>
          </div>
          <div className="px-4 py-3 flex justify-between gap-3">
            <dt className="text-slate-500 shrink-0">Listed pricing</dt>
            <dd className="text-orange-300 text-right font-semibold tabular-nums">
              {detail.pricingLabel}
            </dd>
          </div>
        </dl>
        <p className="text-xs text-slate-500 leading-relaxed">
          Partner orgs must keep services and pricing transparent, honest, and upheld. If what you
          were offered does not match this listing, report it via Support.
        </p>
      </div>
    </AppModal>
  )
}
