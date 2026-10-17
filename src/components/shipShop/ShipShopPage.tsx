import { useEffect, useMemo, useState } from 'react'
import BlueprintSlotQualityCard from '../BlueprintSlotQualityCard'
import { useAuth } from '../../contexts/AuthContext'
import {
  SHIP_SECTIONS,
  SHIPS,
  blueprintForEntity,
  defaultCraftQualities,
  getShip,
  partsForPort,
  portsForSection,
  fittedPowerParts,
  snapshotForBuild,
  statsForFitted,
  stockPorts,
  type FittedPart,
  type GameShip,
  type ShipBuild,
  type ShipPort,
  type ShipShopStore,
} from '../../lib/shipShopData'
import {
  clickPowerColumn,
  columnSelected,
  columnTotal,
  compareToStock,
  formatSignedPercent,
  partStatLine,
  powerColumns,
  powerGenerated,
  powerUsed,
  togglePowerColumn,
  weaponStatBits,
} from '../../lib/shipShopMath'
import { defaultShipShopLoadouts, fetchShipShopLoadouts, saveShipShopLoadouts } from '../../lib/shipShopOps'

const CHIP = 'px-3 py-1.5 text-sm font-medium rounded-lg site-btn-shimmer'

function formatNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return Math.round(value).toLocaleString()
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${Math.round(value)}%`
}

function toneClass(tone: 'up' | 'down' | 'same'): string {
  if (tone === 'up') return 'text-emerald-400'
  if (tone === 'down') return 'text-red-400'
  return 'text-white'
}

function ShipSnapshot({
  ship,
  build,
  onPower,
}: {
  ship: GameShip | null
  build: ShipBuild
  onPower: (groupId: string, count: number) => void
}) {
  const snapshot = snapshotForBuild(ship, build.ports, build.power)
  const stockPortsForShip = ship ? stockPorts(ship) : {}
  const stock = snapshotForBuild(ship, stockPortsForShip, null)
  const powerParts = ship ? fittedPowerParts(ship, build.ports) : []
  const columns = powerColumns(ship?.weaponPowerPool || 0, powerParts)
  const generated = powerGenerated(powerParts)
  const used = powerUsed(columns, build.power)
  const remaining = generated > 0 ? generated - used : Number.POSITIVE_INFINITY
  const rows = [
    {
      title: 'Offense',
      lines: [
        ['Burst DPS', formatNumber(snapshot.burstDps), compareToStock(snapshot.burstDps, stock.burstDps)],
        ['Sustained DPS', formatNumber(snapshot.sustainedDps), compareToStock(snapshot.sustainedDps, stock.sustainedDps)],
        ['Missile volley', formatNumber(snapshot.missileVolley), compareToStock(snapshot.missileVolley, stock.missileVolley)],
      ],
    },
    {
      title: 'Defense',
      lines: [
        ['Shield HP', formatNumber(snapshot.shieldHp), compareToStock(snapshot.shieldHp, stock.shieldHp)],
        ['Shield regen', snapshot.shieldRegen ? `${formatNumber(snapshot.shieldRegen)}/s` : '—', compareToStock(snapshot.shieldRegen, stock.shieldRegen)],
        ['Armor', formatNumber(snapshot.armorHp), compareToStock(snapshot.armorHp, stock.armorHp)],
        ['Deflection', 'deflection', 'same'],
        ['Physical reduction', formatPercent(snapshot.physicalReduction), compareToStock(snapshot.physicalReduction, stock.physicalReduction)],
        ['Energy reduction', formatPercent(snapshot.energyReduction), compareToStock(snapshot.energyReduction, stock.energyReduction)],
        ['EM signature', formatSignedPercent(snapshot.signalEm), compareToStock(snapshot.signalEm, stock.signalEm, true)],
        ['IR signature', formatSignedPercent(snapshot.signalIr), compareToStock(snapshot.signalIr, stock.signalIr, true)],
        ['CS signature', formatSignedPercent(snapshot.signalCs), compareToStock(snapshot.signalCs, stock.signalCs, true)],
      ],
    },
    {
      title: 'Hull',
      lines: [
        ['Hull HP', formatNumber(snapshot.hullHp), compareToStock(snapshot.hullHp, stock.hullHp)],
        ['Vital HP', '—', 'same'],
      ],
    },
    {
      title: 'Maneuverability',
      lines: [
        ['Pitch', formatNumber(snapshot.pitch), compareToStock(snapshot.pitch, stock.pitch)],
        ['Yaw', formatNumber(snapshot.yaw), compareToStock(snapshot.yaw, stock.yaw)],
        ['Roll', formatNumber(snapshot.roll), compareToStock(snapshot.roll, stock.roll)],
      ],
    },
  ] as const

  return (
    <aside className="site-surface rounded-xl p-4 lg:sticky lg:top-[var(--site-header-height,3.5rem)] lg:max-h-[calc(100dvh-var(--site-header-height,3.5rem)-1.5rem)] max-h-[42vh] overflow-y-auto shrink-0 lg:w-80">
      <h2 className="text-sm font-semibold tracking-wide text-slate-300 mb-3">Ship snapshot</h2>
      {columns.length > 0 && (
        <section className="mb-4">
          <div className="flex items-baseline justify-between gap-3 mb-2">
            <h3 className="text-xs uppercase tracking-wide text-slate-500">Power</h3>
            <p className={`font-mono text-xs ${remaining < 0 ? 'text-red-400' : 'text-slate-300'}`} title={remaining < 0 ? `${Math.abs(remaining)} pips beyond what the ship generates` : undefined}>
              {generated > 0 ? `${remaining} / ${generated} pips` : `${used} pips`}
            </p>
          </div>
          <div className="space-y-2">
            {columns.map((column) => {
              const total = columnTotal(column)
              const selected = columnSelected(column, build.power?.[column.id])
              return (
                <div key={column.id}>
                  <button
                    type="button"
                    className="text-xs text-slate-400 hover:text-white"
                    onClick={() => onPower(column.id, togglePowerColumn(column.blocks, selected, remaining))}
                  >
                    {column.label} {selected}/{total}
                  </button>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {column.blocks.map((_, index) => {
                      const on = index < selected
                      const target = on && index === selected - 1 ? index - 1 : index
                      return (
                        <button
                          key={`${column.id}-${index}`}
                          type="button"
                          aria-pressed={on}
                          aria-label={`${column.label} pip ${index + 1}`}
                          className={`h-4 w-4 rounded-sm border ${on ? 'site-filter-selected-orange border-transparent' : 'site-filter-idle'}`}
                          onClick={() => onPower(column.id, clickPowerColumn(column.blocks, selected, target, remaining))}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}
      <div className="space-y-4">
        {rows.map((group) => (
          <section key={group.title}>
            <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">{group.title}</h3>
            <dl className="space-y-1">
              {group.lines.map(([label, value, tone]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 text-sm">
                  <dt className="text-slate-400">{label}</dt>
                  {value === 'deflection' ? (
                    <dd className="font-mono text-right">
                      {snapshot.deflectionPhysical == null && snapshot.deflectionEnergy == null ? (
                        <span className="text-white">—</span>
                      ) : (
                        <>
                          <span className={toneClass(compareToStock(snapshot.deflectionPhysical, stock.deflectionPhysical))}>
                            Phys {formatNumber(snapshot.deflectionPhysical)}
                          </span>
                          <span className="text-slate-500"> · </span>
                          <span className={toneClass(compareToStock(snapshot.deflectionEnergy, stock.deflectionEnergy))}>
                            Energy {formatNumber(snapshot.deflectionEnergy)}
                          </span>
                        </>
                      )}
                    </dd>
                  ) : (
                    <dd className={`font-mono ${toneClass(tone)}`}>{value}</dd>
                  )}
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </aside>
  )
}

function listedPart(item: { displayName: string }) {
  const name = item.displayName.trim()
  return name.length > 0 && !/placeholder/i.test(name) && !name.startsWith('<=')
}

function PartPicker({
  port,
  fitted,
  onClose,
  onSelect,
  onQualities,
  onSource,
}: {
  port: ShipPort
  fitted: FittedPart | undefined
  onClose: () => void
  onSelect: (entityClass: string | null) => void
  onQualities: (qualities: Record<number, number>) => void
  onSource: (source: 'stock' | 'crafted') => void
}) {
  const [query, setQuery] = useState('')
  const options = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return partsForPort(port).filter((item) => listedPart(item) && (!needle || item.displayName.toLowerCase().includes(needle)))
  }, [port, query])
  const current = statsForFitted(fitted)
  const blueprint = fitted ? blueprintForEntity(fitted.entityClass) : null
  const detail = current?.item.kind === 'weapon' ? weaponStatBits(current.stats) : []

  return (
    <div className="relative mt-2 space-y-2">
      <input
        className="site-input w-full px-3 py-2"
        value={query}
        placeholder={`Search size ${port.size || ''} parts`}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="site-dropdown-list max-h-56">
        <button type="button" className="site-dropdown-item" onClick={() => onSelect(null)}>
          Empty mount
        </button>
        {options.map((item) => {
          const bits = item.kind === 'weapon' ? weaponStatBits(item.stats) : [partStatLine(item.kind, item.stats)].filter(Boolean)
          const meta = [item.size ? `S${item.size}` : '', item.damageType, item.manufacturer, item.weaponClass].filter(Boolean).join(' · ')
          return (
            <button
              key={item.entityClass}
              type="button"
              className={`site-dropdown-item ${fitted?.entityClass === item.entityClass ? 'site-dropdown-item-active' : ''}`}
              onClick={() => onSelect(item.entityClass)}
            >
              <span className="block text-white">{item.displayName}</span>
              {meta && <span className="block text-xs text-slate-400">{meta}</span>}
              {bits.length > 0 && <span className="block text-xs text-slate-500">{bits.join(' · ')}</span>}
            </button>
          )
        })}
        {options.length === 0 && <p className="site-empty px-3 py-2">No parts of this size.</p>}
      </div>
      {current && (
        <div className="site-card rounded-xl p-3 space-y-3">
          <div className="site-chip-strip w-fit">
            <button type="button" className={`${CHIP} ${fitted?.source !== 'crafted' ? 'site-filter-selected-orange' : 'site-filter-idle'}`} onClick={() => onSource('stock')}>
              Stock
            </button>
            <button
              type="button"
              className={`${CHIP} ${fitted?.source === 'crafted' ? 'site-filter-selected-orange' : 'site-filter-idle'}`}
              disabled={!blueprint}
              onClick={() => blueprint && onSource('crafted')}
            >
              Crafted
            </button>
          </div>
          {!blueprint && <p className="site-hint text-sm">This part has no blueprint, so it stays stock.</p>}
          {fitted?.source === 'crafted' && blueprint?.slots?.map((slot, index) => (
            <BlueprintSlotQualityCard
              key={index}
              slot={slot}
              slotIndex={index}
              quality={fitted.qualities?.[index] ?? defaultCraftQualities(fitted.entityClass)?.[index] ?? 0}
              onQualityChange={(slotIndex, quality) => {
                onQualities({ ...(fitted.qualities ?? defaultCraftQualities(fitted.entityClass) ?? {}), [slotIndex]: quality })
              }}
              compact
            />
          ))}
          {detail.length > 0 && <p className="text-xs text-slate-400">{detail.join(' · ')}</p>}
          <button type="button" className="site-btn-ghost" onClick={onClose}>Close</button>
        </div>
      )}
    </div>
  )
}

export default function ShipShopPage() {
  const { isOfficerOrAbove } = useAuth()
  const [store, setStore] = useState<ShipShopStore>(() => defaultShipShopLoadouts())
  const [buildIndex, setBuildIndex] = useState(0)
  const [ready, setReady] = useState(false)
  const [saveNote, setSaveNote] = useState<string | null>(null)
  const [shipQuery, setShipQuery] = useState('')
  const [pickerPortId, setPickerPortId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOfficerOrAbove) return
    let cancelled = false
    fetchShipShopLoadouts()
      .then((loaded) => {
        if (!cancelled) {
          setStore(loaded)
          setReady(true)
        }
      })
      .catch(() => {
        if (!cancelled) setSaveNote('Builds could not be loaded yet.')
      })
    return () => {
      cancelled = true
    }
  }, [isOfficerOrAbove])

  useEffect(() => {
    if (!ready || !isOfficerOrAbove) return
    const timer = window.setTimeout(() => {
      saveShipShopLoadouts(store)
        .then(() => setSaveNote(null))
        .catch(() => setSaveNote('The latest build was not saved.'))
    }, 400)
    return () => window.clearTimeout(timer)
  }, [store, ready, isOfficerOrAbove])

  const build = store.builds[buildIndex] ?? store.builds[0]
  const ship = getShip(build?.shipId)
  const pickerPort = ship?.ports.find((port) => port.id === pickerPortId) ?? null
  const shipChoices = useMemo(() => {
    const needle = shipQuery.trim().toLowerCase()
    return SHIPS.filter((entry) => {
      if (!needle) return true
      return `${entry.displayName} ${entry.manufacturer} ${entry.role}`.toLowerCase().includes(needle)
    }).slice(0, 40)
  }, [shipQuery])

  if (!isOfficerOrAbove) return null

  function updateBuild(next: ShipBuild) {
    setStore((prev) => {
      const builds = prev.builds.slice()
      builds[buildIndex] = next
      return { version: 1, builds }
    })
  }

  function chooseShip(shipId: string) {
    const nextShip = getShip(shipId)
    if (!nextShip) return
    updateBuild({ shipId: nextShip.id, ports: stockPorts(nextShip) })
    setShipQuery('')
  }

  function setFitted(portId: string, part: FittedPart | null) {
    if (!build) return
    const ports = { ...build.ports }
    if (!part) delete ports[portId]
    else ports[portId] = part
    updateBuild({ shipId: build.shipId, ports, power: build.power })
  }

  return (
    <div className="flex flex-col lg:flex-row lg:items-start gap-4">
      <ShipSnapshot
        ship={ship}
        build={build}
        onPower={(groupId, count) => {
          if (!build) return
          updateBuild({ shipId: build.shipId, ports: build.ports, power: { ...build.power, [groupId]: count } })
        }}
      />
      <div className="min-w-0 flex-1 space-y-4">
        <div className="site-surface rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1>
              <img src="/fuzys-ship-shop.jpg" alt="Fuzy's Ship Shop" className="h-14 w-auto object-contain" />
            </h1>
            <p className="site-hint text-sm">{saveNote || (ready ? 'Builds save on this account.' : 'Loading builds…')}</p>
          </div>
          <label className="block">
            <span className="site-label">Ship</span>
            <input
              className="site-input w-full px-3 py-2 mt-1"
              value={shipQuery}
              placeholder={ship?.displayName || 'Search ships'}
              onChange={(event) => setShipQuery(event.target.value)}
            />
          </label>
          {shipQuery && (
            <div className="site-dropdown-list max-h-56 overflow-y-auto">
              {shipChoices.map((entry) => (
                <button key={entry.id} type="button" className="site-dropdown-item w-full text-left" onClick={() => chooseShip(entry.id)}>
                  {entry.displayName}
                </button>
              ))}
            </div>
          )}
          {ship && (
            <p className="text-sm text-slate-300">
              {ship.manufacturer} · {ship.role || ship.career || 'Ship'}
            </p>
          )}
          <div className="site-chip-strip w-fit max-w-full">
            <span className="px-2 text-sm text-slate-400">Build {buildIndex + 1} of 4</span>
            {store.builds.map((entry, index) => (
              <button
                key={index}
                type="button"
                className={`${CHIP} ${index === buildIndex ? 'site-filter-selected-orange' : 'site-filter-idle'}`}
                onClick={() => setBuildIndex(index)}
              >
                {entry.shipId ? getShip(entry.shipId)?.displayName || `Build ${index + 1}` : `Build ${index + 1}`}
              </button>
            ))}
          </div>
          {ship && (
            <div className="site-chip-strip w-fit max-w-full">
              {SHIP_SECTIONS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={`${CHIP} site-filter-idle`}
                  onClick={() => document.getElementById(`ship-section-${section.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  {section.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {ship && SHIP_SECTIONS.map((section) => {
          const ports = portsForSection(ship, section.id)
          return (
            <section key={section.id} id={`ship-section-${section.id}`} className="site-surface rounded-xl p-4 scroll-mt-24">
              <h2 className="text-sm font-semibold text-slate-200 mb-3">{section.label}</h2>
              {section.id === 'hull' && (
                <p className="text-sm text-slate-400 mb-3">
                  Hull {formatNumber(ship.hullHp)} · SCM {formatNumber(ship.scmSpeed)} · Boost {formatNumber(ship.boostSpeed)}
                </p>
              )}
              <div className="space-y-2">
                {ports.map((port) => {
                  const fitted = statsForFitted(build.ports[port.id])
                  const line = fitted ? partStatLine(fitted.item.kind, fitted.stats) : ''
                  return (
                    <button
                      key={port.id}
                      type="button"
                      className="site-card w-full rounded-xl p-3 text-left"
                      onClick={() => setPickerPortId(port.id)}
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs uppercase tracking-wide text-slate-500">S{port.size || '—'}</span>
                        <span className="text-xs text-slate-500">{port.label}</span>
                      </div>
                      <p className="text-white mt-1">{fitted?.item.displayName || 'Empty mount'}</p>
                      <p className="text-sm text-slate-400 mt-1">
                        {fitted
                          ? [line, build.ports[port.id]?.source === 'crafted' ? 'Crafted' : 'Stock'].filter(Boolean).join(' · ')
                          : 'Open port'}
                      </p>
                    </button>
                  )
                })}
                {ports.length === 0 && <p className="site-hint text-sm">No ports in this section.</p>}
              </div>
            </section>
          )
        })}
      </div>
      {pickerPort && (
        <PartPicker
          port={pickerPort}
          fitted={build.ports[pickerPort.id]}
          onClose={() => setPickerPortId(null)}
          onSelect={(entityClass) => {
            if (!entityClass) {
              setFitted(pickerPort.id, null)
              return
            }
            setFitted(pickerPort.id, { entityClass, source: 'stock' })
          }}
          onSource={(source) => {
            const current = build.ports[pickerPort.id]
            if (!current) return
            setFitted(pickerPort.id, {
              ...current,
              source,
              qualities: source === 'crafted' ? (current.qualities ?? defaultCraftQualities(current.entityClass)) : current.qualities,
            })
          }}
          onQualities={(qualities) => {
            const current = build.ports[pickerPort.id]
            if (!current) return
            setFitted(pickerPort.id, { ...current, source: 'crafted', qualities })
          }}
        />
      )}
    </div>
  )
}
