import React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { blueprintDataVersion } from './blueprints'
import { useWikeloTrades, WIKELO_FACTION_NAME, type WikeloTrade } from './wikelo'
import WikeloTradeCard from '../components/WikeloTradeCard'
import WikeloTradeDetailsModal from '../components/WikeloTradeDetailsModal'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import { useAuth } from '../contexts/AuthContext'
import { findBrowseMissionEntry } from '../lib/blueprintMissionRewards'
import { makeBrowseMissionKey, writeMissionTrackerUiState } from '../lib/missionTrackerUiState'

/** Filter tag order on the page (id = trade subCategory). */
const CATEGORY_FILTERS: { id: string; label: string }[] = [
  { id: 'ship', label: 'Ships' },
  { id: 'ground', label: 'Ground Vehicles' },
  { id: 'armor', label: 'Armor' },
  { id: 'weapon', label: 'Weapons' },
  { id: 'gear', label: 'Gear' },
  { id: 'favor', label: 'Favors' },
  { id: 'intro', label: 'Intro' },
  { id: 'food', label: 'Food' },
]

export default function WikeloRoute() {
  const navigate = useNavigate()
  const { dfpDisplayEnabled, isApproved, isGuestPreview } = useAuth()
  const canAddToOrder = isApproved && !isGuestPreview

  const [searchTerm, setSearchTerm] = React.useState('')
  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null)
  const [selectedTrade, setSelectedTrade] = React.useState<WikeloTrade | null>(null)

  const { data: trades = [] } = useWikeloTrades()

  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = {}
    for (const trade of trades) {
      counts[trade.subCategory] = (counts[trade.subCategory] ?? 0) + 1
    }
    return counts
  }, [trades])

  const filteredTrades = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return trades.filter((trade) => {
      if (selectedCategory && trade.subCategory !== selectedCategory) return false
      if (!term) return true
      if (trade.title.toLowerCase().includes(term)) return true
      if (trade.costs.some((c) => c.name.toLowerCase().includes(term))) return true
      if (trade.rewards.some((r) => r.name.toLowerCase().includes(term))) return true
      return false
    })
  }, [trades, searchTerm, selectedCategory])

  const handleOpenMission = React.useCallback(
    (trade: WikeloTrade) => {
      // Trades that award blueprints exist in the browse catalog — jump straight
      // to the mission; everything else lands on the Wikelo Emporium faction.
      const entry = findBrowseMissionEntry(trade.title, { faction: WIKELO_FACTION_NAME })
      writeMissionTrackerUiState({
        topView: 'browse',
        browse: {
          selectedFaction: WIKELO_FACTION_NAME,
          selectedMissionKey: entry ? makeBrowseMissionKey(entry) : null,
          searchTerm: '',
        },
      })
      setSelectedTrade(null)
      void navigate({ to: '/targets' })
    },
    [navigate]
  )

  return (
    <FeaturePageLayout
      title="Wikelo"
      subtitle="Wikelo Emporium barter trades — favors, rep, hand-ins & rewards"
      seoIntro="Star Citizen Wikelo Emporium barter guide: look up favors, reputation (rep) requirements, hand-in costs, and rewards for every trade — including ships, ground vehicles, armor, weapons, gear, and favor contracts. Search by trade title, hand-in item, or reward."
      meta={
        <>
          <span>LIVE {blueprintDataVersion}</span>
          <span className="mx-2">•</span>
          <span className="text-amber-400">{trades.length} trades</span>
        </>
      }
    >
      <div className="space-y-3 mb-6 w-full min-w-0">
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          <input
            type="text"
            placeholder="Search trades, hand-in items, or rewards..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="site-input flex-1 min-w-0 basis-full sm:basis-0 sm:min-w-[8rem] px-3 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-1.5 lg:gap-2 items-center">
          {CATEGORY_FILTERS.map(({ id, label }) => {
            const count = categoryCounts[id] ?? 0
            return (
              <button
                key={id}
                onClick={() => setSelectedCategory(selectedCategory === id ? null : id)}
                disabled={count === 0}
                className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all site-btn-shimmer ${
                  selectedCategory === id
                    ? 'site-btn-accent shadow-lg'
                    : count === 0
                      ? 'bg-slate-800/50 text-slate-600 border border-slate-700 cursor-not-allowed'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600'
                }`}
              >
                {label}
                <span className="text-[10px] lg:text-xs ml-1 opacity-70">({count})</span>
              </button>
            )
          })}
        </div>

        <div className="text-slate-500 text-sm">
          Showing {filteredTrades.length} trades
          {(selectedCategory || searchTerm) && <span> (filtered from {trades.length})</span>}
        </div>
      </div>

      <section className="mt-4 w-full min-w-0">
        {filteredTrades.length === 0 ? (
          <div className="text-center py-24 bg-slate-900/30 rounded-3xl border-2 border-dashed border-slate-700">
            <div className="text-6xl mb-4 animate-bounce">🔍</div>
            <p className="text-slate-400 text-xl font-medium mb-4">No trades found</p>
            <button
              onClick={() => {
                setSelectedCategory(null)
                setSearchTerm('')
              }}
              className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors shadow-lg shadow-blue-500/25"
            >
              Clear All Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredTrades.map((trade) => (
              <WikeloTradeCard
                key={trade.id}
                trade={trade}
                onClick={(t) => setSelectedTrade(t)}
                onOpenMission={handleOpenMission}
                dfpDisplayEnabled={dfpDisplayEnabled}
                canAddToOrder={canAddToOrder}
              />
            ))}
          </div>
        )}
      </section>

      {selectedTrade && (
        <WikeloTradeDetailsModal
          trade={selectedTrade}
          onClose={() => setSelectedTrade(null)}
          onOpenMission={handleOpenMission}
          dfpDisplayEnabled={dfpDisplayEnabled}
          canAddToOrder={canAddToOrder}
        />
      )}
    </FeaturePageLayout>
  )
}