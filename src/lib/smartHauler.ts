import { SHOP_COMMODITIES, getCommodityTradeInfo, terminalPlace } from './shopLookup'
import { describeJumps, navMap, pathBetween, pointById, resolveShopPlace, type NavMap } from './navSystems'

export const HAUL_NEAR_KM = 300
export const HAUL_MAX_TRADES = 20
/** Ships smaller than this can only plan a number of trades. */
export const HAUL_PROFIT_GOAL_MIN_SCU = 4

export const CRATE_SCU = [1, 2, 4, 8, 16, 32]

/** About one hour of hauling for each hold size. */
const PROFIT_GOAL_TIERS: Array<{ minScu: number; step: number; max: number }> = [
  { minScu: 500, step: 500_000, max: 4_000_000 },
  { minScu: 200, step: 500_000, max: 3_500_000 },
  { minScu: 64, step: 500_000, max: 3_000_000 },
  { minScu: 32, step: 500_000, max: 2_500_000 },
  { minScu: 16, step: 500_000, max: 1_500_000 },
  { minScu: HAUL_PROFIT_GOAL_MIN_SCU, step: 250_000, max: 1_000_000 },
]

export function profitGoalOptions(cargoScu: number): number[] {
  const tier = PROFIT_GOAL_TIERS.find((row) => cargoScu >= row.minScu)
  if (!tier) return []
  const options: number[] = []
  for (let amount = tier.step; amount <= tier.max; amount += tier.step) options.push(amount)
  return options
}

export interface HaulOffer {
  commodity: string
  pointId: string
  place: string
  price: number
  boxSizes: number[]
  commodityId?: number
  terminalId?: number
  /** Live stock on a buy, or how much the terminal will take on a sale. */
  stockScu?: number
  /** UEX status for this side, present only when a check from the last 7 days matched. */
  uexStatus?: number
  /** Unix ms of that UEX report. */
  uexVerifiedAt?: number
}

export interface HaulSideAvailability {
  available: boolean
  scu: number | null
  status?: number
  verifiedAt?: number
}

export interface HaulAvailabilityRow {
  commodityId: number
  terminalId: number
  buy: HaulSideAvailability | null
  sell: HaulSideAvailability | null
}

export interface HaulCrate {
  size: number
  count: number
}

export interface HaulStop {
  kind: 'buy' | 'sell'
  commodity: string
  pointId: string
  place: string
  scu: number
  crates: HaulCrate[]
  pricePerScu: number
  cashBefore: number
  cashAfter: number
  uexStatus?: number
  uexVerifiedAt?: number
}

export interface HaulPlan {
  stops: HaulStop[]
  profit: number
  trades: number
  cash: number
}

export interface HaulBuyChoice {
  commodity: string
  pointId: string
  place: string
  price: number
  boxSizes: number[]
  scu: number
  crates: HaulCrate[]
  cost: number
  uexStatus?: number
  uexVerifiedAt?: number
}

export interface HaulRouteInput {
  stops: HaulStop[]
  step: number
  cargoScu: number
  maxCrateScu: number
  trades: number
  roundRobin: boolean
  startId: string
  buys: HaulOffer[]
  sells: HaulOffer[]
  near: (fromId: string, toId: string) => boolean
  km: (fromId: string, toId: string) => number
}

interface HaulState {
  pointId: string
  cash: number
  profit: number
  stops: HaulStop[]
}

export function pointsAreNear(nav: NavMap, fromId: string, toId: string, km = HAUL_NEAR_KM): boolean {
  if (fromId === toId) return true
  const from = pointById(nav, fromId)
  const to = pointById(nav, toId)
  if (!from || !to || from.system !== to.system) return false
  return Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z) / 1000 <= km
}

export function packHaulLoad(
  cargoScu: number,
  maxCrateScu: number,
  boxSizes: number[],
  pricePerScu: number,
  cash: number,
): { scu: number; crates: HaulCrate[]; cost: number } | null {
  if (pricePerScu <= 0 || cash <= 0 || cargoScu <= 0 || maxCrateScu <= 0) return null
  const sizes = [...new Set(boxSizes.map((size) => Math.round(size)))]
    .filter((size) => CRATE_SCU.includes(size) && size <= maxCrateScu)
    .sort((a, b) => b - a)
  if (sizes.length === 0) return null
  const smallest = sizes[sizes.length - 1]
  let room = Math.min(cargoScu, Math.floor(cash / pricePerScu))
  if (room < smallest) return null
  const crates: HaulCrate[] = []
  for (const size of sizes) {
    const count = Math.floor(room / size)
    if (count <= 0) continue
    crates.push({ size, count })
    room -= count * size
  }
  const scu = crates.reduce((total, crate) => total + crate.size * crate.count, 0)
  if (scu <= 0) return null
  return { scu, crates, cost: Math.round(scu * pricePerScu) }
}

/** Crate sizes both terminals list. A terminal with no listed sizes takes whatever the other one uses. */
export function sharedBoxSizes(buyBoxes: number[], sellBoxes: number[]): number[] {
  if (sellBoxes.length === 0) return buyBoxes
  if (buyBoxes.length === 0) return sellBoxes
  const sell = new Set(sellBoxes.map((size) => Math.round(size)))
  return buyBoxes.filter((size) => sell.has(Math.round(size)))
}

/** One trade's load: hold space, live stock on both ends, crates both ends take, and the cash on hand. */
export function tradeLoad(
  buy: HaulOffer,
  sell: HaulOffer,
  cargoScu: number,
  maxCrateScu: number,
  cash: number,
): { scu: number; crates: HaulCrate[]; cost: number } | null {
  const room = Math.min(cargoScu, buy.stockScu ?? Number.POSITIVE_INFINITY, sell.stockScu ?? Number.POSITIVE_INFINITY)
  return packHaulLoad(room, maxCrateScu, sharedBoxSizes(buy.boxSizes, sell.boxSizes), buy.price, cash)
}

/** Drop terminals UEX did not verify in the returned rows. A missing row is not a fresh check. */
export function applyHaulAvailability(
  offers: { buys: HaulOffer[]; sells: HaulOffer[] },
  rows: HaulAvailabilityRow[],
): { buys: HaulOffer[]; sells: HaulOffer[] } {
  const byKey = new Map(rows.map((row) => [`${row.commodityId}:${row.terminalId}`, row]))
  const apply = (list: HaulOffer[], side: 'buy' | 'sell') => list.flatMap((offer) => {
    if (offer.commodityId == null || offer.terminalId == null) return []
    const report = byKey.get(`${offer.commodityId}:${offer.terminalId}`)?.[side]
    if (!report?.available) return []
    const next: HaulOffer = { ...offer }
    if (report.scu != null && report.scu > 0) next.stockScu = report.scu
    if (report.status != null) next.uexStatus = report.status
    if (report.verifiedAt != null) next.uexVerifiedAt = report.verifiedAt
    return [next]
  })
  return { buys: apply(offers.buys, 'buy'), sells: apply(offers.sells, 'sell') }
}

const UEX_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const LOCAL_STOCK_NOTE = 'Local Info: Resource may or may not be in demand'

/** The step line for a UEX check, or the local-info line when that check never arrived. */
export function uexLookupText(status: number | undefined, verifiedAt: number | undefined): string {
  if (status == null || verifiedAt == null || !Number.isFinite(verifiedAt)) return LOCAL_STOCK_NOTE
  const date = new Date(verifiedAt)
  if (Number.isNaN(date.getTime())) return LOCAL_STOCK_NOTE
  const label = `${UEX_MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`
  return `UEX Live Lookup - Resource Status ${status} -- Last Date Verified ${label}`
}

function indexOffers(offers: HaulOffer[]): Map<string, HaulOffer[]> {
  const byCommodity = new Map<string, HaulOffer[]>()
  for (const offer of offers) {
    const list = byCommodity.get(offer.commodity)
    if (list) list.push(offer)
    else byCommodity.set(offer.commodity, [offer])
  }
  return byCommodity
}

function crateFitsOffer(offer: HaulOffer, maxCrateScu: number): boolean {
  return offer.boxSizes.some((size) => {
    const rounded = Math.round(size)
    return CRATE_SCU.includes(rounded) && rounded <= maxCrateScu
  })
}

function buyChoices(
  offers: HaulOffer[],
  pointId: string,
  near: (fromId: string, toId: string) => boolean,
  maxCrateScu: number,
): HaulOffer[] {
  const byPoint = new Map<string, HaulOffer>()
  for (const offer of offers) {
    if (!near(pointId, offer.pointId) || !crateFitsOffer(offer, maxCrateScu)) continue
    const current = byPoint.get(offer.pointId)
    if (!current || offer.price < current.price) byPoint.set(offer.pointId, offer)
  }
  return [...byPoint.values()].sort((a, b) => a.price - b.price).slice(0, 3)
}

function sellChoices(
  offers: HaulOffer[],
  buyPrice: number,
  allow: (pointId: string) => boolean,
): HaulOffer[] {
  const byPoint = new Map<string, HaulOffer>()
  for (const offer of offers) {
    if (offer.price <= buyPrice || !allow(offer.pointId)) continue
    const current = byPoint.get(offer.pointId)
    if (!current || offer.price > current.price) byPoint.set(offer.pointId, offer)
  }
  return [...byPoint.values()].sort((a, b) => b.price - a.price).slice(0, 6)
}

function applyTrade(
  state: HaulState,
  buy: HaulOffer,
  sell: HaulOffer,
  load: { scu: number; crates: HaulCrate[]; cost: number },
): HaulState {
  const revenue = Math.round(load.scu * sell.price)
  const afterBuy = state.cash - load.cost
  const afterSell = afterBuy + revenue
  return {
    pointId: sell.pointId,
    cash: afterSell,
    profit: state.profit + (revenue - load.cost),
    stops: [
      ...state.stops,
      {
        kind: 'buy',
        commodity: buy.commodity,
        pointId: buy.pointId,
        place: buy.place,
        scu: load.scu,
        crates: load.crates,
        pricePerScu: buy.price,
        cashBefore: state.cash,
        cashAfter: afterBuy,
        uexStatus: buy.uexStatus,
        uexVerifiedAt: buy.uexVerifiedAt,
      },
      {
        kind: 'sell',
        commodity: sell.commodity,
        pointId: sell.pointId,
        place: sell.place,
        scu: load.scu,
        crates: load.crates,
        pricePerScu: sell.price,
        cashBefore: afterBuy,
        cashAfter: afterSell,
        uexStatus: sell.uexStatus,
        uexVerifiedAt: sell.uexVerifiedAt,
      },
    ],
  }
}

function oneTradeProfit(
  state: HaulState,
  buys: Map<string, HaulOffer[]>,
  sells: Map<string, HaulOffer[]>,
  near: (fromId: string, toId: string) => boolean,
  sellAllow: (pointId: string) => boolean,
  cargoScu: number,
  maxCrateScu: number,
): number {
  let best = 0
  for (const [commodity, buyOffers] of buys) {
    const buy = buyChoices(buyOffers, state.pointId, near, maxCrateScu)[0]
    const sellOffers = sells.get(commodity)
    if (!buy || !sellOffers) continue
    const sell = sellChoices(sellOffers, buy.price, sellAllow)[0]
    if (!sell) continue
    const load = tradeLoad(buy, sell, cargoScu, maxCrateScu, state.cash)
    if (!load) continue
    const revenue = Math.round(load.scu * sell.price)
    best = Math.max(best, revenue - load.cost)
  }
  return best
}

/**
 * Walks each buy and sell in order. The cash after a sale is what the next buy can spend,
 * so a later stop can take more SCU or a more expensive commodity.
 */
export function planHaul(input: {
  cargoScu: number
  maxCrateScu: number
  startId: string
  /** Where this leg starts. Defaults to the round-robin start. */
  fromId?: string
  cash: number
  trades: number
  roundRobin: boolean
  buys: HaulOffer[]
  sells: HaulOffer[]
  near: (fromId: string, toId: string) => boolean
}): HaulPlan | null {
  const trades = Math.max(0, Math.floor(input.trades))
  if (trades <= 0 || input.cash <= 0) return null
  const buys = indexOffers(input.buys)
  const sells = indexOffers(input.sells)
  let beam: HaulState[] = [{ pointId: input.fromId || input.startId, cash: Math.round(input.cash), profit: 0, stops: [] }]

  for (let step = 0; step < trades; step += 1) {
    const last = step === trades - 1
    const ranked: Array<{ state: HaulState; score: number }> = []
    for (const state of beam) {
      const sellAllow = (pointId: string) => !last || !input.roundRobin || trades === 1 || input.near(input.startId, pointId)
      for (const [commodity, buyOffers] of buys) {
        const sellOffers = sells.get(commodity)
        if (!sellOffers) continue
        for (const buy of buyChoices(buyOffers, state.pointId, input.near, input.maxCrateScu)) {
          for (const sell of sellChoices(sellOffers, buy.price, sellAllow)) {
            const load = tradeLoad(buy, sell, input.cargoScu, input.maxCrateScu, state.cash)
            if (!load) continue
            const next = applyTrade(state, buy, sell, load)
            let score = next.profit
            if (!last) {
              const followAllow = (pointId: string) => !input.roundRobin || trades - step > 2 || input.near(input.startId, pointId)
              score += oneTradeProfit(next, buys, sells, input.near, followAllow, input.cargoScu, input.maxCrateScu)
            }
            ranked.push({ state: next, score })
          }
        }
      }
    }
    if (ranked.length === 0) return null
    ranked.sort((a, b) => b.score - a.score || b.state.profit - a.state.profit)
    beam = ranked.slice(0, 8).map((row) => row.state)
  }

  beam.sort((a, b) => b.profit - a.profit)
  const best = beam[0]
  if (!best || best.stops.length === 0) return null
  return { stops: best.stops, profit: best.profit, trades, cash: best.cash }
}

/** How many trades this ship needs to reach the profit goal, using the cash each stop should have. */
export function tradesForProfit(input: Omit<Parameters<typeof planHaul>[0], 'trades'> & { goal: number }): {
  needed: number | null
  plan: HaulPlan | null
} {
  let best: HaulPlan | null = null
  for (let trades = 1; trades <= HAUL_MAX_TRADES; trades += 1) {
    const plan = planHaul({ ...input, trades })
    if (!plan) break
    if (!best || plan.profit > best.profit) best = plan
    if (plan.profit >= input.goal) return { needed: trades, plan }
  }
  return { needed: null, plan: best }
}

export function collectHaulOffers(nav: NavMap = navMap): { buys: HaulOffer[]; sells: HaulOffer[] } {
  const buys: HaulOffer[] = []
  const sells: HaulOffer[] = []
  for (const commodity of SHOP_COMMODITIES) {
    const info = getCommodityTradeInfo(commodity.id)
    if (!info) continue
    for (const loc of info.buyAt) {
      const price = loc.buyPricePerScu
      if (!price || price <= 0) continue
      const pointId = resolveShopPlace(loc.terminal, nav)
      if (!pointId) continue
      buys.push({
        commodity: info.commodity.name,
        pointId,
        place: terminalPlace(loc.terminal),
        price,
        boxSizes: loc.boxSizes,
        commodityId: info.commodity.id,
        terminalId: loc.terminal.id,
      })
    }
    for (const loc of info.sellAt) {
      const price = loc.sellPricePerScu
      if (!price || price <= 0) continue
      const pointId = resolveShopPlace(loc.terminal, nav)
      if (!pointId) continue
      sells.push({
        commodity: info.commodity.name,
        pointId,
        place: terminalPlace(loc.terminal),
        price,
        boxSizes: loc.boxSizes,
        commodityId: info.commodity.id,
        terminalId: loc.terminal.id,
      })
    }
  }
  return { buys, sells }
}

export function haulDistanceKm(nav: NavMap, fromId: string, toId: string): number {
  return pathBetween(nav, fromId, toId).km
}

/** System jumps between two stops, or an empty string inside one system. */
export function haulTravelText(fromId: string | null, toId: string, nav: NavMap = navMap): string {
  return describeJumps(pathBetween(nav, fromId, toId).hops).join(' ')
}

/** Crates for a quantity the terminal actually handed over. */
export function cratesForQuantity(scu: number, boxSizes: number[], maxCrateScu: number): HaulCrate[] {
  const amount = Math.round(scu)
  if (amount <= 0) return []
  const sizes = [...new Set(boxSizes.map((size) => Math.round(size)))]
    .filter((size) => CRATE_SCU.includes(size) && size <= maxCrateScu && size <= amount)
    .sort((a, b) => b - a)
  let room = amount
  const crates: HaulCrate[] = []
  for (const size of sizes) {
    const count = Math.floor(room / size)
    if (count <= 0) continue
    crates.push({ size, count })
    room -= count * size
  }
  if (room > 0) crates.push({ size: room, count: 1 })
  if (crates.length === 0) crates.push({ size: amount, count: 1 })
  return crates
}

function finishPlan(stops: HaulStop[], trades: number): HaulPlan | null {
  const first = stops[0]
  const last = stops[stops.length - 1]
  if (!first || !last) return null
  return {
    stops,
    profit: last.cashAfter - first.cashBefore,
    trades,
    cash: last.cashAfter,
  }
}

function boxSizesFor(offers: HaulOffer[], commodity: string, pointId: string): number[] {
  const match = offers.find((offer) => offer.commodity === commodity && offer.pointId === pointId)
  return match?.boxSizes?.length ? match.boxSizes : [1]
}

function continueAfter(head: HaulStop[], input: HaulRouteInput, tradesDone: number): HaulStop[] {
  const remaining = input.trades - tradesDone
  const last = head[head.length - 1]
  if (remaining <= 0 || !last || last.cashAfter <= 0) return head
  const tail = planHaul({
    cargoScu: input.cargoScu,
    maxCrateScu: input.maxCrateScu,
    startId: input.startId,
    fromId: last.pointId,
    cash: last.cashAfter,
    trades: remaining,
    roundRobin: input.roundRobin,
    buys: input.buys,
    sells: input.sells,
    near: input.near,
  })
  if (!tail) return head
  return [...head, ...tail.stops]
}

function sellForBuy(
  sells: HaulOffer[],
  buy: HaulOffer,
  allow: (pointId: string) => boolean,
): HaulOffer | null {
  const profitable = sellChoices(sells, buy.price, allow)
  if (profitable[0]) return profitable[0]
  const byPoint = new Map<string, HaulOffer>()
  for (const offer of sells) {
    if (!allow(offer.pointId)) continue
    const current = byPoint.get(offer.pointId)
    if (!current || offer.price > current.price) byPoint.set(offer.pointId, offer)
  }
  return [...byPoint.values()].sort((a, b) => b.price - a.price)[0] || null
}

/** Other commodities on sale at this stop that the ship can pay for and later sell. */
export function buysAtStop(input: {
  pointId: string
  cash: number
  cargoScu: number
  maxCrateScu: number
  buys: HaulOffer[]
  sells: HaulOffer[]
  near: (fromId: string, toId: string) => boolean
  excludeCommodity?: string
}): HaulBuyChoice[] {
  const choices: Array<HaulBuyChoice & { profit: number }> = []
  const sellIndex = indexOffers(input.sells)
  for (const [commodity, offers] of indexOffers(input.buys)) {
    if (commodity === input.excludeCommodity) continue
    const buy = buyChoices(offers, input.pointId, input.near, input.maxCrateScu)[0]
    const sellOffers = sellIndex.get(commodity)
    if (!buy || !sellOffers?.length) continue
    let load: ReturnType<typeof tradeLoad> = null
    let bestSell: HaulOffer | null = null
    for (const sell of [...sellOffers].sort((a, b) => b.price - a.price)) {
      load = tradeLoad(buy, sell, input.cargoScu, input.maxCrateScu, input.cash)
      if (load) {
        bestSell = sell
        break
      }
    }
    if (!load || !bestSell) continue
    choices.push({
      commodity: buy.commodity,
      pointId: buy.pointId,
      place: buy.place,
      price: buy.price,
      boxSizes: buy.boxSizes,
      scu: load.scu,
      crates: load.crates,
      cost: load.cost,
      profit: Math.round(load.scu * bestSell.price) - load.cost,
      uexStatus: buy.uexStatus,
      uexVerifiedAt: buy.uexVerifiedAt,
    })
  }
  choices.sort((a, b) => b.profit - a.profit || a.price - b.price)
  return choices.map(({ profit: _profit, ...choice }) => choice)
}

/**
 * The buy at this stop is unavailable. Swap in another commodity here and rebuild
 * the rest of the route. The caller stays on this same stop.
 */
export function rerouteUnavailableBuy(input: HaulRouteInput, choice: HaulBuyChoice): HaulPlan | null {
  const buy = input.stops[input.step]
  if (!buy || buy.kind !== 'buy') return null
  const tradeIndex = Math.floor(input.step / 2)
  const lastTrade = tradeIndex >= input.trades - 1
  const offer: HaulOffer = {
    commodity: choice.commodity,
    pointId: choice.pointId,
    place: choice.place,
    price: choice.price,
    boxSizes: choice.boxSizes,
    uexStatus: choice.uexStatus,
    uexVerifiedAt: choice.uexVerifiedAt,
  }
  const allow = (pointId: string) => !lastTrade || !input.roundRobin || input.trades === 1 || input.near(input.startId, pointId)
  const sell = sellForBuy(
    input.sells.filter((row) => row.commodity === choice.commodity),
    offer,
    allow,
  )
  if (!sell || choice.cost > buy.cashBefore || choice.scu <= 0) return null
  const revenue = Math.round(choice.scu * sell.price)
  const afterBuy = buy.cashBefore - choice.cost
  const pair: HaulStop[] = [
    {
      kind: 'buy',
      commodity: choice.commodity,
      pointId: choice.pointId,
      place: choice.place,
      scu: choice.scu,
      crates: choice.crates,
      pricePerScu: choice.price,
      cashBefore: buy.cashBefore,
      cashAfter: afterBuy,
      uexStatus: choice.uexStatus,
      uexVerifiedAt: choice.uexVerifiedAt,
    },
    {
      kind: 'sell',
      commodity: choice.commodity,
      pointId: sell.pointId,
      place: sell.place,
      scu: choice.scu,
      crates: choice.crates,
      pricePerScu: sell.price,
      cashBefore: afterBuy,
      cashAfter: afterBuy + revenue,
      uexStatus: sell.uexStatus,
      uexVerifiedAt: sell.uexVerifiedAt,
    },
  ]
  return finishPlan(continueAfter([...input.stops.slice(0, input.step), ...pair], input, tradeIndex + 1), input.trades)
}

/** The terminal sold fewer SCU than the plan. Shrink this trade and rebuild what follows. */
export function applyPartialBuy(input: HaulRouteInput, scu: number): HaulPlan | null {
  const buy = input.stops[input.step]
  const sell = input.stops[input.step + 1]
  const amount = Math.round(scu)
  if (!buy || buy.kind !== 'buy' || !sell || sell.kind !== 'sell') return null
  if (amount <= 0 || amount >= buy.scu) return null
  const cost = Math.round(amount * buy.pricePerScu)
  if (cost > buy.cashBefore) return null
  const crates = cratesForQuantity(amount, boxSizesFor(input.buys, buy.commodity, buy.pointId), input.maxCrateScu)
  const afterBuy = buy.cashBefore - cost
  const revenue = Math.round(amount * sell.pricePerScu)
  const pair: HaulStop[] = [
    { ...buy, scu: amount, crates, cashAfter: afterBuy },
    { ...sell, scu: amount, crates, cashBefore: afterBuy, cashAfter: afterBuy + revenue },
  ]
  return finishPlan(continueAfter([...input.stops.slice(0, input.step), ...pair], input, Math.floor(input.step / 2) + 1), input.trades)
}

/** Nearest terminal that buys this cargo. A profitable price wins over a nearer loss. */
export function nextSellLocation(input: {
  commodity: string
  fromId: string
  buyPrice: number
  sells: HaulOffer[]
  avoidPointIds: string[]
  km: (fromId: string, toId: string) => number
}): HaulOffer | null {
  const avoid = new Set(input.avoidPointIds)
  const byPoint = new Map<string, HaulOffer>()
  for (const offer of input.sells) {
    if (offer.commodity !== input.commodity || avoid.has(offer.pointId)) continue
    const current = byPoint.get(offer.pointId)
    if (!current || offer.price > current.price) byPoint.set(offer.pointId, offer)
  }
  const ranked = [...byPoint.values()]
    .map((offer) => ({ offer, km: input.km(input.fromId, offer.pointId) }))
    .filter((row) => Number.isFinite(row.km))
    .sort((a, b) => {
      const profitRank = Number(a.offer.price <= input.buyPrice) - Number(b.offer.price <= input.buyPrice)
      return profitRank || a.km - b.km || b.offer.price - a.offer.price
    })
  return ranked[0]?.offer || null
}

/**
 * Sell what I have: the nearest terminal that buys this cargo and takes a crate inside
 * the member's smallest-to-largest range. No buying, no profit goal.
 */
export function findSellBuyer(input: {
  commodity: string
  fromId: string
  scu: number
  minCrateScu: number
  maxCrateScu: number
  sells: HaulOffer[]
  avoidPointIds: string[]
  km: (fromId: string, toId: string) => number
}): { offer: HaulOffer; scu: number; km: number } | null {
  const avoid = new Set(input.avoidPointIds)
  const takesCrate = (offer: HaulOffer) =>
    offer.boxSizes.length === 0 ||
    offer.boxSizes.some((size) => {
      const rounded = Math.round(size)
      return rounded >= input.minCrateScu && rounded <= input.maxCrateScu
    })
  const ranked = input.sells
    .filter((offer) => offer.commodity === input.commodity && !avoid.has(offer.pointId) && takesCrate(offer))
    .map((offer) => ({ offer, km: input.km(input.fromId, offer.pointId) }))
    .filter((row) => Number.isFinite(row.km))
    .sort((a, b) => a.km - b.km || b.offer.price - a.offer.price)
  const best = ranked[0]
  if (!best) return null
  const scu = Math.min(Math.round(input.scu), best.offer.stockScu ?? Number.POSITIVE_INFINITY)
  return scu > 0 ? { offer: best.offer, scu, km: best.km } : null
}

function retargetSell(input: HaulRouteInput, sell: HaulStop, destination: HaulOffer, scu: number, cashBefore: number): HaulPlan | null {
  const crates = cratesForQuantity(scu, boxSizesFor(input.buys, sell.commodity, input.stops[input.step - 1]?.pointId || sell.pointId), input.maxCrateScu)
  const updated: HaulStop = {
    ...sell,
    pointId: destination.pointId,
    place: destination.place,
    scu,
    crates,
    pricePerScu: destination.price,
    cashBefore,
    cashAfter: cashBefore + Math.round(scu * destination.price),
    uexStatus: destination.uexStatus,
    uexVerifiedAt: destination.uexVerifiedAt,
  }
  return finishPlan(continueAfter([...input.stops.slice(0, input.step), updated], input, Math.floor(input.step / 2) + 1), input.trades)
}

/** Nothing sold here. The next stop stays a sale, at the next place that buys this cargo. */
export function rerouteUnsold(input: HaulRouteInput, avoidPointIds: string[]): HaulPlan | null {
  const sell = input.stops[input.step]
  const buy = input.stops[input.step - 1]
  if (!sell || sell.kind !== 'sell') return null
  const destination = nextSellLocation({
    commodity: sell.commodity,
    fromId: sell.pointId,
    buyPrice: buy?.pricePerScu || 0,
    sells: input.sells,
    avoidPointIds: [...avoidPointIds, sell.pointId],
    km: input.km,
  })
  if (!destination) return null
  return retargetSell(input, sell, destination, sell.scu, sell.cashBefore)
}

/** Some of the load sold. Sell the rest at the next buyer before the route buys again. */
export function applyPartialSell(input: HaulRouteInput, soldScu: number, avoidPointIds: string[]): HaulPlan | null {
  const sell = input.stops[input.step]
  const buy = input.stops[input.step - 1]
  const sold = Math.round(soldScu)
  if (!sell || sell.kind !== 'sell' || sold <= 0 || sold >= sell.scu) return null
  const destination = nextSellLocation({
    commodity: sell.commodity,
    fromId: sell.pointId,
    buyPrice: buy?.pricePerScu || 0,
    sells: input.sells,
    avoidPointIds: [...avoidPointIds, sell.pointId],
    km: input.km,
  })
  if (!destination) return null
  const cashBefore = sell.cashBefore + Math.round(sold * sell.pricePerScu)
  return retargetSell(input, sell, destination, sell.scu - sold, cashBefore)
}
