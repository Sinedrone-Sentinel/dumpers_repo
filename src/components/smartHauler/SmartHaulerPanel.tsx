import { useMemo, useState } from 'react'
import AppModal from '../layout/AppModal'
import ShipHangarModal from '../shipHangar/ShipHangarModal'
import SellCargoPanel from './SellCargoPanel'
import { SHIPS, getShip } from '../../lib/shipShopData'
import { navMap, pointById, searchNavPoints } from '../../lib/navSystems'
import {
  HAUL_MAX_TRADES,
  HAUL_PROFIT_GOAL_MIN_SCU,
  applyHaulAvailability,
  applyPartialBuy,
  applyPartialSell,
  buysAtStop,
  collectHaulOffers,
  haulDistanceKm,
  haulTravelText as travelText,
  planHaul,
  pointsAreNear,
  profitGoalOptions,
  rerouteUnavailableBuy,
  rerouteUnsold,
  tradesForProfit,
  uexLookupText,
  type HaulOffer,
  type HaulPlan,
  type HaulRouteInput,
  type HaulStop,
} from '../../lib/smartHauler'
import { fetchHaulAvailability } from '../../lib/smartHaulerAvailability'

type HaulOffers = { buys: HaulOffer[]; sells: HaulOffer[] }
type GoalMode = 'goal' | 'trades'

const LIVE_CHECK_FAILED = 'Live UEX stock could not be checked, so this uses the saved price list.'

function money(value: number): string {
  return `${Math.round(value).toLocaleString()} aUEC`
}

function crateText(stop: HaulStop): string {
  return stop.crates.map((crate) => `${crate.count} × ${crate.size} SCU`).join(', ')
}

export default function SmartHaulerPanel({ rsiVerified }: { rsiVerified: boolean }) {
  const baseOffers = useMemo(() => collectHaulOffers(), [])
  const [offers, setOffers] = useState<HaulOffers>(baseOffers)
  const [sellMode, setSellMode] = useState(false)
  const [sellOpen, setSellOpen] = useState(false)
  const [shipQuery, setShipQuery] = useState('')
  const [shipId, setShipId] = useState<string | null>(null)
  const [startQuery, setStartQuery] = useState('')
  const [startId, setStartId] = useState<string | null>(null)
  const [roundRobin, setRoundRobin] = useState(false)
  const [goalMode, setGoalMode] = useState<GoalMode>('goal')
  const [trades, setTrades] = useState(1)
  const [goal, setGoal] = useState('')
  const [cash, setCash] = useState('')
  const [hangarOpen, setHangarOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [liveNote, setLiveNote] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [needed, setNeeded] = useState<number | null>(null)
  const [pendingPlan, setPendingPlan] = useState<HaulPlan | null>(null)
  const [route, setRoute] = useState<HaulPlan | null>(null)
  const [step, setStep] = useState(0)
  const [outcome, setOutcome] = useState<'choose' | 'unavailable' | 'partial-buy' | 'partial-sell'>('choose')
  const [picked, setPicked] = useState('')
  const [partialScu, setPartialScu] = useState('')
  const [routeNote, setRouteNote] = useState<string | null>(null)
  const [skippedSellPoints, setSkippedSellPoints] = useState<string[]>([])
  const ship = getShip(shipId)
  const start = pointById(navMap, startId)
  const canSetGoal = !!ship && (ship.cargoScu || 0) >= HAUL_PROFIT_GOAL_MIN_SCU
  const mode: GoalMode = ship && !canSetGoal ? 'trades' : goalMode
  const goalOptions = useMemo(() => (ship ? profitGoalOptions(ship.cargoScu || 0) : []), [ship])
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

  async function loadLiveOffers(): Promise<{ offers: HaulOffers; live: boolean }> {
    const rows = await fetchHaulAvailability()
    const live = rows != null
    const next = live ? applyHaulAvailability(baseOffers, rows) : baseOffers
    setOffers(next)
    setLiveNote(live ? null : LIVE_CHECK_FAILED)
    return { offers: next, live }
  }

  function clearStopUi() {
    setOutcome('choose')
    setPicked('')
    setPartialScu('')
    setRouteNote(null)
    setSkippedSellPoints([])
  }

  function clearPlan() {
    setNeeded(null)
    setPendingPlan(null)
    setNotice(null)
    setRoute(null)
    clearStopUi()
  }

  function chooseShip(id: string) {
    setShipId(id)
    setShipQuery('')
    const next = getShip(id)
    if (next && !profitGoalOptions(next.cargoScu || 0).includes(Number(goal))) setGoal('')
    clearPlan()
  }

  function toggleSellMode(on: boolean) {
    setSellMode(on)
    setSellOpen(false)
    clearPlan()
    if (on) {
      setShipId(null)
      setShipQuery('')
      setRoundRobin(false)
      setGoalMode('goal')
      setTrades(1)
      setGoal('')
      setCash('')
    }
  }

  function startRoute(plan: HaulPlan) {
    setRoute(plan)
    setStep(0)
    clearStopUi()
  }

  async function createRoute() {
    if (!ship || !startId || (ship.cargoScu || 0) <= 0 || (ship.maxCrateScu || 0) <= 0) {
      setNotice('Choose a cargo ship and a starting location.')
      return
    }
    const cashValue = Math.round(Number(cash))
    if (!Number.isFinite(cashValue) || cashValue <= 0) {
      setNotice('Enter the aUEC you have on hand.')
      return
    }
    const goalValue = Math.round(Number(goal))
    if (mode === 'goal' && (!Number.isFinite(goalValue) || goalValue <= 0)) {
      setNotice('Choose a profit goal.')
      return
    }
    setBusy(true)
    const loaded = await loadLiveOffers()
    setBusy(false)
    const shared = {
      cargoScu: ship.cargoScu || 0,
      maxCrateScu: ship.maxCrateScu || 0,
      startId,
      cash: cashValue,
      roundRobin,
      buys: loaded.offers.buys,
      sells: loaded.offers.sells,
      near: (fromId: string, toId: string) => pointsAreNear(navMap, fromId, toId),
    }
    const missed = loaded.live
      ? 'No run was found with a UEX check from the last 7 days.'
      : 'No profitable cargo run was found from that start.'
    if (mode === 'trades') {
      const plan = planHaul({ ...shared, trades })
      if (!plan) {
        setNotice(missed)
        return
      }
      startRoute(plan)
      return
    }
    const result = tradesForProfit({ ...shared, goal: goalValue })
    if (result.needed == null || !result.plan) {
      setNotice(result.plan
        ? `The best run found makes ${money(result.plan.profit)} across ${result.plan.trades} trades, short of ${money(goalValue)}.`
        : missed)
      return
    }
    setPendingPlan(result.plan)
    setNeeded(result.needed)
  }

  const current = route?.stops[step]
  const headerCash = current?.cashBefore ?? 0
  const runningProfit = route
    ? route.stops.slice(0, step + 1).reduce((sum, stop) => (
        stop.kind === 'sell' ? sum + (stop.cashAfter - stop.cashBefore) : sum
      ), 0)
    : 0

  function buildRouteInput(source: HaulOffers): HaulRouteInput | null {
    if (!route || !ship || !startId) return null
    return {
      stops: route.stops,
      step,
      cargoScu: ship.cargoScu || 0,
      maxCrateScu: ship.maxCrateScu || 0,
      trades: route.trades,
      roundRobin,
      startId,
      buys: source.buys,
      sells: source.sells,
      near: (fromId, toId) => pointsAreNear(navMap, fromId, toId),
      km: (fromId, toId) => haulDistanceKm(navMap, fromId, toId),
    }
  }

  const routeInput = buildRouteInput(offers)
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

  async function liveRouteInput(): Promise<HaulRouteInput | null> {
    setBusy(true)
    const loaded = await loadLiveOffers()
    setBusy(false)
    return buildRouteInput(loaded.offers)
  }

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

  async function openUnavailable() {
    await liveRouteInput()
    setOutcome('unavailable')
    setPicked('')
    setRouteNote(null)
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

  async function confirmPartialBuy() {
    if (!current) return
    const amount = Math.round(Number(partialScu))
    if (!Number.isFinite(amount) || amount <= 0) {
      setRouteNote('Enter how many SCU you were able to buy.')
      return
    }
    if (amount >= current.scu) {
      advanceStop()
      return
    }
    const input = await liveRouteInput()
    const plan = input ? applyPartialBuy(input, amount) : null
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

  async function confirmNoneSold() {
    if (!current) return
    const input = await liveRouteInput()
    const plan = input ? rerouteUnsold(input, skippedSellPoints) : null
    if (!plan) {
      setRouteNote('No other terminal buys this cargo.')
      return
    }
    const next = plan.stops[step]
    setSkippedSellPoints((prev) => [...prev, current.pointId])
    stayOnStop(plan, next ? `No demand there. Sell at ${next.place} instead, then buy the next cargo from that stop.` : 'No demand there.')
  }

  async function confirmPartialSell() {
    if (!current) return
    const amount = Math.round(Number(partialScu))
    if (!Number.isFinite(amount) || amount <= 0) {
      setRouteNote('Enter how many SCU you were able to sell.')
      return
    }
    if (amount >= current.scu) {
      advanceStop()
      return
    }
    const input = await liveRouteInput()
    const plan = input ? applyPartialSell(input, amount, skippedSellPoints) : null
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
      <label className="flex items-center gap-2 text-sm text-white">
        <input
          type="checkbox"
          className="site-checkbox"
          checked={sellMode}
          onChange={(event) => toggleSellMode(event.target.checked)}
        />
        Sell what I have
      </label>
      <div className="grid items-end gap-x-4 gap-y-3 lg:grid-cols-2">
        <div className="relative z-30 flex items-end gap-2">
          <label className="block min-w-0 flex-1">
            <span className="site-label">Ship</span>
            <input
              className="site-input mt-1 w-full px-3 py-2"
              value={shipQuery}
              disabled={sellMode}
              placeholder={ship ? `${ship.displayName} · ${ship.cargoScu} SCU · ${ship.maxCrateScu} SCU crates` : 'Search cargo ships'}
              onChange={(event) => {
                setShipQuery(event.target.value)
                clearPlan()
              }}
            />
          </label>
          <button type="button" className="site-btn-secondary px-3 py-2 text-sm" disabled={sellMode} onClick={() => setHangarOpen(true)}>
            My Hangar
          </button>
          {shipQuery.trim() && !sellMode && (
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="site-checkbox"
              checked={roundRobin}
              disabled={sellMode}
              onChange={(event) => {
                setRoundRobin(event.target.checked)
                clearPlan()
              }}
            />
            Round-robin
          </label>
          <label className="inline-flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">aUEC on hand</span>
            <input
              aria-label="aUEC on hand"
              className="site-input w-[16ch] px-2 py-1 text-right tabular-nums"
              inputMode="numeric"
              maxLength={12}
              value={cash}
              disabled={sellMode}
              onChange={(event) => {
                setCash(event.target.value.replace(/[^\d]/g, '').slice(0, 12))
                clearPlan()
              }}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="smart-hauler-goal"
              className="site-radio"
              checked={mode === 'goal'}
              disabled={sellMode || (!!ship && !canSetGoal)}
              onChange={() => {
                setGoalMode('goal')
                clearPlan()
              }}
            />
            Set a profit goal
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="smart-hauler-goal"
              className="site-radio"
              checked={mode === 'trades'}
              disabled={sellMode}
              onChange={() => {
                setGoalMode('trades')
                clearPlan()
              }}
            />
            Set a number of trades
          </label>
          {mode === 'goal' ? (
            <select
              aria-label="Profit goal"
              className="site-input w-[10.5rem] px-2 py-1 tabular-nums"
              value={goal}
              disabled={sellMode || !ship}
              onChange={(event) => {
                setGoal(event.target.value)
                clearPlan()
              }}
            >
              <option value="">{ship ? 'Goal' : 'Select a Ship'}</option>
              {goalOptions.map((amount) => (
                <option key={amount} value={amount}>{Math.round(amount).toLocaleString()}</option>
              ))}
            </select>
          ) : (
            <input
              type="number"
              aria-label="Number of trades"
              min={1}
              max={HAUL_MAX_TRADES}
              className="site-input w-[4.75rem] py-1 pl-2 pr-6 text-right tabular-nums"
              value={trades}
              disabled={sellMode}
              onChange={(event) => {
                setTrades(Math.max(1, Math.min(HAUL_MAX_TRADES, Math.round(Number(event.target.value) || 1))))
                clearPlan()
              }}
            />
          )}
        </div>
      </div>
      {sellMode ? (
        <p className="site-hint">Sell cargo you already carry. Add each commodity, how much you have, and the crate sizes, then Find buyer sends you to the nearest terminal that buys it.</p>
      ) : (
        <p className="site-hint">A trade is one buy and one sell. Profit goals are about an hour of hauling for the ship; ships under {HAUL_PROFIT_GOAL_MIN_SCU} SCU set trades only. Stops are capped by live UEX stock, your aUEC, hold space, and crate sizes. Round-robin ends near the start.</p>
      )}
      {ship && !sellMode && (ship.maxCrateScu || 0) > 0 && (
        <p className="text-sm text-white">This ship can carry {ship.cargoScu} SCU, in crates up to {ship.maxCrateScu} SCU.</p>
      )}
      {liveNote && !sellMode && <p className="site-hint">{liveNote}</p>}
      {notice && (
        <AppModal title="Cargo run" onClose={() => setNotice(null)} size="sm" zIndex={80}>
          <p className="text-sm text-white">{notice}</p>
        </AppModal>
      )}
      {sellMode ? (
        <button
          type="button"
          className="site-btn-primary px-4 py-2"
          onClick={() => {
            if (!startId) {
              setNotice('Choose a starting location.')
              return
            }
            setSellOpen(true)
          }}
        >
          Sell
        </button>
      ) : (
        <button type="button" className="site-btn-primary px-4 py-2" disabled={busy} onClick={() => void createRoute()}>
          {busy ? 'Checking UEX stock…' : 'Create Route'}
        </button>
      )}
      {sellMode && sellOpen && startId && <SellCargoPanel startId={startId} sells={baseOffers.sells} />}
      {hangarOpen && (
        <ShipHangarModal
          mode="select"
          cargoOnly
          rsiVerified={rsiVerified}
          onClose={() => setHangarOpen(false)}
          onSelect={(entry) => chooseShip(entry.shipId)}
        />
      )}
      {needed != null && pendingPlan && !route && (
        <AppModal title="Trades to make that profit" onClose={() => setNeeded(null)} size="md" zIndex={80}>
          <p className="text-sm text-white">
            With this ship and the aUEC you have, it takes {needed} {needed === 1 ? 'trade' : 'trades'} to make {money(Number(goal))} in profit. That is on top of the aUEC you start with.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="site-btn-secondary px-3 py-1.5 text-sm" onClick={() => setNeeded(null)}>Decline</button>
            <button
              type="button"
              className="site-btn-primary px-3 py-1.5 text-sm"
              onClick={() => {
                setNeeded(null)
                startRoute(pendingPlan)
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
          subtitle={
            <div className="flex items-baseline justify-between gap-4 text-sm font-semibold tabular-nums">
              <p className="text-green-400">On hand {money(headerCash)}</p>
              <p className="text-amber-400">Running Profit {money(runningProfit)}</p>
            </div>
          }
          onClose={() => {
            setRoute(null)
            clearStopUi()
          }}
          size="xl"
          zIndex={80}
        >
          <div className="space-y-3 text-sm text-white">
            <p className="text-blue-400">Go to {current.place}.</p>
            {travelText(step === 0 ? startId : route.stops[step - 1]?.pointId || startId, current.pointId) && (
              <p>{travelText(step === 0 ? startId : route.stops[step - 1]?.pointId || startId, current.pointId)}</p>
            )}
            {current.kind === 'buy' ? (
              <>
                <p>Buy {current.scu} SCU of {current.commodity} in {crateText(current)}.</p>
                <p className="text-green-400">{uexLookupText(current.uexStatus, current.uexVerifiedAt)}</p>
                <p className="text-red-400">Cost {money(current.cashBefore - current.cashAfter)}.</p>
              </>
            ) : (
              <>
                <p>Sell {current.scu} SCU of {current.commodity}.</p>
                <p className="text-green-400">{uexLookupText(current.uexStatus, current.uexVerifiedAt)}</p>
                <p className="text-amber-400">Profit {money(current.cashAfter - current.cashBefore)}.</p>
                <p className="text-red-400">After this sale you should have {money(current.cashAfter)}.</p>
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
                  disabled={busy}
                  onClick={() => {
                    if (outcome === 'unavailable') confirmOtherBuy()
                    else if (outcome === 'partial-buy') void confirmPartialBuy()
                    else void confirmPartialSell()
                  }}
                >
                  Next Stop
                </button>
              </>
            ) : current.kind === 'buy' ? (
              <>
                <button type="button" className="site-btn-secondary px-3 py-2 text-sm" disabled={busy} onClick={() => void openUnavailable()}>
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
                <button type="button" className="site-btn-secondary px-3 py-2 text-sm" disabled={busy} onClick={() => void confirmNoneSold()}>
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
