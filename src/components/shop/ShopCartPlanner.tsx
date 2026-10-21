import { Fragment, useEffect, useRef, useState } from 'react'
import AppModal from '../layout/AppModal'
import ShopRouteHeader, { type RouteHeaderSettings } from '../nav/ShopRouteHeader'
import { describeJumps, navMap, systemById } from '../../lib/navSystems'
import { removeShopCartLine, type ShopCartLine } from '../../lib/shopCart'
import { offersForShopLine, shopCartLineKey } from '../../lib/shopCartRoute'
import { planShopRoute, type ShopRouteLine, type ShopRouteMode, type ShopRouteResult, type ShopRouteStopLine } from '../../lib/shopRoute'

const ROUTE_NOTICE: Record<ShopRouteMode, string> = {
  fewest: 'This route uses the fewest stops. These are not the only places that sell these.',
  cheapest: 'Each line is bought at the lowest price in the systems you included.',
  efficient: 'Stations and jump gateways are used when they sell the line. A surface landing is marked when that is the only place.',
}

type MissingInSystems = {
  id: string
  label: string
  systemIds: string[]
  systemNames: string[]
}

type RouteGap = {
  nowhere: Array<{ id: string; label: string }>
  outside: MissingInSystems[]
  settings: RouteHeaderSettings
  routeLines: ShopRouteLine[]
}

function money(value: number): string {
  return `${Math.round(value).toLocaleString()} aUEC`
}

function purchasesByStore(lines: ShopRouteStopLine[]): Array<{ store: string; lines: ShopRouteStopLine[] }> {
  const groups: Array<{ store: string; lines: ShopRouteStopLine[] }> = []
  for (const line of lines) {
    const store = line.store || 'Shop'
    const found = groups.find((group) => group.store === store)
    if (found) found.lines.push(line)
    else groups.push({ store, lines: [line] })
  }
  return groups
}

function classify(lines: ShopCartLine[], settings: RouteHeaderSettings): RouteGap {
  const selected = new Set(settings.systems)
  const nowhere: RouteGap['nowhere'] = []
  const outside: MissingInSystems[] = []
  const routeLines: ShopRouteLine[] = []
  for (const line of lines) {
    const offers = offersForShopLine(line)
    const label = line.qty > 1 ? `${line.name} × ${line.qty}` : line.name
    const id = shopCartLineKey(line)
    if (offers.length === 0) {
      nowhere.push({ id, label })
      continue
    }
    const picked = offers.filter((offer) => selected.has(offer.systemId))
    if (picked.length === 0) {
      const systemIds = [...new Set(offers.map((offer) => offer.systemId))]
      outside.push({
        id,
        label,
        systemIds,
        systemNames: systemIds.map((systemId) => systemById(navMap, systemId)?.name || systemId),
      })
      continue
    }
    routeLines.push({
      id,
      label,
      offers: picked.map((offer) => ({ pointId: offer.pointId, price: offer.price, store: offer.store })),
    })
  }
  return { nowhere, outside, settings, routeLines }
}

export default function ShopCartPlanner({ lines }: { lines: ShopCartLine[] }) {
  const priced = lines.filter((line) => line.shop && line.price && line.price > 0)
  const [route, setRoute] = useState<ShopRouteResult | null>(null)
  const [routeMode, setRouteMode] = useState<ShopRouteMode>('fewest')
  const [includeSystems, setIncludeSystems] = useState<string[]>([])
  const [includeToken, setIncludeToken] = useState(0)
  const [gap, setGap] = useState<RouteGap | null>(null)
  const [gapStep, setGapStep] = useState<'nowhere' | 'outside' | null>(null)
  const [emptyNote, setEmptyNote] = useState(false)
  const keepRouteFor = useRef<string | null>(null)
  const signature = lines.map((line) => `${shopCartLineKey(line)}:${line.qty}`).join('|')

  useEffect(() => {
    if (keepRouteFor.current === signature) {
      keepRouteFor.current = null
      return
    }
    setRoute(null)
    setEmptyNote(false)
  }, [signature])

  const ship = priced.find((line) => line.id.startsWith('ship:'))
  const publish = (settings: RouteHeaderSettings, routeLines: ShopRouteLine[]) => {
    setRouteMode(settings.mode)
    setEmptyNote(false)
    setRoute(planShopRoute({
      nav: navMap,
      lines: routeLines,
      startId: settings.startId,
      systems: settings.systems,
      mode: settings.mode,
      firstLineId: settings.shipFirst && ship && routeLines.some((line) => line.id === shopCartLineKey(ship))
        ? shopCartLineKey(ship)
        : null,
    }))
  }
  const calculate = (settings: RouteHeaderSettings) => {
    if (priced.length === 0) {
      setRoute(null)
      setGap(null)
      setGapStep(null)
      setEmptyNote(true)
      return
    }
    const next = classify(priced, settings)
    setGap(next)
    if (next.nowhere.length > 0) {
      setGapStep('nowhere')
      setRoute(null)
      return
    }
    if (next.outside.length > 0) {
      setGapStep('outside')
      setRoute(null)
      return
    }
    setGapStep(null)
    publish(settings, next.routeLines)
  }
  const closeNowhere = () => {
    if (!gap) return
    if (gap.outside.length > 0) {
      setGapStep('outside')
      return
    }
    setGap(null)
    setGapStep(null)
  }
  const includeMissing = () => {
    if (!gap) return
    const extra = [...new Set(gap.outside.flatMap((row) => row.systemIds))]
    const systems = [...new Set([...gap.settings.systems, ...extra])]
    setIncludeSystems(extra)
    setIncludeToken((token) => token + 1)
    const next = classify(priced, { ...gap.settings, systems })
    setGap(null)
    setGapStep(null)
    publish({ ...gap.settings, systems }, next.routeLines)
  }
  const dropMissing = () => {
    if (!gap) return
    const dropIds = new Set(gap.outside.map((row) => row.id))
    const remaining = lines.filter((line) => !dropIds.has(shopCartLineKey(line)))
    keepRouteFor.current = remaining.map((line) => `${shopCartLineKey(line)}:${line.qty}`).join('|')
    for (const line of lines) {
      if (dropIds.has(shopCartLineKey(line))) removeShopCartLine(line.id, line.shop)
    }
    setGap(null)
    setGapStep(null)
    publish(gap.settings, gap.routeLines)
  }
  const routeTotal = route ? route.legs.reduce((sum, leg) => sum + leg.stop.total, 0) : 0

  return (
    <div className="space-y-4">
      <ShopRouteHeader
        callerId="shop-cart"
        lineCount={priced.length}
        shipAvailable={priced.some((line) => line.id.startsWith('ship:'))}
        includeSystems={includeSystems}
        includeToken={includeToken}
        onCalculate={calculate}
      />
      {emptyNote && (
        <p className="site-hint text-xs">Add an item from a Buy row to give it a shop and a price. A line without a shop cannot be routed.</p>
      )}
      {route && (
        <>
          <p className="site-banner-info">{ROUTE_NOTICE[routeMode]}</p>
          {routeTotal > 0 && <p className="text-sm font-semibold text-white">Route total {money(routeTotal)}</p>}
          {route.legs.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-white">Stops</h3>
              <ol className="mt-2 space-y-3">
                {route.legs.map((leg, index) => (
                  <Fragment key={`${leg.stop.pointId}-${index}`}>
                    {describeJumps(leg.hops).map((sentence, hopIndex) => (
                      <li key={`${sentence}-${hopIndex}`} className="site-card p-3">
                        <p className="text-sm font-semibold text-white">
                          {sentence}
                          <span className="site-badge-slate ml-2">System jump</span>
                        </p>
                      </li>
                    ))}
                    <li className="site-card p-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-sm font-semibold text-white">
                          {leg.stop.name}
                          {leg.stop.surface && <span className="site-badge-amber ml-2">Surface landing</span>}
                        </p>
                        <p className="shrink-0 text-sm text-white">{money(leg.stop.total)}</p>
                      </div>
                      <div className="mt-3 space-y-3">
                        {purchasesByStore(leg.stop.lines).map((group) => (
                          <div key={group.store}>
                            <p className="text-sm font-medium text-white">{group.store}</p>
                            <ul className="mt-1 space-y-1">
                              {group.lines.map((line) => (
                                <li key={`${group.store}:${line.id}`} className="flex items-baseline justify-between gap-3 pl-3 text-sm">
                                  <span className="min-w-0 text-white">{line.label}</span>
                                  <span className="shrink-0 text-sky-300">{money(line.price)}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </li>
                  </Fragment>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
      {gapStep === 'nowhere' && gap && (
        <AppModal title="Not sold anywhere" onClose={closeNowhere} size="md" zIndex={80}>
          <p className="text-sm text-white">These items are not sold in any system. Remove them from the cart, then calculate again.</p>
          <ul className="mt-3 space-y-2">
            {gap.nowhere.map((row) => (
              <li key={row.id} className="site-card p-3 text-sm font-semibold text-white">{row.label}</li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <button type="button" className="site-btn-primary px-3 py-1.5 text-sm" onClick={closeNowhere}>Close</button>
          </div>
        </AppModal>
      )}
      {gapStep === 'outside' && gap && (
        <AppModal title="Not sold in the selected systems" onClose={() => setGapStep(null)} size="md" zIndex={80}>
          <p className="text-sm text-white">These items are not sold in the systems you included. Include the systems that sell them, or drop them from the cart. Either choice calculates the route again.</p>
          <ul className="mt-3 space-y-2">
            {gap.outside.map((row) => (
              <li key={row.id} className="site-card p-3">
                <p className="text-sm font-semibold text-white">{row.label}</p>
                <p className="site-hint mt-1 text-sm">Sold in {row.systemNames.join(', ')}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" className="site-btn-secondary px-3 py-1.5 text-sm" onClick={dropMissing}>Drop these items</button>
            <button type="button" className="site-btn-primary px-3 py-1.5 text-sm" onClick={includeMissing}>Include those systems</button>
          </div>
        </AppModal>
      )}
    </div>
  )
}
