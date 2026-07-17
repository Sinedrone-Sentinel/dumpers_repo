import React from 'react'
import {
  terminalPath,
  terminalPlace,
  type CommodityTradeResult,
  type TradeLocation,
} from '../../lib/shopLookup'

/** Preferred display order for star systems; unknown systems sort after. */
const SYSTEM_ORDER = ['Stanton', 'Pyro', 'Nyx']

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

function LocationRow({ loc }: { loc: TradeLocation }) {
  const { terminal, boxSizes } = loc
  return (
    <li className="rounded-lg border border-slate-700/70 bg-slate-900/50 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100 truncate">{terminalPlace(terminal)}</p>
          <p className="text-[11px] text-slate-500 truncate">{terminalPath(terminal)}</p>
        </div>
        {terminal.isRefinery && (
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide rounded bg-cyan-950/60 text-cyan-300 border border-cyan-500/30 px-1.5 py-0.5">
            Refinery
          </span>
        )}
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

function TradeColumn({
  title,
  hint,
  accent,
  locations,
  emptyLabel,
}: {
  title: string
  hint: string
  accent: 'sell' | 'buy'
  locations: TradeLocation[]
  emptyLabel: string
}) {
  const groups = React.useMemo(() => groupBySystem(locations), [locations])
  const headerClass =
    accent === 'sell'
      ? 'text-emerald-300 border-emerald-500/30 bg-emerald-950/30'
      : 'text-sky-300 border-sky-500/30 bg-sky-950/30'

  return (
    <div className="flex flex-col min-w-0">
      <div className={`rounded-t-xl border px-3 py-2 ${headerClass}`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">{title}</h3>
          <span className="text-xs font-semibold tabular-nums">{locations.length}</span>
        </div>
        <p className="text-[11px] opacity-80">{hint}</p>
      </div>
      <div className="rounded-b-xl border border-t-0 border-slate-700/70 bg-slate-900/30 p-2 flex-1">
        {groups.length === 0 ? (
          <p className="text-sm text-slate-500 px-2 py-6 text-center">{emptyLabel}</p>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group.system}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 px-1 mb-1">
                  {group.system}
                  <span className="text-slate-600 ml-1">({group.items.length})</span>
                </p>
                <ul className="space-y-1.5">
                  {group.items.map((loc) => (
                    <LocationRow key={loc.terminal.id} loc={loc} />
                  ))}
                </ul>
              </div>
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
}: {
  result: CommodityTradeResult
  /** Which side to render first (contextual emphasis). Defaults to sell. */
  emphasis?: 'sell' | 'buy'
}) {
  const sellCol = (
    <TradeColumn
      key="sell"
      title="Sell to"
      hint="Turn this commodity into aUEC here"
      accent="sell"
      locations={result.sellAt}
      emptyLabel="No known sell locations."
    />
  )
  const buyCol = (
    <TradeColumn
      key="buy"
      title="Buy from"
      hint="Purchase this commodity here"
      accent="buy"
      locations={result.buyAt}
      emptyLabel="No known buy locations."
    />
  )
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-w-0">
      {emphasis === 'buy' ? [buyCol, sellCol] : [sellCol, buyCol]}
    </div>
  )
}
