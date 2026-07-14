import { useMemo, useState } from 'react'
import { calculateWikeloTradeDfp, formatDfpValue, formatWikeloDfpLabel } from '../lib/dfp'
import { useDfpEngineReady } from '../hooks/useDfpEngineReady'
import { useOrderDraft } from '../contexts/OrderDraftContext'
import { wikeloRewardResourceKey } from '../config/wikeloItems'
import type { WikeloTrade } from '../routes/wikelo'

const PAPER_PANEL = 'blueprint-paper-panel p-2.5'
const HAND_IN_PANEL = 'relative rounded-lg border border-slate-600/40 bg-slate-950/20 p-2.5'

/** True when the trade awards a crafting blueprint — use blueprint paper. */
function wikeloTradeUsesBlueprintPaper(trade: WikeloTrade): boolean {
  return trade.blueprintPools.length > 0
}

/** Hand-in chips — light glass over panel backgrounds. */
const HAND_IN_CHIP_CLASS =
  'inline-flex items-center max-w-full px-1.5 py-0.5 rounded text-xs border break-words bg-slate-950/35 text-sky-100/90 border-sky-400/30 backdrop-blur-[2px]'

/** True if the reward name looks like ammo (magazines, batteries). */
function isAmmoReward(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.includes('magazine') || lower.includes('battery')
}

/** Reward items listable on WTS/WTB (gear + currency; not blueprints, vehicles, or ammo). */
export function tradableWikeloRewards(trade: WikeloTrade) {
  return trade.rewards
    .filter((r) => r.kind === 'item' && !isAmmoReward(r.name))
    .map((r) => {
      const resourceKey = wikeloRewardResourceKey(r.entityClass)
      return resourceKey ? { resourceKey, label: r.name, quantity: r.amount } : null
    })
    .filter((r): r is { resourceKey: string; label: string; quantity: number } => r != null)
}

/** Shared add-to-cart hook: sends the trade's tradable reward items to the order draft. */
export function useAddWikeloTradeToCart(trade: WikeloTrade) {
  const { addResourceToDraft } = useOrderDraft()
  const [added, setAdded] = useState(false)
  const rewards = useMemo(() => tradableWikeloRewards(trade), [trade])

  const addToCart = () => {
    if (rewards.length === 0) return
    for (const reward of rewards) {
      addResourceToDraft({
        resourceKey: reward.resourceKey,
        resourceLabel: reward.label,
        quantity: reward.quantity,
      })
    }
    setAdded(true)
    setTimeout(() => setAdded(false), 3000)
  }

  return { canAdd: rewards.length > 0, added, addToCart }
}

export const WIKELO_SUBCATEGORY_LABELS: Record<string, string> = {
  ship: 'Ship',
  ground: 'Ground Vehicle',
  armor: 'Armor',
  weapon: 'Weapon',
  gear: 'Gear',
  favor: 'Favor Trade',
  intro: 'Introduction',
  food: 'Food Run',
}

const SUBCATEGORY_CHIP_CLASSES: Record<string, string> = {
  ship: 'bg-sky-950/50 text-sky-300 border-sky-500/40',
  ground: 'bg-teal-950/50 text-teal-300 border-teal-500/40',
  armor: 'bg-blue-950/50 text-blue-300 border-blue-500/40',
  weapon: 'bg-red-950/50 text-red-300 border-red-500/40',
  gear: 'bg-purple-950/50 text-purple-300 border-purple-500/40',
  favor: 'bg-amber-950/50 text-amber-300 border-amber-500/40',
  intro: 'bg-green-950/50 text-green-300 border-green-500/40',
  food: 'bg-pink-950/50 text-pink-300 border-pink-500/40',
}

export function wikeloSubCategoryChipClass(subCategory: string): string {
  return SUBCATEGORY_CHIP_CLASSES[subCategory] ?? SUBCATEGORY_CHIP_CLASSES.gear
}

export function formatWikeloCostAmount(cost: WikeloTrade['costs'][number]): string {
  if (cost.scu != null) return `${cost.scu} SCU`
  return `${cost.amount ?? 1}×`
}

interface WikeloTradeCardProps {
  trade: WikeloTrade
  onClick: (trade: WikeloTrade, e: React.MouseEvent<HTMLDivElement>) => void
  onOpenMission: (trade: WikeloTrade) => void
  dfpDisplayEnabled?: boolean
  canAddToOrder?: boolean
}

export default function WikeloTradeCard({
  trade,
  onClick,
  onOpenMission,
  dfpDisplayEnabled = true,
  canAddToOrder = false,
}: WikeloTradeCardProps) {
  const { canAdd, added, addToCart } = useAddWikeloTradeToCart(trade)
  const dfpEngineReady = useDfpEngineReady()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute when engine loads
  const dfp = useMemo(() => calculateWikeloTradeDfp(trade), [trade, dfpEngineReady])
  const useBlueprintPaper = wikeloTradeUsesBlueprintPaper(trade)

  const dfpLabel = formatWikeloDfpLabel(dfp)
  const dfpTooltip = dfp.isVehicleReward
    ? 'Vehicle rewards are game bound and cannot be priced'
    : dfp.unpricedItems.length > 0
      ? `Hand-in value estimate (excludes: ${dfp.unpricedItems.join(', ')})`
      : `Fair value of everything you hand in: ${formatDfpValue(dfp.total ?? 0)}`

  const standingLabel = trade.minStanding
    ? trade.maxStanding && trade.maxStanding.name !== trade.minStanding.name
      ? `${trade.minStanding.name} – ${trade.maxStanding.name}`
      : trade.minStanding.name
    : null

  const handleMissionClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onOpenMission(trade)
  }

  return (
    <div
      onClick={(e) => onClick(trade, e)}
      className="group relative flex flex-col h-full blueprint-card-fixed bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 hover:border-amber-500/40 rounded-xl p-3 sm:p-4 cursor-pointer hover:shadow-xl transition-colors transition-shadow duration-200 overflow-hidden"
    >
      <div className="relative z-10 flex flex-col flex-1 min-h-0">
        <div className="flex items-start justify-between gap-2 mb-1 shrink-0">
          {dfpDisplayEnabled ? (
            <span
              className="text-xs font-semibold text-amber-400/90 tabular-nums"
              title={dfpTooltip}
            >
              {dfpLabel}
              {!dfp.isVehicleReward && dfp.total !== null && dfp.total > 0 && (
                <span className="text-amber-600/70 font-normal ml-0.5">aUEC</span>
              )}
            </span>
          ) : (
            <span className="shrink-0" />
          )}
          <span
            className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${wikeloSubCategoryChipClass(trade.subCategory)}`}
          >
            {WIKELO_SUBCATEGORY_LABELS[trade.subCategory] ?? trade.subCategory}
          </span>
        </div>

        <div className="mb-3 min-w-0 text-left shrink-0">
          <h3 className="font-bold text-white line-clamp-2 text-sm leading-snug" title={trade.title}>
            {trade.title}
          </h3>
          <p className="text-xs text-slate-400 leading-snug mt-0.5 truncate">
            {trade.rewards.length > 0
              ? trade.rewards.map((r) => (r.amount > 1 ? `${r.amount}× ${r.name}` : r.name)).join(', ')
              : 'Wikelo reputation'}
          </p>
        </div>

        <div className="flex-1 min-h-0 flex flex-col text-sm">
          <div className={`flex-1 flex flex-col min-h-0 ${useBlueprintPaper ? PAPER_PANEL : HAND_IN_PANEL}`}>
            <p className="text-[10px] uppercase tracking-wide text-sky-200/70 mb-1.5">
              Hand in
            </p>
            <div className="flex flex-wrap gap-1">
              {trade.costs.slice(0, 6).map((cost, idx) => (
                <span
                  key={idx}
                  className={HAND_IN_CHIP_CLASS}
                >
                  <span className="text-amber-300/90 mr-1 tabular-nums">{formatWikeloCostAmount(cost)}</span>
                  {cost.name}
                </span>
              ))}
              {trade.costs.length > 6 && (
                <span className="text-sky-200/70 text-xs">+{trade.costs.length - 6} more</span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-auto pt-2.5 border-t border-slate-700 shrink-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1.5 min-h-[1rem]">
            {trade.repReward > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-cyan-950/50 text-cyan-300 border border-cyan-500/40 rounded">
                +{trade.repReward} rep
              </span>
            )}
            {standingLabel && (
              <span className="text-[10px] px-1.5 py-0.5 bg-fuchsia-950/50 text-fuchsia-300 border border-fuchsia-500/40 rounded" title="Wikelo reputation rank required">
                {standingLabel}
              </span>
            )}
            {trade.requiresIntro && (
              <span className="text-[10px] px-1.5 py-0.5 bg-slate-800/70 text-slate-300 border border-slate-500/40 rounded" title="Complete “Wikelo Arrive to System” first">
                Intro required
              </span>
            )}
            {trade.blueprintPools.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-orange-950/50 text-orange-300 border border-orange-500/40 rounded" title="This trade also awards a crafting blueprint">
                ★ Blueprint
              </span>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 min-h-[1.375rem]">
            <span className="text-xs text-slate-500">
              {trade.isVehicleReward ? '🚀 Game-bound reward' : '🤝 Barter trade'}
            </span>
            <div className="flex items-center gap-1">
              {canAddToOrder && canAdd && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    addToCart()
                  }}
                  className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded transition-colors ${
                    added
                      ? 'bg-green-600/30 text-green-300'
                      : 'bg-slate-700/50 text-slate-400 hover:bg-red-600/20 hover:text-red-300'
                  }`}
                  title="Add this trade's reward items to your listing cart"
                >
                  {added ? '✓ Added' : '🛒 Cart'}
                </button>
              )}
              <button
                onClick={handleMissionClick}
                className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded transition-colors bg-slate-700/50 text-slate-400 hover:bg-sky-600/20 hover:text-sky-300"
                title="View this trade in the Mission Tracker"
              >
                Mission
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
