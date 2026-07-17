import React from 'react'
import { useSearch } from '@tanstack/react-router'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import CommodityTradePanels from '../components/shop/CommodityTradePanels'
import {
  SHOP_COMMODITIES,
  SHOP_INDEX_META,
  getCommodityKinds,
  getCommodityTradeInfo,
  findCommodityByName,
  type ShopCommodity,
} from '../lib/shopLookup'

function UexAttribution() {
  return (
    <a
      href={SHOP_INDEX_META.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sky-400 hover:text-sky-300 underline decoration-dotted underline-offset-2"
    >
      Powered by UEX
    </a>
  )
}

function CommodityFlags({ commodity }: { commodity: ShopCommodity }) {
  const flags: { label: string; className: string }[] = []
  if (commodity.isRefined)
    flags.push({ label: 'Refined', className: 'bg-emerald-950/50 text-emerald-300 border-emerald-500/30' })
  if (commodity.isRaw)
    flags.push({ label: 'Raw', className: 'bg-amber-950/50 text-amber-300 border-amber-500/30' })
  if (commodity.isMineral)
    flags.push({ label: 'Mineral', className: 'bg-orange-950/50 text-orange-300 border-orange-500/30' })
  if (commodity.isIllegal)
    flags.push({ label: 'Illegal', className: 'bg-red-950/50 text-red-300 border-red-500/30' })
  if (flags.length === 0) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {flags.map((f) => (
        <span
          key={f.label}
          className={`text-[10px] font-medium uppercase tracking-wide rounded border px-1.5 py-0.5 ${f.className}`}
        >
          {f.label}
        </span>
      ))}
    </div>
  )
}

export default function CommodityLookupRoute() {
  const search = useSearch({ strict: false }) as { commodity?: string }

  const [searchTerm, setSearchTerm] = React.useState('')
  const [selectedKind, setSelectedKind] = React.useState<string | null>(null)
  const [selectedId, setSelectedId] = React.useState<number | null>(null)

  const kinds = React.useMemo(() => getCommodityKinds(), [])

  // Deep link: ?commodity=Laranite selects that commodity on load.
  React.useEffect(() => {
    if (!search.commodity) return
    const match = findCommodityByName(search.commodity)
    if (match) {
      setSelectedId(match.id)
      setSearchTerm('')
      setSelectedKind(null)
    }
  }, [search.commodity])

  const filtered = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return SHOP_COMMODITIES.filter((c) => {
      if (selectedKind && c.kind !== selectedKind) return false
      if (!term) return true
      return c.name.toLowerCase().includes(term) || (c.code ?? '').toLowerCase().includes(term)
    })
  }, [searchTerm, selectedKind])

  const selected = React.useMemo(
    () => (selectedId != null ? getCommodityTradeInfo(selectedId) : null),
    [selectedId]
  )

  return (
    <FeaturePageLayout
      title="Commodity Lookup"
      subtitle="Where to buy & sell every commodity, with UEX per-SCU prices and SCU box sizes"
      badge="UEX"
      meta={
        <>
          <span>{SHOP_INDEX_META.commodityCount} commodities</span>
          <span className="mx-2">•</span>
          <span>{SHOP_INDEX_META.terminalCount} terminals</span>
          <span className="mx-2">•</span>
          <span className="text-slate-400">Updated {SHOP_INDEX_META.generatedAt}</span>
          <span className="mx-2">•</span>
          <UexAttribution />
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-4 min-w-0">
        {/* Commodity list */}
        <div className="min-w-0 flex flex-col gap-3">
          <input
            type="text"
            placeholder="Search commodities..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="site-input w-full px-3 py-1.5 text-sm"
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedKind(null)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-all site-btn-shimmer ${
                selectedKind === null
                  ? 'site-btn-accent'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600'
              }`}
            >
              All
            </button>
            {kinds.map((kind) => (
              <button
                key={kind}
                onClick={() => setSelectedKind(selectedKind === kind ? null : kind)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-all site-btn-shimmer ${
                  selectedKind === kind
                    ? 'site-btn-accent'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600'
                }`}
              >
                {kind}
              </button>
            ))}
          </div>
          <div className="text-xs text-slate-500">{filtered.length} shown</div>
          <div className="rounded-xl border border-slate-700/70 bg-slate-900/30 overflow-hidden">
            <ul className="max-h-[60vh] overflow-y-auto overscroll-contain divide-y divide-slate-800/70">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                      selectedId === c.id
                        ? 'bg-orange-600/20 text-orange-100'
                        : 'text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="truncate text-sm">{c.name}</span>
                    {c.kind && <span className="shrink-0 text-[10px] text-slate-500">{c.kind}</span>}
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-slate-500">No commodities match.</li>
              )}
            </ul>
          </div>
        </div>

        {/* Detail */}
        <div className="min-w-0">
          {selected ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-xl font-bold text-white">{selected.commodity.name}</h2>
                  <CommodityFlags commodity={selected.commodity} />
                </div>
                <div className="text-xs text-slate-500">
                  Sell at <span className="text-emerald-400 font-semibold">{selected.sellAt.length}</span>
                  <span className="mx-1.5">•</span>
                  Buy at <span className="text-sky-400 font-semibold">{selected.buyAt.length}</span>
                </div>
              </div>
              <CommodityTradePanels result={selected} />
            </div>
          ) : (
            <div className="h-full min-h-[16rem] flex flex-col items-center justify-center text-center rounded-2xl border-2 border-dashed border-slate-700 bg-slate-900/30 p-8">
              <div className="text-5xl mb-3">🛰️</div>
              <p className="text-slate-300 font-medium">Select a commodity</p>
              <p className="text-slate-500 text-sm mt-1 max-w-sm">
                Pick a commodity to see every terminal where you can sell it (turn ore into aUEC) or
                buy it, with UEX per-SCU prices and SCU box sizes offered.
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-slate-500">
        Locations, per-SCU prices, and box sizes crowdsourced by <UexAttribution />. In-game prices
        can differ from UEX averages.
      </p>
    </FeaturePageLayout>
  )
}
