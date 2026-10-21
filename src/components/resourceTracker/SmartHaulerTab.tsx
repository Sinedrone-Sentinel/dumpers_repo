import { useMemo, useState } from 'react'
import AppModal from '../layout/AppModal'
import ShipHangarModal from '../shipHangar/ShipHangarModal'
import { SHIPS, getShip } from '../../lib/shipShopData'
import { describeJumps, navMap, pathBetween, pointById, searchNavPoints } from '../../lib/navSystems'
import {
  applyPartialBuy,
  applyPartialSell,
  buysAtStop,
  collectHaulOffers,
  haulDistanceKm,
  planHaul,
  pointsAreNear,
  rerouteUnavailableBuy,
  rerouteUnsold,
  tradesForProfit,
  type HaulPlan,
  type HaulRouteInput,
  type HaulStop,
} from '../../lib/smartHauler'

function money(value: number): string {
  return `${Math.round(value).toLocaleString()} aUEC`
}

function crateText(stop: HaulStop): string {
  return stop.crates.map((crate) => `${crate.count} × ${crate.size} SCU`).join(', ')
}

function travelText(fromId: string | null, toId: string): string {
  const path = pathBetween(navMap, fromId, toId)
  const jumps = describeJumps(path.hops)
  return jumps.length > 0 ? jumps.join(' ') : ''
}

export default function SmartHaulerTab({ rsiVerified }: { rsiVerified: boolean }) {
  const offers = useMemo(() => collectHaulOffers(), [])
  const [shipQuery, setShipQuery] = useState('')
  const [shipId, setShipId] = useState<string | null>(null)
  const [startQuery, setStartQuery] = useState('')
  const [startId, setStartId] = useState<string | null>(null)
  const [roundRobin, setRoundRobin] = useState(false)
  const [trades, setTrades] = useState(1)
  const [goal, setGoal] = useState('')
  const [cash, setCash] = useState('')
  const [hangarOpen, setHangarOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [needed, setNeeded] = useState<number | null>(null)
  const [acceptedTrades, setAcceptedTrades] = useState<number | null>(null)
  const [route, setRoute] = useState<HaulPlan | null>(null)
  const [step, setStep] = useState(0)
  const [outcome, setOutcome] = useState<'choose' | 'unavailable' | 'partial-buy' | 'partial-sell'>('choose')
  const [picked, setPicked] = useState('')
  const [partialScu, setPartialScu] = useState('')
  const [routeNote, setRouteNote] = useState<string | null>(null)
  const [skippedSellPoints, setSkippedSellPoints] = useState<string[]>([])
  const ship = getShip(shipId)
  const start = pointById(navMap, startId)
  const shipChoices = useMemo(() => {
    const needle = shipQuery.trim().toLowerCase().replace(/\bmark\b/g, 'mk').replace(/\bmk\s*v\b/g, 'mk5').replace(/\s+/g, '')
    if (!needle) return []
    return SHIPS.filter((entry) => {
      if ((entry.cargoScu || 0) <= 0) return false
      const hay = `${entry.displayName} ${entry.manufacturer} ${entry.id}`.toLowerCase().replace(/\bmark\b/g, 'mk').replace(/\bmk\s*v\b/g, 'mk5').replace(/\s+/g, '')
      return hay.includes(needle)
    }).slice(0, 40)
  }, [shipQuery])
  const startChoices = useMemo(() => searchNavPoints(startQuery, navMap, 12), [startQuery])

  function clearStopUi() {
    setOutcome('choose')
    setPicked('')
    setPartialScu('')
    setRouteNote(null)
    setSkippedSellPoints([])
  }

  function clearPlan() {
    setAcceptedTrades(null)
    setNeeded(null)
    setNotice(null)
    setRoute(null)
    clearStopUi()
  }

  function chooseShip(id: string) {
    setShipId(id)
    setShipQuery('')
    clearPlan()
  }

  function createRoute() {
    if (!ship || !startId || (ship.cargoScu || 0) <= 0 || (ship.maxCrateScu || 0) <= 0) {
      setNotice('Choose a cargo ship and a starting location.')
      return
    }
    const goalValue = Math.round(Number(goal))
    const cashValue = Math.round(Number(cash))
    if (!Number.isFinite(goalValue) || goalValue <= 0 || !Number.isFinite(cashValue) || cashValue <= 0) {
      setNotice('Enter the profit you want and the aUEC you have on hand.')
      return
    }
    const shared = {
      cargoScu: ship.cargoScu || 0,
      maxCrateScu: ship.maxCrateScu || 0,
      startId,
      cash: cashValue,
      roundRobin,
      buys: offers.buys,
      sells: offers.sells,
      near: (fromId: string, toId: string) => pointsAreNear(navMap, fromId, toId),
      goal: goalValue,
    }
    if (acceptedTrades === trades) {
      const plan = planHaul({ ...shared, trades })
      if (!plan) {
        setNotice('No profitable cargo run was found from that start.')
        return
      }
      setRoute(plan)
      setStep(0)
      clearStopUi()
      return
    }
    const result = tradesForProfit(shared)
    if (result.needed == null) {
      setNeeded(null)
      setNotice(result.plan
        ? `The best run found makes ${money(result.plan.profit)} across ${result.plan.trades} trades, short of ${money(goalValue)}.`
        : 'No profitable cargo run was found from that start.')
      return
    }
    setNeeded(result.needed)
    setNotice(null)
  }

  const current = route?.stops[step]
  const headerCash = current?.cashBefore ?? 0
  const routeInput: HaulRouteInput | null = route && ship && startId
    ? {
      stops: route.stops,
      step,
      cargoScu: ship.cargoScu || 0,
      maxCrateScu: ship.maxCrateScu || 0,
      trades: route.trades,
      roundRobin,
      startId,
      buys: offers.buys,
      sells: offers.sells,
      near: (fromId, toId) => pointsAreNear(navMap, fromId, toId),
      km: (fromId, toId) => haulDistanceKm(navMap, fromId, toId),
    }
    : null
  const alternatives = current?.kind === 'buy' && routeInput
    ? buysAtStop({
      pointId: current.pointId,
      cash: current.cashBefore,
      cargoScu: routeInput.cargoScu,
      maxCrateScu: routeInput.maxCrateScu,
      buys: routeInput.buys,
      sells: routeInput.sells,
      near: routeInput.near,
      excludeCommodity: current.commodity,
    })
    : []

  function stayOnStop(plan: HaulPlan, note: string) {
    setRoute(plan)
    setOutcome('choose')
    setPicked('')
    setPartialScu('')
    setRouteNote(note)
  }

  function advanceStop() {
    setOutcome('choose')
    setPicked('')
    setPartialScu('')
    setRouteNote(null)
    setSkippedSellPoints([])
    if (!route || step >= route.stops.length - 1) {
      setRoute(null)
      return
    }
    setStep(step + 1)
  }

  function confirmOtherBuy() {
    if (!routeInput) return
    const choice = alternatives.find((row) => row.commodity === picked)
    if (!choice) {
      setRouteNote('Choose a commodity from this location.')
      return
    }
    const plan = rerouteUnavailableBuy(routeInput, choice)
    if (!plan) {
      setRouteNote('That commodity has nowhere to sell.')
      return
    }
    stayOnStop(plan, `Buying ${choice.commodity} here instead. The rest of the route follows this cargo.`)
  }

  function confirmPartialBuy() {
    if (!routeInput || !current) return
    const amount = Math.round(Number(partialScu))
    if (!Number.isFinite(amount) || amount <= 0) {
      setRouteNote('Enter how many SCU you were able to buy.')
      return
    }
    if (amount >= current.scu) {
      advanceStop()
      return
    }
    const plan = applyPartialBuy(routeInput, amount)
    if (!plan) {
      setRouteNote('That amount does not fit the aUEC on hand.')
      return
    }
    setRoute(plan)
    setOutcome('choose')
    setPicked('')
    setPartialScu('')
    setSkippedSellPoints([])
    setRouteNote(`The sale is now ${amount} SCU.`)
    setStep(step + 1)
  }

  function confirmNoneSold() {
    if (!routeInput || !current) return
    const plan = rerouteUnsold(routeInput, skippedSellPoints)
    if (!plan) {
      setRouteNote('No other terminal buys this cargo.')
      return
    }
    const next = plan.stops[step]
    setSkippedSellPoints((prev) => [...prev, current.pointId])
    stayOnStop(plan, next ? `No demand there. Sell at ${next.place} instead, then buy the next cargo from that stop.` : 'No demand there.')
  }

  function confirmPartialSell() {
    if (!routeInput || !current) return
    const amount = Math.round(Number(partialScu))
    if (!Number.isFinite(amount) || amount <= 0) {
      setRouteNote('Enter how many SCU you were able to sell.')
      return
    }
    if (amount >= current.scu) {
      advanceStop()
      return
    }
    const plan = applyPartialSell(routeInput, amount, skippedSellPoints)
    if (!plan) {
      setRouteNote('No other terminal buys the rest of this cargo.')
      return
    }
    const next = plan.stops[step]
    setSkippedSellPoints((prev) => [...prev, current.pointId])
    stayOnStop(plan, next ? `Sell the remaining ${next.scu} SCU at ${next.place} before buying anything else.` : 'Sell the rest before the next buy.')
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="relative z-30 flex items-end gap-2">
          <label className="block min-w-0 flex-1">
            <span className="site-label">Ship</span>
            <input
              className="site-input mt-1 w-full px-3 py-2"
              value={shipQuery}
              placeholder={ship ? `${ship.displayName} · ${ship.cargoScu} SCU · ${ship.maxCrateScu} SCU crates` : 'Search cargo ships'}
              onChange={(event) => {
                setShipQuery(event.target.value)
                clearPlan()
              }}
            />
          </label>
          <button type="button" className="site-btn-secondary px-3 py-2 text-sm" onClick={() => setHangarOpen(true)}>
            My Hangar
          </button>
          {shipQuery.trim() && (
            <div className="site-dropdown-list left-0 right-0 top-full z-40 max-h-60 overflow-y-auto">
              {shipChoices.length === 0 ? (
                <p className="site-hint px-3 py-2">No cargo ship matches.</p>
              ) : shipChoices.map((entry) => (
                <button key={entry.id} type="button" className="site-dropdown-item w-full text-left" onClick={() => chooseShip(entry.id)}>
                  {entry.displayName}
                  <span className="ml-2 text-slate-400">{entry.cargoScu} SCU · up to {entry.maxCrateScu} SCU</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <label className="relative z-20 block">
          <span className="site-label">Starting location</span>
          <input
            className="site-input mt-1 w-full px-3 py-2"
            value={startQuery}
            placeholder={start?.name || 'Search a station, city, or planet'}
            onChange={(event) => {
              setStartQuery(event.target.value)
              clearPlan()
            }}
          />
          {startQuery.trim() && (
            <div className="site-dropdown-list left-0 right-0 top-full z-40 max-h-60 overflow-y-auto">
              {startChoices.length === 0 ? (
                <p className="site-hint px-3 py-2">No matching location.</p>
              ) : startChoices.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  className="site-dropdown-item w-full text-left"
                  onClick={() => {
                    setStartId(hit.id)
                    setStartQuery('')
                    clearPlan()
                  }}
                >
                  {hit.label}
                </button>
              ))}
            </div>
          )}
        </label>
        <label className="flex items-center gap-2 text-sm text-white">
          <input
            type="checkbox"
            className="site-checkbox"
            checked={roundRobin}
            onChange={(event) => {
              setRoundRobin(event.target.checked)
              clearPlan()
            }}
          />
          Round-robin
        </label>
        <label className="block">
          <span className="site-label">Trades</span>
          <input
            type="number"
            min={1}
            max={20}
            className="site-input mt-1 w-full px-3 py-2"
            value={trades}
            onChange={(event) => {
              setTrades(Math.max(1, Math.min(20, Math.round(Number(event.target.value) || 1))))
              clearPlan()
            }}
          />
        </label>
        <label className="block">
          <span className="site-label">Profit goal (aUEC)</span>
          <input
            className="site-input mt-1 w-full px-3 py-2"
            inputMode="numeric"
            value={goal}
            onChange={(event) => {
              setGoal(event.target.value.replace(/[^\d]/g, ''))
              clearPlan()
            }}
          />
        </label>
        <label className="block">
          <span className="site-label">aUEC on hand</span>
          <input
            className="site-input mt-1 w-full px-3 py-2"
            inputMode="numeric"
            value={cash}
            onChange={(event) => {
              setCash(event.target.value.replace(/[^\d]/g, ''))
              clearPlan()
            }}
          />
        </label>
      </div>
      <p className="site-hint">A trade is one buy and one sell. Crates larger than the ship can carry are left out. Round-robin brings the last sale back to the start when you run more than one trade. If a terminal is short on stock or will not buy, the buttons on that stop rebuild the rest of the route from what you actually got.</p>
      {ship && (ship.maxCrateScu || 0) > 0 && (
        <p className="text-sm text-white">This ship can carry {ship.cargoScu} SCU, in crates up to {ship.maxCrateScu} SCU.</p>
      )}
      {notice && (
        <AppModal title="Cargo run" onClose={() => setNotice(null)} size="sm" zIndex={80}>
          <p className="text-sm text-white">{notice}</p>
        </AppModal>
      )}
      <button type="button" className="site-btn-primary px-4 py-2" onClick={createRoute}>
        Create Route
      </button>
      {hangarOpen && (
        <ShipHangarModal
          mode="select"
          cargoOnly
          rsiVerified={rsiVerified}
          onClose={() => setHangarOpen(false)}
          onSelect={(entry) => chooseShip(entry.shipId)}
        />
      )}
      {needed != null && !route && (
        <AppModal title="Trades to make that profit" onClose={() => setNeeded(null)} size="md" zIndex={80}>
          <p className="text-sm text-white">
            With this ship and the aUEC you have, it takes {needed} {needed === 1 ? 'trade' : 'trades'} to reach {money(Number(goal))}.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="site-btn-secondary px-3 py-1.5 text-sm" onClick={() => setNeeded(null)}>Decline</button>
            <button
              type="button"
              className="site-btn-primary px-3 py-1.5 text-sm"
              onClick={() => {
                setTrades(needed)
                setAcceptedTrades(needed)
                setNeeded(null)
              }}
            >
              Accept
            </button>
          </div>
        </AppModal>
      )}
      {route && current && (
        <AppModal
          title={current.kind === 'buy' ? 'Buy cargo' : 'Sell cargo'}
          subtitle={`On hand ${money(headerCash)}`}
          onClose={() => {
            setRoute(null)
            clearStopUi()
          }}
          size="xl"
          zIndex={80}
        >
          <div className="space-y-3 text-sm text-white">
            <p>Go to {current.place}.</p>
            {travelText(step === 0 ? startId : route.stops[step - 1]?.pointId || startId, current.pointId) && (
              <p>{travelText(step === 0 ? startId : route.stops[step - 1]?.pointId || startId, current.pointId)}</p>
            )}
            {current.kind === 'buy' ? (
              <>
                <p>Buy {current.scu} SCU of {current.commodity} in {crateText(current)}.</p>
                <p>Cost {money(current.cashBefore - current.cashAfter)}.</p>
              </>
            ) : (
              <>
                <p>Sell {current.scu} SCU of {current.commodity}.</p>
                <p>
                  Profit {money(current.cashAfter - (route.stops[step - 1]?.cashBefore ?? current.cashBefore))}.
                </p>
                <p>After this sale you should have {money(current.cashAfter)}.</p>
              </>
            )}
            {routeNote && <p className="site-hint">{routeNote}</p>}
          </div>
          {current.kind === 'buy' && outcome === 'unavailable' && (
            <div className="mt-4 space-y-2">
              <label className="block">
                <span className="site-label">Buy something else here</span>
                <select
                  className="site-input mt-1 w-full px-3 py-2"
                  value={picked}
                  onChange={(event) => setPicked(event.target.value)}
                >
                  <option value="">Choose a commodity</option>
                  {alternatives.map((choice) => (
                    <option key={choice.commodity} value={choice.commodity}>
                      {choice.commodity} · {choice.scu} SCU · {money(choice.cost)}
                    </option>
                  ))}
                </select>
              </label>
              {alternatives.length === 0 && <p className="site-hint">Nothing else here fits this ship and the aUEC on hand.</p>}
            </div>
          )}
          {outcome === 'partial-buy' && current.kind === 'buy' && (
            <label className="mt-4 block">
              <span className="site-label">SCU you were able to buy</span>
              <input
                className="site-input mt-1 w-full px-3 py-2"
                inputMode="numeric"
                value={partialScu}
                placeholder={`Less than ${current.scu}`}
                onChange={(event) => setPartialScu(event.target.value.replace(/[^\d]/g, ''))}
              />
            </label>
          )}
          {outcome === 'partial-sell' && current.kind === 'sell' && (
            <label className="mt-4 block">
              <span className="site-label">SCU you were able to sell</span>
              <input
                className="site-input mt-1 w-full px-3 py-2"
                inputMode="numeric"
                value={partialScu}
                placeholder={`Less than ${current.scu}`}
                onChange={(event) => setPartialScu(event.target.value.replace(/[^\d]/g, ''))}
              />
            </label>
          )}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            {outcome === 'unavailable' || outcome === 'partial-buy' || outcome === 'partial-sell' ? (
              <>
                <button type="button" className="site-btn-secondary px-3 py-2 text-sm" onClick={() => { setOutcome('choose'); setRouteNote(null) }}>
                  Back
                </button>
                <button
                  type="button"
                  className="site-btn-primary px-3 py-2 text-sm"
                  onClick={() => {
                    if (outcome === 'unavailable') confirmOtherBuy()
                    else if (outcome === 'partial-buy') confirmPartialBuy()
                    else confirmPartialSell()
                  }}
                >
                  Next Stop
                </button>
              </>
            ) : current.kind === 'buy' ? (
              <>
                <button type="button" className="site-btn-secondary px-3 py-2 text-sm" onClick={() => { setOutcome('unavailable'); setPicked(''); setRouteNote(null) }}>
                  Unavailable for purchase
                </button>
                <button type="button" className="site-btn-secondary px-3 py-2 text-sm" onClick={() => { setOutcome('partial-buy'); setPartialScu(''); setRouteNote(null) }}>
                  Partial purchase only
                </button>
                <button type="button" className="site-btn-primary px-3 py-2 text-sm" onClick={advanceStop}>
                  Full purchase acquired
                </button>
              </>
            ) : (
              <>
                <button type="button" className="site-btn-secondary px-3 py-2 text-sm" onClick={confirmNoneSold}>
                  None sold
                </button>
                <button type="button" className="site-btn-secondary px-3 py-2 text-sm" onClick={() => { setOutcome('partial-sell'); setPartialScu(''); setRouteNote(null) }}>
                  Partial sale
                </button>
                <button type="button" className="site-btn-primary px-3 py-2 text-sm" onClick={advanceStop}>
                  {step >= route.stops.length - 1 ? 'Finish' : 'Full sale'}
                </button>
              </>
            )}
          </div>
        </AppModal>
      )}
    </div>
  )
}
