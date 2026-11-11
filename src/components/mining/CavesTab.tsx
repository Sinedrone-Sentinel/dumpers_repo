import React, { useMemo, useState } from 'react'
import SiteTooltip from '../SiteTooltip'
import { navMap, type NavPoint } from '../../lib/navSystems'
import {
  caveBodies,
  caveDisplayName,
  caveSites,
  formatKm,
  headingCardinal,
  smartCaveRoute,
  type CaveSite,
} from '../../lib/caveNav'

const SYSTEM_ORDER = ['stanton', 'pyro', 'nyx']

function startPoints() {
  const order = new Map(SYSTEM_ORDER.map((id, index) => [id, index]))
  return [...navMap.points].sort((a, b) => {
    const system = (order.get(a.system) ?? 9) - (order.get(b.system) ?? 9)
    if (system !== 0) return system
    return a.name.localeCompare(b.name)
  })
}

const STARTS = startPoints()

function startMatches(point: NavPoint, term: string): boolean {
  if (!term) return true
  const systemName = navMap.systems.find((system) => system.id === point.system)?.name ?? ''
  return `${point.name} ${systemName}`.toLowerCase().includes(term)
}

export default function CavesTab() {
  const firstStart = STARTS[0]
  const [startId, setStartId] = useState(firstStart?.id ?? '')
  const [startText, setStartText] = useState(firstStart?.name ?? '')
  const [startOpen, setStartOpen] = useState(false)
  const [openSystems, setOpenSystems] = useState<Set<string>>(() => new Set(SYSTEM_ORDER))
  const [openBodies, setOpenBodies] = useState<Set<string>>(() => new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selectedStart = STARTS.find((point) => point.id === startId) ?? null
  const startChoices = useMemo(() => {
    const term = startText.trim().toLowerCase()
    const showingAll = term.length === 0 || term === (selectedStart?.name ?? '').toLowerCase()
    return STARTS.filter((point) => showingAll || startMatches(point, term))
  }, [startText, selectedStart])

  const systems = useMemo(() => {
    const bySystem = new Map<string, { id: string; name: string; bodies: { id: string; name: string; label: string; caves: CaveSite[] }[] }>()
    for (const body of caveBodies) {
      const caves = caveSites
        .filter((cave) => cave.bodyId === body.id)
        .sort((a, b) => caveDisplayName(a).localeCompare(caveDisplayName(b)))
      if (caves.length === 0) continue
      const system = bySystem.get(body.systemId) ?? {
        id: body.systemId,
        name: body.systemName,
        bodies: [],
      }
      system.bodies.push({ id: body.id, name: body.name, label: body.label, caves })
      bySystem.set(body.systemId, system)
    }
    return [...bySystem.values()]
      .map((system) => ({
        ...system,
        bodies: system.bodies.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => (SYSTEM_ORDER.indexOf(a.id) === -1 ? 9 : SYSTEM_ORDER.indexOf(a.id)) - (SYSTEM_ORDER.indexOf(b.id) === -1 ? 9 : SYSTEM_ORDER.indexOf(b.id)))
  }, [])

  const selected = caveSites.find((cave) => cave.id === selectedId) ?? null
  const body = selected ? caveBodies.find((entry) => entry.id === selected.bodyId) ?? null : null
  const route = selected && startId ? smartCaveRoute(startId, selected) : null

  function toggle(set: Set<string>, id: string, update: (next: Set<string>) => void) {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    update(next)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] items-start">
      <section className="site-section min-w-0">
        <div className="site-section-header space-y-3">
          <SiteTooltip
            side="top"
            content="Where you are now. Type to search. The route uses the same system jumps as Smart Hauler, then the markers on the cave's planet or moon."
          >
            <label className="relative block">
              <span className="site-label">Starting location</span>
              <input
                className="site-input mt-1 w-full px-3 py-2"
                value={startText}
                onFocus={(event) => {
                  setStartOpen(true)
                  event.currentTarget.select()
                }}
                onChange={(event) => {
                  const value = event.target.value
                  setStartText(value)
                  setStartOpen(true)
                  const exact = STARTS.find((point) => point.name.toLowerCase() === value.trim().toLowerCase())
                  if (exact) setStartId(exact.id)
                }}
                onBlur={(event) => {
                  const next = event.relatedTarget
                  if (next instanceof Node && event.currentTarget.parentElement?.contains(next)) return
                  setStartOpen(false)
                  if (selectedStart) setStartText(selectedStart.name)
                }}
              />
              {startOpen && (
                <div className="site-dropdown-list left-0 right-0 top-full z-40 max-h-72 overflow-y-auto">
                  {startChoices.length === 0 ? (
                    <p className="site-hint px-3 py-2">No matching location.</p>
                  ) : SYSTEM_ORDER.map((systemId) => {
                    const points = startChoices.filter((point) => point.system === systemId)
                    if (points.length === 0) return null
                    const systemName = navMap.systems.find((system) => system.id === systemId)?.name ?? systemId
                    return (
                      <div key={systemId}>
                        <p className="site-menu-section">{systemName}</p>
                        {points.map((point) => (
                          <button
                            key={point.id}
                            type="button"
                            className={`site-dropdown-item w-full text-left ${point.id === startId ? 'site-dropdown-item-active' : ''}`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              setStartId(point.id)
                              setStartText(point.name)
                              setStartOpen(false)
                            }}
                          >
                            {point.name}
                          </button>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </label>
          </SiteTooltip>
        </div>
        <div className="site-section-body max-h-[70vh] overflow-y-auto !space-y-1">
          {systems.map((system) => {
            const systemOpen = openSystems.has(system.id)
            return (
              <div key={system.id}>
                <button
                  type="button"
                  className="site-dropdown-item font-medium"
                  onClick={() => toggle(openSystems, system.id, setOpenSystems)}
                >
                  {systemOpen ? '▾' : '▸'} {system.name}
                </button>
                {systemOpen && system.bodies.map((entry) => {
                  const bodyOpen = openBodies.has(entry.id)
                  return (
                    <div key={entry.id} className="pl-3">
                      <button
                        type="button"
                        className="site-dropdown-item"
                        onClick={() => toggle(openBodies, entry.id, setOpenBodies)}
                      >
                        {bodyOpen ? '▾' : '▸'} {entry.name}
                        <span className="site-hint ml-2">{entry.caves.length}</span>
                      </button>
                      {bodyOpen && (
                        <div className="pl-3">
                          <p className="site-menu-section text-xs font-medium text-slate-300">Cave</p>
                          {entry.caves.map((cave) => {
                            const active = cave.id === selectedId
                            return (
                              <button
                                key={cave.id}
                                type="button"
                                className={`site-dropdown-item text-left ${active ? 'site-dropdown-item-active' : ''}`}
                                onClick={() => setSelectedId(cave.id)}
                              >
                                {caveDisplayName(cave)}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </section>

      <section className="site-section min-w-0">
        <div className="site-section-header">
          <h2 className="text-base font-semibold text-white">Smart Route</h2>
        </div>
        <div className="site-section-body">
          {!selected || !body || !route ? (
            <p className="site-empty">Pick a cave. The route starts from the location selected on the left.</p>
          ) : !route.reachable ? (
            <p className="site-empty">No jump path from that starting location to {body.name}.</p>
          ) : (
            <div className="space-y-4 text-sm text-slate-200">
              <p>
                <span className="text-white">{caveDisplayName(selected)}</span>
                <span className="site-hint"> on {body.name}</span>
              </p>
              <ol className="list-decimal space-y-2 pl-5">
                {route.surface.useOmDescent ? (
                  <>
                    {route.alreadyThere ? (
                      <li>You are already at {route.bodyName}.</li>
                    ) : (
                      route.jumps.map((jump) => (
                        <li key={jump}>{jump}.</li>
                      ))
                    )}
                    <li>
                      Quantum travel to <span className="text-white">{route.surface.omDescent.marker}</span> at {route.bodyName}. Do not quantum travel to {route.bodyName}. A quantum trip to the planet does not fly in a straight line.
                    </li>
                    <li>
                      From {route.surface.omDescent.marker}, point at the middle of {route.bodyName} and fly in until you reach the surface.
                    </li>
                    <li>
                      On the surface, fly heading approximately{' '}
                      <span className="text-white">
                        {Math.round(route.surface.omDescent.heading)}° {headingCardinal(route.surface.omDescent.heading)}
                      </span>
                      . The cave is approximately {formatKm(route.surface.omDescent.approxKm)} from there. You cannot hold an exact straight line, so the heading will drift and the distance is approximate.
                    </li>
                  </>
                ) : (
                  <>
                    {route.alreadyThere ? (
                      <li>You are already at {route.bodyName}.</li>
                    ) : (
                      <>
                        {route.jumps.map((jump) => (
                          <li key={jump}>{jump}.</li>
                        ))}
                        <li>Quantum travel to {route.bodyName}.</li>
                      </>
                    )}
                    <li>
                      On {route.bodyName}, the closest orbital markers to this cave are{' '}
                      {route.surface.markers.map((marker, index) => (
                        <span key={marker.name}>
                          {index > 0 ? ', ' : ''}
                          <span className="text-white">{marker.name}</span> {formatKm(marker.km)}
                        </span>
                      ))}
                      .
                    </li>
                    {route.surface.place && (
                      <li>
                        Nearest named location: <span className="text-white">{route.surface.place.name}</span>,{' '}
                        {formatKm(route.surface.place.km)} from the cave. From there, fly heading{' '}
                        <span className="text-white">
                          {Math.round(route.surface.place.heading)}° {headingCardinal(route.surface.place.heading)}
                        </span>{' '}
                        for {formatKm(route.surface.place.km)}. From the cave, {route.surface.place.name} is back on heading{' '}
                        {Math.round(route.surface.place.backHeading)}° {headingCardinal(route.surface.place.backHeading)}.
                      </li>
                    )}
                  </>
                )}
              </ol>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
