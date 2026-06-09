import React, { useState } from 'react'
import AppModal from './layout/AppModal'

export type OrderRatingTarget = 'fulfiller' | 'customer'

interface OrderRatingModalProps {
  target: OrderRatingTarget
  rateeName: string
  orderTitle: string
  onConfirm: (stars: number, comment?: string) => void
  onCancel: () => void
  confirming?: boolean
}

const COPY: Record<
  OrderRatingTarget,
  { title: string; subtitle: string; confirmLabel: string }
> = {
  fulfiller: {
    title: 'Rate your fulfiller',
    subtitle:
      'A star rating is required before this order moves to your archive. Comments are optional.',
    confirmLabel: 'Submit rating & archive',
  },
  customer: {
    title: 'Rate your customer',
    subtitle:
      'A star rating is required before this order moves to your archive. Comments are optional.',
    confirmLabel: 'Submit rating & archive',
  },
}

export default function OrderRatingModal({
  target,
  rateeName,
  orderTitle,
  onConfirm,
  onCancel,
  confirming = false,
}: OrderRatingModalProps) {
  const [stars, setStars] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const copy = COPY[target]
  const active = hovered || stars

  return (
    <AppModal
      title={copy.title}
      onClose={onCancel}
      size="md"
      zIndex={60}
      titleId="order-rating-title"
      footer={
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg text-sm font-medium border border-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(stars, comment.trim() || undefined)}
            disabled={stars < 1 || confirming}
            className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
          >
            {confirming ? 'Archiving...' : copy.confirmLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-white text-sm">{orderTitle}</p>
          <p className="text-slate-400 text-xs mt-1">
            {target === 'fulfiller' ? 'Fulfiller' : 'Customer'}: {rateeName}
          </p>
          <p className="text-slate-300 text-sm mt-3">{copy.subtitle}</p>
        </div>

        <div>
          <p className="text-slate-400 text-xs uppercase tracking-wide mb-2">Star rating</p>
          <div className="flex gap-1" role="group" aria-label="Star rating from 1 to 5">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setStars(value)}
                onMouseEnter={() => setHovered(value)}
                onMouseLeave={() => setHovered(0)}
                className="p-1 rounded transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                aria-label={`${value} star${value === 1 ? '' : 's'}`}
                aria-pressed={stars === value}
              >
                <span
                  className={`text-2xl leading-none ${
                    value <= active ? 'text-amber-400' : 'text-slate-600'
                  }`}
                >
                  ★
                </span>
              </button>
            ))}
          </div>
          {stars > 0 && (
            <p className="text-amber-300/90 text-xs mt-1">
              {stars} of 5 star{stars === 1 ? '' : 's'} selected
            </p>
          )}
        </div>

        <div>
          <label htmlFor="order-rating-comment" className="text-slate-400 text-xs uppercase tracking-wide">
            Comment (optional)
          </label>
          <textarea
            id="order-rating-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="How did it go?"
            className="mt-2 w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
          />
        </div>
      </div>
    </AppModal>
  )
}
