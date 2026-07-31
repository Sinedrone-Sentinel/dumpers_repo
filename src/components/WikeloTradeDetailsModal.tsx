import { useMemo } from 'react'
import AppModal from './layout/AppModal'
import { calculateWikeloTradeDfp, formatDfpAuec, formatWikeloDfpLabel } from '../lib/dfp'
import { useDfpEngineReady } from '../hooks/useDfpEngineReady'
import type { WikeloTrade } from '../routes/wikelo'
import {
  WIKELO_SUBCATEGORY_LABELS,
  formatWikeloCostAmount,
  useAddWikeloTradeToCart,
  wikeloSubCategoryChipClass,
} from './WikeloTradeCard'
import NotForReleaseTag from './NotForReleaseTag'

interface WikeloTradeDetailsModalProps {
  trade: WikeloTrade
  onClose: () => void
  onOpenMission: (trade: WikeloTrade) => void
  dfpDisplayEnabled?: boolean
  canAddToOrder?: boolean
}

export default function WikeloTradeDetailsModal({
  trade,
  onClose,
  onOpenMission,
  dfpDisplayEnabled = true,
  canAddToOrder = false,
}: WikeloTradeDetailsModalProps) {
  const { canAdd, added, addToCart } = useAddWikeloTradeToCart(trade)
  const dfpEngineReady = useDfpEngineReady()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute when engine loads
  const dfp = useMemo(() => calculateWikeloTradeDfp(trade), [trade, dfpEngineReady])

  const dfpLineByName = useMemo(() => {
    const map = new Map<string, number>()
    for (const line of dfp.lines) map.set(line.name, line.lineTotal)
    return map
  }, [dfp])

  const standingLabel = trade.minStanding
    ? trade.maxStanding && trade.maxStanding.name !== trade.minStanding.name
      ? `${trade.minStanding.name} – ${trade.maxStanding.name}`
      : trade.minStanding.name
    : null

  return (
    <AppModal
      title={trade.title}
      subtitle={WIKELO_SUBCATEGORY_LABELS[trade.subCategory] ?? trade.subCategory}
      onClose={onClose}
      size="md"
      headerExtra={
        <span className="inline-flex items-center gap-1.5">
          {trade.notForRelease ? <NotForReleaseTag /> : null}
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded border ${wikeloSubCategoryChipClass(trade.subCategory)}`}
          >
            {WIKELO_SUBCATEGORY_LABELS[trade.subCategory] ?? trade.subCategory}
          </span>
        </span>
      }
      footer={
        <div className="flex items-center justify-between gap-3 w-full">
          {dfpDisplayEnabled ? (
            <span className="text-sm font-semibold text-amber-400/90" title="Fair value of everything you hand in">
              {formatWikeloDfpLabel(dfp)}
            </span>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {canAddToOrder && canAdd && (
              <button
                onClick={addToCart}
                className={`px-3 py-1.5 text-sm font-medium border rounded-lg transition-colors ${
                  added
                    ? 'bg-green-600/20 text-green-300 border-green-500/40'
                    : 'bg-red-600/20 text-red-300 border-red-500/40 hover:bg-red-600/30'
                }`}
                title="Add this trade's reward items to your listing cart"
              >
                {added ? '✓ Added to cart' : '🛒 Add to cart'}
              </button>
            )}
            <button
              onClick={() => onOpenMission(trade)}
              className="px-3 py-1.5 text-sm font-medium bg-sky-600/20 text-sky-300 border border-sky-500/40 rounded-lg hover:bg-sky-600/30 transition-colors"
            >
              View in Mission Tracker
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {trade.description && (
          <p className="text-sm text-slate-300 whitespace-pre-line leading-relaxed border-l-2 border-amber-500/40 pl-3 italic">
            {trade.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          {trade.repReward > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-cyan-950/50 text-cyan-300 border border-cyan-500/40 rounded">
              +{trade.repReward} Wikelo rep
            </span>
          )}
          {standingLabel && (
            <span className="text-[10px] px-1.5 py-0.5 bg-fuchsia-950/50 text-fuchsia-300 border border-fuchsia-500/40 rounded">
              Requires rank: {standingLabel}
            </span>
          )}
          {trade.requiresIntro && (
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-800/70 text-slate-300 border border-slate-500/40 rounded">
              Complete “Wikelo Arrive to System” first
            </span>
          )}
        </div>

        <section>
          <h4 className="text-xs uppercase tracking-wide text-slate-400 mb-2">Hand in</h4>
          <ul className="space-y-1">
            {trade.costs.map((cost, idx) => (
              <li
                key={idx}
                className="flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/60 text-sm"
              >
                <span className="min-w-0 text-slate-200">
                  <span className="text-amber-300/90 tabular-nums mr-1.5">{formatWikeloCostAmount(cost)}</span>
                  {cost.name}
                </span>
                {dfpDisplayEnabled && !dfp.isVehicleReward && (
                  <span className="shrink-0 text-xs text-amber-400/70 tabular-nums">
                    {dfpLineByName.has(cost.name) ? formatDfpAuec(dfpLineByName.get(cost.name)!) : '—'}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {dfpDisplayEnabled && dfp.unpricedItems.length > 0 && (
            <p className="text-[11px] text-slate-500 mt-1.5">
              Items without a DFP base yet are excluded from the total.
            </p>
          )}
        </section>

        <section>
          <h4 className="text-xs uppercase tracking-wide text-slate-400 mb-2">You receive</h4>
          <ul className="space-y-1">
            {trade.rewards.map((reward, idx) => (
              <li
                key={idx}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-emerald-950/25 border border-emerald-500/25 text-sm text-emerald-100"
              >
                <span className="text-emerald-300/90 tabular-nums">{reward.amount}×</span>
                <span className="min-w-0">{reward.name}</span>
                {reward.kind === 'vehicle' && (
                  <span className="ml-auto shrink-0 text-[10px] px-1.5 py-0.5 bg-sky-950/50 text-sky-300 border border-sky-500/40 rounded">
                    Vehicle · game bound
                  </span>
                )}
              </li>
            ))}
            {trade.blueprintPools.length > 0 && (
              <li className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-orange-950/25 border border-orange-500/25 text-sm text-orange-200">
                <span>★</span>
                <span>Crafting blueprint reward</span>
              </li>
            )}
            {trade.rewards.length === 0 && trade.blueprintPools.length === 0 && (
              <li className="px-2.5 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/60 text-sm text-slate-400">
                Wikelo reputation only
              </li>
            )}
          </ul>
        </section>
      </div>
    </AppModal>
  )
}
