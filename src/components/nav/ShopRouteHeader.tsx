import { useEffect, useId, useMemo, useRef, useState } from 'react'
import SiteTooltip from '../SiteTooltip'
import {
  navMap,
  pointById,
  readCallerMode,
  readCallerSystems,
  readRouteStart,
  readShipFirst,
  searchNavPoints,
  systemById,
  writeCallerMode,
  writeCallerSystems,
  writeRouteStart,
  writeShipFirst,
  type NavMap,
} from '../../lib/navSystems'
import type { ShopRouteMode } from '../../lib/shopRoute'

export interface RouteHeaderSettings {
  startId: string | null
  systems: string[]
  mode: ShopRouteMode
  shipFirst: boolean
}

const MODES: Array<{ id: ShopRouteMode; label: string }> = [
  { id: 'fewest', label: 'Fewest Stops' },
  { id: 'cheapest', label: 'Cheapest Route' },
  { id: 'efficient', label: 'Efficient Route' },
]

export default function ShopRouteHeader({
  callerId,
  lineCount,
  shipAvailable = false,
  nav = navMap,
  includeSystems,
  includeToken = 0,
  onCalculate,
}: {
  callerId: string
  lineCount: number
  shipAvailable?: boolean
  nav?: NavMap
  /** Systems to check, in addition to the ones already on. */
  includeSystems?: string[]
  /** Bumps when includeSystems should be applied again. */
  includeToken?: number
  onCalculate: (settings: RouteHeaderSettings) => void
}) {
  const listId = useId()
  const radioName = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const hasLines = lineCount > 0
  const [open, setOpen] = useState(hasLines)
  const [startId, setStartId] = useState<string | null>(() => readRouteStart(nav))
  const [systems, setSystems] = useState<string[]>(() => readCallerSystems(callerId, nav))
  const [mode, setMode] = useState<ShopRouteMode>(() => readCallerMode(callerId))
  const [shipFirst, setShipFirst] = useState(() => readShipFirst(callerId))
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(false)
  const [highlight, setHighlight] = useState(0)

  useEffect(() => {
    setOpen(hasLines)
  }, [hasLines])

  useEffect(() => {
    if (!includeToken || !includeSystems?.length) return
    const adding = includeSystems.filter((id) => nav.systems.some((system) => system.id === id))
    if (adding.length === 0) return
    setSystems((current) => {
      const next = [...new Set([...current, ...adding])]
      if (next.length === current.length && next.every((id) => current.includes(id))) return current
      writeCallerSystems(callerId, next)
      return next
    })
  }, [includeToken, includeSystems, callerId, nav.systems])

  const selected = pointById(nav, startId)
  const selectedLabel = selected
    ? `${selected.name} · ${systemById(nav, selected.system)?.name || selected.system}`
    : ''
  const matches = useMemo(
    () => (editing ? searchNavPoints(query, nav) : []),
    [editing, query, nav],
  )

  useEffect(() => {
    setHighlight(0)
  }, [query, matches.length])

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setEditing(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const chooseStart = (id: string) => {
    const point = pointById(nav, id)
    if (!point) return
    setStartId(point.id)
    writeRouteStart(point.id)
    setSystems((current) => {
      if (current.includes(point.system)) return current
      const next = [...current, point.system]
      writeCallerSystems(callerId, next)
      return next
    })
    setQuery('')
    setEditing(false)
  }

  const clearStart = () => {
    setStartId(null)
    writeRouteStart(null)
    setQuery('')
    setEditing(false)
  }

  const toggleSystem = (id: string) => {
    setSystems((current) => {
      const has = current.includes(id)
      if (has && current.length === 1) return current
      const next = has ? current.filter((system) => system !== id) : [...current, id]
      writeCallerSystems(callerId, next)
      return next
    })
  }

  const pickMode = (next: ShopRouteMode) => {
    setMode(next)
    writeCallerMode(callerId, next)
  }

  const toggleShipFirst = (on: boolean) => {
    setShipFirst(on)
    writeShipFirst(callerId, on)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setEditing(false)
      return
    }
    if (!editing || matches.length === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((index) => Math.min(index + 1, matches.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter' && matches[highlight]) {
      event.preventDefault()
      chooseStart(matches[highlight].id)
    }
  }

  return (
    <div className="site-card p-3">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
        disabled={!hasLines}
        onClick={() => {
          if (hasLines) setOpen((value) => !value)
        }}
      >
        <span className="text-sm font-semibold text-white">Route</span>
        <span className="text-xs text-slate-300">{hasLines ? (open ? 'Hide' : 'Show') : 'Add something to the cart'}</span>
      </button>
      {open && hasLines && (
        <div className="mt-3 space-y-3">
          <div ref={wrapRef} className="relative">
            <label className="site-label" htmlFor={`${listId}-start`}>Starting location</label>
            <input
              id={`${listId}-start`}
              className="site-input mt-1 w-full px-3 py-2"
              type="text"
              value={editing ? query : selectedLabel}
              placeholder="Planet, moon, station, city, or jump gateway"
              autoComplete="off"
              aria-autocomplete="list"
              aria-expanded={editing && matches.length > 0}
              aria-controls={listId}
              onFocus={() => {
                setEditing(true)
                setQuery('')
              }}
              onChange={(event) => {
                setQuery(event.target.value)
                setEditing(true)
                if (event.target.value === '') clearStart()
              }}
              onKeyDown={onKeyDown}
            />
            {editing && matches.length > 0 && (
              <ul id={listId} role="listbox" className="site-dropdown-list z-30 mt-1 max-h-56">
                {matches.map((hit, index) => (
                  <li key={hit.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === highlight}
                      className={index === highlight ? 'site-dropdown-item site-dropdown-item-active' : 'site-dropdown-item'}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => chooseStart(hit.id)}
                    >
                      {hit.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {shipAvailable && (
            <SiteTooltip
              content="Check this if you will fly the ship to the other shops to fit the parts."
              side="top"
              ignoreOverlayPause
            >
              <label className={`flex items-center gap-2 text-sm ${startId ? 'text-slate-100' : 'text-slate-400'}`}>
                <input
                  type="checkbox"
                  className="site-checkbox"
                  checked={shipFirst}
                  disabled={!startId}
                  onChange={(event) => toggleShipFirst(event.target.checked)}
                />
                Ship First
              </label>
            </SiteTooltip>
          )}
          <fieldset>
            <legend className="site-label">Included shopping areas</legend>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {nav.systems.map((system) => (
                <label key={system.id} className="flex items-center gap-2 text-sm text-slate-100">
                  <input
                    type="checkbox"
                    className="site-checkbox"
                    checked={systems.includes(system.id)}
                    onChange={() => toggleSystem(system.id)}
                  />
                  {system.name}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="site-label">Route</legend>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
              {MODES.map((entry) => (
                <label key={entry.id} className="flex items-center gap-2 text-sm text-slate-100">
                  <input
                    type="radio"
                    className="site-radio"
                    name={radioName}
                    checked={mode === entry.id}
                    onChange={() => pickMode(entry.id)}
                  />
                  {entry.label}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            className="site-btn-primary px-3 py-1.5 text-sm"
            disabled={lineCount === 0}
            onClick={() => onCalculate({
              startId,
              systems,
              mode,
              shipFirst: shipAvailable && Boolean(startId) && shipFirst,
            })}
          >
            Calculate
          </button>
        </div>
      )}
    </div>
  )
}
