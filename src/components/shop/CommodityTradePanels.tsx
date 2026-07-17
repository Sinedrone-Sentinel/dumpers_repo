import React from 'react'
import {
  terminalPath,
  terminalPlace,
  formatShopPricePerScu,
  type CommodityTradeResult,
  type TradeLocation,
} from '../../lib/shopLookup'

/** Preferred display order for star systems; unknown systems sort after. */
export const SHOP_SYSTEMS = ['Stanton', 'Pyro', 'Nyx'] as const

const SYSTEM_ORDER = [...SHOP_SYSTEMS]

/** Systems that have at least one sell or buy location for this commodity. */
export function getSystemFilterOptions(result: CommodityTradeResult) {
  const counts = new Map<string, number>()
  for (const loc of [...result.sellAt, ...result.buyAt]) {
    const system = loc.terminal.system ?? 'Other'
    counts.set(system, (counts.get(system) ?? 0) + 1)
  }
  return SYSTEM_ORDER.filter((system) => counts.has(system)).map((system) => ({
    system,
    count: counts.get(system) ?? 0,
  }))
}

function groupBySystem(locations: TradeLocation[]): { system: string; items: TradeLocation[] }[] {
  const groups = new Map<string, TradeLocation[]>()
  for (const loc of locations) {
    const system = loc.terminal.system ?? 'Other'
    const arr = groups.get(system)
    if (arr) arr.push(loc)
    else groups.set(system, [loc])
  }
  return [...groups.entries()]
    .sort((a, b) => {
      const ai = SYSTEM_ORDER.indexOf(a[0])
      const bi = SYSTEM_ORDER.indexOf(b[0])
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      return a[0].localeCompare(b[0])
    })
    .map(([system, items]) => ({ system, items }))
}

function LocationRow({
  loc,
  pricePerScu,
  priceClassName,
}: {
  loc: TradeLocation
  pricePerScu: number | null
  priceClassName: string
}) {
  const { terminal, boxSizes } = loc
  const priceLabel = formatShopPricePerScu(pricePerScu)
  return (
    <li className="rounded-lg border border-slate-700/70 bg-slate-900/50 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100 truncate">{terminalPlace(terminal)}</p>
          <p className="text-[11px] text-slate-500 truncate">{terminalPath(terminal)}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {priceLabel && (
            <span className={`text-xs font-mono font-semibold tabular-nums ${priceClassName}`}>
              {priceLabel}
            </span>
          )}
          {terminal.isRefinery && (
            <span className="text-[10px] font-medium uppercase tracking-wide rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.5">
              Refinery
            </span>
          )}
        </div>
      </div>
      {boxSizes.length > 0 && (
        <div className="mt-1.5 flex items-center gap-1 flex-wrap">
          <span className="text-[10px] text-slate-500 uppercase tracking-wide mr-0.5">Box</span>
          {boxSizes.map((n) => (
            <span
              key={n}
              className="text-[10px] font-mono rounded bg-slate-800 text-slate-300 border border-slate-700 px-1 py-0.5"
            >
              {n}
            </span>
          ))}
          <span className="text-[10px] text-slate-500">SCU</span>
        </div>
      )}
    </li>
  )
}

function SystemGroup({
  system,
  items,
  forceExpanded,
  priceField,
  priceClassName,
}: {
  system: string
  items: TradeLocation[]
  /** When filtering to this system, expand automatically. */
  forceExpanded: boolean
  priceField: 'sellPricePerScu' | 'buyPricePerScu'
  priceClassName: string
}) {
  const [expanded, setExpanded] = React.useState(forceExpanded)

  React.useEffect(() => {
    setExpanded(forceExpanded)
  }, [forceExpanded])

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between gap-2 px-1 py-1 rounded-md hover:bg-slate-800/50 text-left group"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {system}
          <span className="text-slate-600 ml-1">({items.length})</span>
        </span>
        <span
          className={`shrink-0 text-slate-500 group-hover:text-slate-300 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
          aria-hidden
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>
      {expanded && (
        <ul className="space-y-1.5 mt-1">
          {items.map((loc) => (
            <LocationRow
              key={loc.terminal.id}
              loc={loc}
              pricePerScu={loc[priceField]}
              priceClassName={priceClassName}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

export function ShopSystemFilter({
  result,
  value,
  onChange,
}: {
  result: CommodityTradeResult
  value: string | null
  onChange: (system: string | null) => void
}) {
  const options = React.useMemo(() => getSystemFilterOptions(result), [result])
  if (options.length <= 1) return null

  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all site-btn-shimmer ${
          value === null
            ? 'site-btn-accent'
            : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600'
        }`}
      >
        All systems
      </button>
      {options.map(({ system, count }) => (
        <button
          key={system}
          type="button"
          onClick={() => onChange(value === system ? null : system)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all site-btn-shimmer ${
            value === system
              ? 'site-btn-accent'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-600'
          }`}
        >
          {system}
          <span className="text-[10px] ml-1 opacity-70">({count})</span>
        </button>
      ))}
    </div>
  )
}

function TradeColumn({
  title,
  hint,
  accent,
  locations,
  emptyLabel,
  systemFilter,
}: {
  title: string
  hint: string
  accent: 'sell' | 'buy'
  locations: TradeLocation[]
  emptyLabel: string
  systemFilter: string | null
}) {
  const filteredLocations = React.useMemo(
    () =>
      systemFilter
        ? locations.filter((loc) => (loc.terminal.system ?? 'Other') === systemFilter)
        : locations,
    [locations, systemFilter]
  )
  const groups = React.useMemo(() => groupBySystem(filteredLocations), [filteredLocations])
  const headerClass =
    accent === 'sell'
      ? 'text-emerald-300 border-emerald-500/30 bg-emerald-950/30'
      : 'text-sky-300 border-sky-500/30 bg-sky-950/30'
  const priceField = accent === 'sell' ? 'sellPricePerScu' : 'buyPricePerScu'
  const priceClassName = accent === 'sell' ? 'text-emerald-300' : 'text-sky-300'

  return (
    <div className="flex flex-col min-w-0">
      <div className={`rounded-t-xl border px-3 py-2 ${headerClass}`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">{title}</h3>
          <span className="text-xs font-semibold tabular-nums">{filteredLocations.length}</span>
        </div>
        <p className="text-[11px] opacity-80">{hint}</p>
      </div>
      <div className="rounded-b-xl border border-t-0 border-slate-700/70 bg-slate-900/30 p-2 flex-1">
        {groups.length === 0 ? (
          <p className="text-sm text-slate-500 px-2 py-6 text-center">{emptyLabel}</p>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <SystemGroup
                key={group.system}
                system={group.system}
                items={group.items}
                forceExpanded={systemFilter === group.system}
                priceField={priceField}
                priceClassName={priceClassName}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CommodityTradePanels({
  result,
  emphasis = 'sell',
  systemFilter = null,
}: {
  result: CommodityTradeResult
  /** Which side to render first (contextual emphasis). Defaults to sell. */
  emphasis?: 'sell' | 'buy'
  /** Limit locations to one star system (null = all). */
  systemFilter?: string | null
}) {
  const sellCol = (
    <TradeColumn
      key="sell"
      title="Sell to"
      hint="Turn this commodity into aUEC here (UEX avg price per SCU)"
      accent="sell"
      locations={result.sellAt}
      emptyLabel={systemFilter ? `No sell locations in ${systemFilter}.` : 'No known sell locations.'}
      systemFilter={systemFilter}
    />
  )
  const buyCol = (
    <TradeColumn
      key="buy"
      title="Buy from"
      hint="Purchase this commodity here (UEX avg price per SCU)"
      accent="buy"
      locations={result.buyAt}
      emptyLabel={systemFilter ? `No buy locations in ${systemFilter}.` : 'No known buy locations.'}
      systemFilter={systemFilter}
    />
  )
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-0">
      {emphasis === 'buy' ? [buyCol, sellCol] : [sellCol, buyCol]}
    </div>
  )
}
