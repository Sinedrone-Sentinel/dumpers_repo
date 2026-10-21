import React from 'react'
import { useSearch } from '@tanstack/react-router'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import CommodityTradePanels from '../components/shop/CommodityTradePanels'
import { UexItemActions } from '../components/shop/UexItemActions'
import { SHOP_INDEX_META } from '../lib/shopLookup'
import {
  UEX_CATALOG,
  UEX_GROUPS,
  tradeResultFor,
  type UexCatalogItem,
  type UexGroup,
} from '../lib/uexCatalog'

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

export default function CommodityLookupRoute() {
  const search = useSearch({ strict: false }) as { commodity?: string }

  const [searchTerm, setSearchTerm] = React.useState('')
  const [selectedGroup, setSelectedGroup] = React.useState<UexGroup | null>(null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!search.commodity) return
    const key = search.commodity.trim().toLowerCase()
    const compact = key.replace(/[^a-z0-9]+/g, '')
    const match = UEX_CATALOG.find((item) => item.name.toLowerCase() === key)
      || UEX_CATALOG.find((item) => item.name.toLowerCase().replace(/[^a-z0-9]+/g, '') === compact)
    if (match) {
      setSelectedId(match.id)
      setSearchTerm('')
      setSelectedGroup(null)
    }
  }, [search.commodity])

  const filtered = React.useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return UEX_CATALOG.filter((item) => {
      if (selectedGroup && item.group !== selectedGroup) return false
      if (!term) return true
      return item.name.toLowerCase().includes(term)
    })
  }, [searchTerm, selectedGroup])

  const selected = React.useMemo(
    () => UEX_CATALOG.find((item) => item.id === selectedId) ?? null,
    [selectedId],
  )

  return (
    <FeaturePageLayout
      title="UEX Lookup"
      subtitle="Where to buy guns, ammo, armor, ships, commodities, food, and drinks"
      seoIntro="Star Citizen UEX Lookup — shop locations and prices for guns, ammo, armor, ships, commodities, food, and drinks."
      badge="UEX"
      meta={
        <>
          <span>{UEX_CATALOG.length} items</span>
          <span className="mx-2">•</span>
          <span className="text-slate-400">Updated {SHOP_INDEX_META.generatedAt}</span>
          <span className="mx-2">•</span>
          <UexAttribution />
        </>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-4 min-w-0">
        <div className="min-w-0 flex flex-col gap-3">
          <input
            type="text"
            placeholder="Search shop items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="site-input w-full px-3 py-1.5 text-sm"
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedGroup(null)}
              className={`px-2 py-0.5 rounded text-xs font-medium transition-all site-btn-shimmer ${
                selectedGroup === null ? 'site-btn-accent' : 'site-filter-idle'
              }`}
            >
              All
            </button>
            {UEX_GROUPS.map((group) => (
              <button
                key={group}
                type="button"
                onClick={() => setSelectedGroup(selectedGroup === group ? null : group)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition-all site-btn-shimmer ${
                  selectedGroup === group ? 'site-btn-accent' : 'site-filter-idle'
                }`}
              >
                {group}
              </button>
            ))}
          </div>
          <div className="text-xs text-slate-500">{filtered.length} shown</div>
          <div className="site-surface overflow-hidden">
            <ul className="max-h-[60vh] overflow-y-auto overscroll-contain divide-y divide-slate-800/70">
              {filtered.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors ${
                      selectedId === item.id ? 'bg-orange-600/20 text-orange-100' : 'site-dropdown-item'
                    }`}
                  >
                    <span className="truncate text-sm">{item.name}</span>
                    <span className="shrink-0 text-[10px] text-slate-500">{item.group}</span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-slate-500">No shop items match.</li>
              )}
            </ul>
          </div>
        </div>

        <div className="min-w-0">
          {selected ? (
            <ItemDetail item={selected} />
          ) : (
            <div className="site-empty h-full min-h-[16rem] flex flex-col items-center justify-center text-center p-8">
              <p className="text-slate-300 font-medium">Select an item</p>
              <p className="text-slate-500 text-sm mt-1 max-w-sm">
                Pick a gun, ammo, armor piece, ship, commodity, food, or drink to see every shop that sells it.
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-slate-500">
        Locations and prices crowdsourced by <UexAttribution />. In-game prices can differ from UEX averages.
      </p>
    </FeaturePageLayout>
  )
}

function ItemDetail({ item }: { item: UexCatalogItem }) {
  const result = React.useMemo(() => tradeResultFor(item), [item])
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl font-bold text-white">{item.name}</h2>
          <span className="site-badge-slate">{item.group}</span>
        </div>
        <div className="text-xs text-slate-500">
          {item.sellAt.length > 0 && (
            <>
              Sell at <span className="text-emerald-400 font-semibold">{item.sellAt.length}</span>
              <span className="mx-1.5">•</span>
            </>
          )}
          Buy at <span className="text-sky-400 font-semibold">{item.buyAt.length}</span>
        </div>
      </div>
      <CommodityTradePanels
        result={result}
        emphasis="buy"
        renderBuyActions={(loc) => <UexItemActions item={item} place={loc} />}
      />
    </div>
  )
}
