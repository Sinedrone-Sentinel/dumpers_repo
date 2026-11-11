import React, { useMemo, useState } from 'react'
import SiteTooltip from '../SiteTooltip'
import { navMap } from '../../lib/navSystems'
import {
  caveBodies,
  caveSites,
  caveTags,
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

export default function CavesTab() {
  const [startId, setStartId] = useState(STARTS[0]?.id ?? '')
  const [query, setQuery] = useState('')
  const [openSystems, setOpenSystems] = useState<Set<string>>(() => new Set(SYSTEM_ORDER))
  const [openBodies, setOpenBodies] = useState<Set<string>>(() => new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const systems = useMemo(() => {
    const term = query.trim().toLowerCase()
    const bySystem = new Map<string, { id: string; name: string; bodies: { id: string; name: string; label: string; caves: CaveSite[] }[] }>()
    for (const body of caveBodies) {
      const caves = caveSites
        .filter((cave) => cave.bodyId === body.id)
        .filter((cave) => {
          if (!term) return true
          const tags = caveTags(cave).join(' ')
          return `${body.label} ${body.name} ${tags}`.toLowerCase().includes(term)
        })
        .sort((a, b) => caveTags(a).join().localeCompare(caveTags(b).join()))
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
  }, [query])

  const selected = caveSites.find((cave) => cave.id === selectedId) ?? null
  const body = selected ? caveBodies.find((entry) => entry.id === selected.bodyId) ?? null : null
  const route = selected && startId ? smartCaveRoute(startId, selected) : null
  const filtering = query.trim().length > 0

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
            content="Where you are now. The route uses the same system jumps as Smart Hauler, then the markers on the cave's planet or moon."
          >
            <label className="block">
              <span className="site-label">Starting location</span>
              <select
                className="site-input mt-1 w-full px-3 py-2"
                value={startId}
                onChange={(event) => setStartId(event.target.value)}
              >
                {SYSTEM_ORDER.map((systemId) => {
                  const points = STARTS.filter((point) => point.system === systemId)
                  if (points.length === 0) return null
                  const systemName = navMap.systems.find((system) => system.id === systemId)?.name ?? systemId
                  return (
                    <optgroup key={systemId} label={systemName}>
                      {points.map((point) => (
                        <option key={point.id} value={point.id}>
                          {point.name}
                        </option>
                      ))}
                    </optgroup>
                  )
                })}
              </select>
            </label>
          </SiteTooltip>
          <SiteTooltip side="top" content="Hides caves whose tags do not include this text.">
            <label className="block">
              <span className="site-label">Filter caves</span>
              <input
                className="site-input mt-1 w-full px-3 py-2"
                value={query}
                placeholder="Biome, size, or moon"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </SiteTooltip>
        </div>
        <div className="site-section-body max-h-[70vh] overflow-y-auto !space-y-1">
          {systems.length === 0 ? (
            <p className="site-empty">No caves match that filter.</p>
          ) : systems.map((system) => {
            const systemOpen = filtering || openSystems.has(system.id)
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
                  const bodyOpen = filtering || openBodies.has(entry.id)
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
                            const tags = caveTags(cave)
                            const active = cave.id === selectedId
                            return (
                              <button
                                key={cave.id}
                                type="button"
                                className={`site-dropdown-item ${active ? 'site-dropdown-item-active' : ''}`}
                                onClick={() => setSelectedId(cave.id)}
                              >
                                <span className="block text-xs text-slate-400">{entry.label}</span>
                                <span className="mt-1 flex flex-wrap gap-1">
                                  {tags.map((tag) => (
                                    <span key={tag} className="site-badge-slate">
                                      {tag}
                                    </span>
                                  ))}
                                </span>
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
                <span className="text-white">{body.label}</span>
                <span className="site-hint"> on {body.name}</span>
              </p>
              <ol className="list-decimal space-y-2 pl-5">
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
                {route.surface.place ? (
                  <li>
                    Nearest named location: <span className="text-white">{route.surface.place.name}</span>,{' '}
                    {formatKm(route.surface.place.km)} from the cave. From there, fly heading{' '}
                    <span className="text-white">
                      {Math.round(route.surface.place.heading)}° {headingCardinal(route.surface.place.heading)}
                    </span>{' '}
                    for {formatKm(route.surface.place.km)}. From the cave, {route.surface.place.name} is back on heading{' '}
                    {Math.round(route.surface.place.backHeading)}° {headingCardinal(route.surface.place.backHeading)}.
                  </li>
                ) : (
                  <li>This body has no named surface location in the files to aim from. Use the orbital markers above.</li>
                )}
              </ol>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
