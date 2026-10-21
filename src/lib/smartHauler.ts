import { SHOP_COMMODITIES, getCommodityTradeInfo, terminalPlace } from './shopLookup'
import { navMap, pointById, resolveShopPlace, type NavMap } from './navSystems'

export const HAUL_NEAR_KM = 300
export const HAUL_MAX_TRADES = 20

const CRATE_SCU = [1, 2, 4, 8, 16, 32]

export interface HaulOffer {
  commodity: string
  pointId: string
  place: string
  price: number
  boxSizes: number[]
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
}

export interface HaulPlan {
  stops: HaulStop[]
  profit: number
  trades: number
  cash: number
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
    const load = packHaulLoad(cargoScu, maxCrateScu, buy.boxSizes, buy.price, state.cash)
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
  let beam: HaulState[] = [{ pointId: input.startId, cash: Math.round(input.cash), profit: 0, stops: [] }]

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
            const load = packHaulLoad(input.cargoScu, input.maxCrateScu, buy.boxSizes, buy.price, state.cash)
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
      })
    }
  }
  return { buys, sells }
}
