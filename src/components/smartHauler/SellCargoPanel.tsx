import { useMemo, useState } from 'react'
import { navMap, pointById } from '../../lib/navSystems'
import {
  CRATE_SCU,
  applyHaulAvailability,
  findSellBuyer,
  haulDistanceKm,
  haulTravelText,
  uexLookupText,
  type HaulOffer,
} from '../../lib/smartHauler'
import { fetchHaulAvailability } from '../../lib/smartHaulerAvailability'

interface SellRow {
  id: number
  commodity: string
  query: string
  scu: string
  minCrate: number
  maxCrate: number
  /** SCU still on the ship once a buyer search has started. */
  left: number | null
  fromId: string | null
  avoid: string[]
  buyer: { offer: HaulOffer; scu: number } | null
  sold: number
  earned: number
  status: 'edit' | 'found' | 'partial' | 'done' | 'none'
  partial: string
  note: string | null
}

let nextRowId = 1

function blankRow(): SellRow {
  return {
    id: nextRowId++,
    commodity: '',
    query: '',
    scu: '',
    minCrate: 1,
    maxCrate: 32,
    left: null,
    fromId: null,
    avoid: [],
    buyer: null,
    sold: 0,
    earned: 0,
    status: 'edit',
    partial: '',
    note: null,
  }
}

function money(value: number): string {
  return `${Math.round(value).toLocaleString()} aUEC`
}

export default function SellCargoPanel({ startId, sells }: { startId: string; sells: HaulOffer[] }) {
  const [rows, setRows] = useState<SellRow[]>(() => [blankRow()])
  const [busyId, setBusyId] = useState<number | null>(null)
  const commodities = useMemo(() => {
    const byName = new Map<string, number | undefined>()
    for (const offer of sells) if (!byName.has(offer.commodity)) byName.set(offer.commodity, offer.commodityId)
    return [...byName.entries()].map(([name, id]) => ({ name, id })).sort((a, b) => a.name.localeCompare(b.name))
  }, [sells])

  function update(id: number, patch: Partial<SellRow>) {
    setRows((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  async function search(row: SellRow, fromId: string, avoid: string[], left: number, sold: number, earned: number) {
    const commodityId = commodities.find((entry) => entry.name === row.commodity)?.id
    setBusyId(row.id)
    const report = await fetchHaulAvailability(commodityId != null ? [commodityId] : undefined)
    setBusyId(null)
    const live = report ? applyHaulAvailability({ buys: [], sells }, report).sells : sells
    const hit = findSellBuyer({
      commodity: row.commodity,
      fromId,
      scu: left,
      minCrateScu: row.minCrate,
      maxCrateScu: row.maxCrate,
      sells: live,
      avoidPointIds: avoid,
      km: (a, b) => haulDistanceKm(navMap, a, b),
    })
    update(row.id, {
      left,
      fromId,
      avoid,
      sold,
      earned,
      buyer: hit ? { offer: hit.offer, scu: hit.scu } : null,
      status: hit ? 'found' : 'none',
      partial: '',
      note: hit
        ? null
        : report
          ? 'No buyer was found from a check in the last 7 days.'
          : `No other terminal buys ${row.commodity} in those crate sizes.`,
    })
  }

  function findBuyer(row: SellRow) {
    const amount = Math.round(Number(row.scu))
    if (!row.commodity) {
      update(row.id, { note: 'Choose a commodity.' })
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      update(row.id, { note: 'Enter how many SCU you have.' })
      return
    }
    if (row.minCrate > row.maxCrate) {
      update(row.id, { note: 'The smallest crate cannot be larger than the largest crate.' })
      return
    }
    void search(row, startId, [], amount, 0, 0)
  }

  function confirmSale(row: SellRow, soldHere: number) {
    if (!row.buyer || row.left == null) return
    const sold = row.sold + soldHere
    const earned = row.earned + Math.round(soldHere * row.buyer.offer.price)
    const left = row.left - soldHere
    if (left <= 0) {
      update(row.id, { sold, earned, left: 0, status: 'done', buyer: null, note: null })
      return
    }
    const here = row.buyer.offer.pointId
    void search(row, here, [...row.avoid, here], left, sold, earned)
  }

  return (
    <div className="site-card space-y-4 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-white">Sell what I have</h2>
      {rows.map((row) => {
        const locked = row.status !== 'edit'
        const choices = row.query.trim()
          ? commodities.filter((entry) => entry.name.toLowerCase().includes(row.query.trim().toLowerCase())).slice(0, 30)
          : []
        const from = pointById(navMap, row.fromId)
        const travel = row.buyer && row.fromId ? haulTravelText(row.fromId, row.buyer.offer.pointId) : ''
        return (
          <div key={row.id} className="site-surface space-y-3 p-3">
            <div className="grid gap-3 md:grid-cols-5">
              <label className="relative block md:col-span-2">
                <span className="site-label">Commodity</span>
                <input
                  className="site-input mt-1 w-full px-3 py-2"
                  value={row.query}
                  disabled={locked}
                  placeholder={row.commodity || 'Search commodities with a buyer'}
                  onChange={(event) => update(row.id, { query: event.target.value, note: null })}
                />
                {row.query.trim() && !locked && (
                  <div className="site-dropdown-list left-0 right-0 top-full z-40 max-h-60 overflow-y-auto">
                    {choices.length === 0 ? (
                      <p className="site-hint px-3 py-2">No terminal buys that.</p>
                    ) : choices.map((entry) => (
                      <button
                        key={entry.name}
                        type="button"
                        className="site-dropdown-item w-full text-left"
                        onClick={() => update(row.id, { commodity: entry.name, query: '', note: null })}
                      >
                        {entry.name}
                      </button>
                    ))}
                  </div>
                )}
              </label>
              <label className="block">
                <span className="site-label">Total SCU</span>
                <input
                  className="site-input mt-1 w-full px-3 py-2"
                  inputMode="numeric"
                  value={row.scu}
                  disabled={locked}
                  onChange={(event) => update(row.id, { scu: event.target.value.replace(/[^\d]/g, ''), note: null })}
                />
              </label>
              <label className="block">
                <span className="site-label">Smallest crate</span>
                <select
                  className="site-input mt-1 w-full px-3 py-2"
                  value={row.minCrate}
                  disabled={locked}
                  onChange={(event) => update(row.id, { minCrate: Number(event.target.value), note: null })}
                >
                  {CRATE_SCU.map((size) => <option key={size} value={size}>{size} SCU</option>)}
                </select>
              </label>
              <label className="block">
                <span className="site-label">Largest crate</span>
                <select
                  className="site-input mt-1 w-full px-3 py-2"
                  value={row.maxCrate}
                  disabled={locked}
                  onChange={(event) => update(row.id, { maxCrate: Number(event.target.value), note: null })}
                >
                  {CRATE_SCU.map((size) => <option key={size} value={size}>{size} SCU</option>)}
                </select>
              </label>
            </div>

            {row.status === 'found' && row.buyer && (
              <div className="space-y-1 text-sm text-white">
                <p className="text-blue-400">Go to {row.buyer.offer.place}{from ? ` from ${from.name}` : ''}.</p>
                {travel && <p>{travel}</p>}
                <p>
                  Sell {row.buyer.scu} SCU of {row.commodity} at {money(row.buyer.offer.price)} per SCU, about {money(row.buyer.scu * row.buyer.offer.price)}.
                </p>
                <p className="text-green-400">{uexLookupText(row.buyer.offer.uexStatus, row.buyer.offer.uexVerifiedAt)}</p>
                {row.buyer.scu < (row.left ?? 0) && (
                  <p className="site-hint">UEX reports that terminal takes {row.buyer.scu} SCU right now. The rest goes to the next buyer.</p>
                )}
              </div>
            )}
            {row.status === 'partial' && row.buyer && (
              <label className="block">
                <span className="site-label">SCU you were able to sell</span>
                <input
                  className="site-input mt-1 w-full px-3 py-2"
                  inputMode="numeric"
                  value={row.partial}
                  placeholder={`Less than ${row.buyer.scu}`}
                  onChange={(event) => update(row.id, { partial: event.target.value.replace(/[^\d]/g, '') })}
                />
              </label>
            )}
            {row.status === 'done' && (
              <p className="text-sm text-white">Sold {row.sold} SCU of {row.commodity} for about {money(row.earned)}.</p>
            )}
            {row.sold > 0 && row.status !== 'done' && (
              <p className="site-hint">Sold so far: {row.sold} SCU, about {money(row.earned)}. {row.left} SCU left.</p>
            )}
            {row.note && <p className="site-hint">{row.note}</p>}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="site-btn-ghost px-3 py-1.5 text-sm"
                onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((entry) => entry.id !== row.id) : [blankRow()]))}
              >
                Remove
              </button>
              {row.status === 'edit' && (
                <button type="button" className="site-btn-primary px-3 py-1.5 text-sm" disabled={busyId === row.id} onClick={() => findBuyer(row)}>
                  {busyId === row.id ? 'Checking UEX stock…' : 'Find buyer'}
                </button>
              )}
              {row.status === 'found' && row.buyer && (
                <>
                  <button type="button" className="site-btn-secondary px-3 py-1.5 text-sm" disabled={busyId === row.id} onClick={() => confirmSale(row, 0)}>
                    Zero
                  </button>
                  <button type="button" className="site-btn-secondary px-3 py-1.5 text-sm" onClick={() => update(row.id, { status: 'partial', partial: '', note: null })}>
                    Partial
                  </button>
                  <button type="button" className="site-btn-primary px-3 py-1.5 text-sm" disabled={busyId === row.id} onClick={() => confirmSale(row, row.buyer!.scu)}>
                    Full
                  </button>
                </>
              )}
              {row.status === 'partial' && row.buyer && (
                <>
                  <button type="button" className="site-btn-secondary px-3 py-1.5 text-sm" onClick={() => update(row.id, { status: 'found', note: null })}>
                    Back
                  </button>
                  <button
                    type="button"
                    className="site-btn-primary px-3 py-1.5 text-sm"
                    disabled={busyId === row.id}
                    onClick={() => {
                      const amount = Math.round(Number(row.partial))
                      if (!Number.isFinite(amount) || amount <= 0 || amount >= row.buyer!.scu) {
                        update(row.id, { note: `Enter a number from 1 to ${row.buyer!.scu - 1}.` })
                        return
                      }
                      confirmSale(row, amount)
                    }}
                  >
                    Next buyer
                  </button>
                </>
              )}
              {row.status === 'none' && (
                <button type="button" className="site-btn-secondary px-3 py-1.5 text-sm" onClick={() => update(row.id, { status: 'edit', note: null, buyer: null })}>
                  Edit
                </button>
              )}
            </div>
          </div>
        )
      })}
      <button type="button" className="site-btn-secondary px-3 py-1.5 text-sm" onClick={() => setRows((prev) => [...prev, blankRow()])}>
        Add commodity
      </button>
    </div>
  )
}
