import assert from 'node:assert/strict'
import * as esbuild from 'esbuild'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const outfile = path.join('node_modules', '.cache', 'smart-hauler.mjs')
await esbuild.build({
  entryPoints: [path.join('src', 'lib', 'smartHauler.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile,
  packages: 'external',
})
const hauler = await import(`${pathToFileURL(path.resolve(outfile)).href}?t=${Date.now()}`)

function point(id, system, x) {
  return { id, name: id, aliases: [], system, kind: 'station', surface: false, x, y: 0, z: 0 }
}

const nav = {
  systems: [],
  points: [
    point('a', 'stanton', 0),
    point('b', 'stanton', 200000),
    point('c', 'stanton', 500000),
    point('d', 'pyro', 0),
  ],
  links: [],
}

assert.equal(hauler.pointsAreNear(nav, 'a', 'a'), true)
assert.equal(hauler.pointsAreNear(nav, 'a', 'b'), true)
assert.equal(hauler.pointsAreNear(nav, 'a', 'c'), false)
assert.equal(hauler.pointsAreNear(nav, 'a', 'd'), false)

const packed = hauler.packHaulLoad(10, 16, [32, 1], 5, 100)
assert.equal(packed.scu, 10)
assert.deepEqual(packed.crates, [{ size: 1, count: 10 }])

const near = (fromId, toId) => hauler.pointsAreNear(nav, fromId, toId)
const buys = [
  { commodity: 'Cheap', pointId: 'a', place: 'A', price: 5, boxSizes: [1] },
  { commodity: 'Cheap', pointId: 'b', place: 'B', price: 5, boxSizes: [1] },
  { commodity: 'Expensive', pointId: 'b', place: 'B', price: 20, boxSizes: [1] },
  { commodity: 'Return', pointId: 'b', place: 'B', price: 4, boxSizes: [1] },
]
const sells = [
  { commodity: 'Cheap', pointId: 'b', place: 'B', price: 15, boxSizes: [1] },
  { commodity: 'Cheap', pointId: 'a', place: 'A', price: 8, boxSizes: [1] },
  { commodity: 'Cheap', pointId: 'c', place: 'C', price: 15, boxSizes: [1] },
  { commodity: 'Expensive', pointId: 'c', place: 'C', price: 50, boxSizes: [1] },
  { commodity: 'Return', pointId: 'a', place: 'A', price: 10, boxSizes: [1] },
]

const shared = {
  cargoScu: 10,
  maxCrateScu: 1,
  startId: 'a',
  cash: 50,
  roundRobin: false,
  buys,
  sells,
  near,
}

const two = hauler.planHaul({ ...shared, trades: 2 })
assert.equal(two.stops[0].commodity, 'Cheap')
assert.equal(two.stops[0].scu, 10)
assert.equal(two.stops[0].cashBefore, 50)
assert.equal(two.stops[0].cashAfter, 0)
assert.equal(two.stops[1].cashBefore, 0)
assert.equal(two.stops[1].cashAfter, 150)
assert.equal(two.stops[2].commodity, 'Expensive')
assert.equal(two.stops[2].scu, 7)
assert.equal(two.stops[2].cashBefore, 150)
assert.equal(two.profit, 310)
assert.equal(two.cash, 360)

const goal = hauler.tradesForProfit({ ...shared, goal: 300 })
assert.equal(goal.needed, 2)
const smallGoal = hauler.tradesForProfit({ ...shared, goal: 50 })
assert.equal(smallGoal.needed, 1)
const unreachable = hauler.tradesForProfit({ ...shared, goal: 999999 })
assert.equal(unreachable.needed, null)

const loop = hauler.planHaul({ ...shared, trades: 2, roundRobin: true })
assert.equal(loop.stops[0].commodity, 'Cheap')
assert.equal(loop.stops.at(-1).kind, 'sell')
assert.equal(near('a', loop.stops.at(-1).pointId), true)
assert.notEqual(loop.stops.at(-1).pointId, 'c')
assert.equal(two.stops.at(-1).pointId, 'c')

function km(fromId, toId) {
  const from = nav.points.find((entry) => entry.id === fromId)
  const to = nav.points.find((entry) => entry.id === toId)
  if (!from || !to || from.system !== to.system) return Number.POSITIVE_INFINITY
  return Math.hypot(from.x - to.x, from.y - to.y, from.z - to.z) / 1000
}

const stockBuys = [...buys, { commodity: 'Other', pointId: 'a', place: 'A', price: 6, boxSizes: [1] }]
const stockSells = [...sells, { commodity: 'Other', pointId: 'b', place: 'B', price: 12, boxSizes: [1] }]
const routeInput = {
  stops: two.stops,
  step: 0,
  cargoScu: 10,
  maxCrateScu: 1,
  trades: 2,
  roundRobin: false,
  startId: 'a',
  buys: stockBuys,
  sells: stockSells,
  near,
  km,
}
const alternatives = hauler.buysAtStop({
  pointId: 'a',
  cash: 50,
  cargoScu: 10,
  maxCrateScu: 1,
  buys: stockBuys,
  sells: stockSells,
  near,
  excludeCommodity: 'Cheap',
})
assert.equal(alternatives.some((row) => row.commodity === 'Cheap'), false)
const other = alternatives.find((row) => row.commodity === 'Other')
assert.ok(other)
const swapped = hauler.rerouteUnavailableBuy(routeInput, other)
assert.equal(swapped.stops[0].commodity, 'Other')
assert.equal(swapped.stops[0].pointId, 'a')
assert.equal(swapped.stops[0].scu, 8)
assert.equal(swapped.stops[1].commodity, 'Other')
assert.equal(swapped.stops[1].kind, 'sell')

const partialBuy = hauler.applyPartialBuy({ ...routeInput, buys, sells, stops: two.stops }, 4)
assert.equal(partialBuy.stops[0].scu, 4)
assert.equal(partialBuy.stops[0].cashAfter, 30)
assert.equal(partialBuy.stops[1].scu, 4)
assert.equal(partialBuy.stops[1].cashBefore, 30)
assert.equal(partialBuy.stops[1].cashAfter, 90)
assert.equal(partialBuy.stops[2].commodity, 'Expensive')
assert.equal(partialBuy.stops[2].scu, 4)
assert.equal(partialBuy.stops[2].cashBefore, 90)

assert.equal(hauler.nextSellLocation({
  commodity: 'Cheap',
  fromId: 'b',
  buyPrice: 5,
  sells,
  avoidPointIds: ['b'],
  km,
}).pointId, 'a')
assert.equal(hauler.nextSellLocation({
  commodity: 'Cheap',
  fromId: 'b',
  buyPrice: 5,
  sells: [
    { commodity: 'Cheap', pointId: 'a', place: 'A', price: 3, boxSizes: [1] },
    { commodity: 'Cheap', pointId: 'c', place: 'C', price: 15, boxSizes: [1] },
  ],
  avoidPointIds: ['b'],
  km,
}).pointId, 'c')

const unsold = hauler.rerouteUnsold({ ...routeInput, step: 1, stops: two.stops, buys, sells }, [])
assert.equal(unsold.stops[1].pointId, 'a')
assert.equal(unsold.stops[1].scu, 10)
assert.equal(unsold.stops[1].cashBefore, 0)
assert.equal(unsold.stops[1].cashAfter, 80)
assert.equal(unsold.stops[2].kind, 'buy')
assert.equal(near('a', unsold.stops[2].pointId), true)

const partialSell = hauler.applyPartialSell({ ...routeInput, step: 1, stops: two.stops, buys, sells }, 4, [])
assert.equal(partialSell.stops[1].pointId, 'a')
assert.equal(partialSell.stops[1].scu, 6)
assert.equal(partialSell.stops[1].cashBefore, 60)
assert.equal(partialSell.stops[1].cashAfter, 108)
assert.equal(partialSell.stops[2].kind, 'buy')
assert.equal(hauler.rerouteUnsold({
  ...routeInput,
  step: 1,
  stops: two.stops,
  sells: sells.filter((row) => row.pointId === 'b'),
}, []), null)

const labelFile = path.join('node_modules', '.cache', 'ship-hangar.mjs')
await esbuild.build({
  entryPoints: [path.join('src', 'lib', 'shipHangar.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: labelFile,
  packages: 'external',
  define: {
    'import.meta.env.VITE_SUPABASE_URL': '"http://127.0.0.1"',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '"test-anon-key"',
  },
})
const hangar = await import(`${pathToFileURL(path.resolve(labelFile)).href}?t=${Date.now()}`)
const gladius = { id: '1', shipId: 'gladius', label: 'Aegis Gladius', build: { ports: {} } }
assert.equal(hangar.nextHangarLabel([gladius], 'gladius', 'Aegis Gladius'), 'Aegis Gladius 2')
assert.equal(hangar.nextHangarLabel([], 'gladius', 'Aegis Gladius'), 'Aegis Gladius')
assert.equal(
  hangar.nextHangarLabel(
    [gladius, { ...gladius, id: '2', label: 'Aegis Gladius 2' }],
    'gladius',
    'Aegis Gladius',
  ),
  'Aegis Gladius 3',
)
assert.equal(hangar.hangarCap(false), 10)
assert.equal(hangar.hangarCap(true), 20)

console.log('smart hauler ok')
