import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import BlueprintSlotQualityCard from '../BlueprintSlotQualityCard'
import { useAuth } from '../../contexts/AuthContext'
import {
  SHIP_SECTIONS,
  SHIPS,
  applyPortFit,
  blueprintForEntity,
  defaultCraftQualities,
  fitPartOnPorts,
  getShip,
  matchingCopyPorts,
  missileSlotsForRack,
  effectivePortKind,
  emptyBuild,
  partsForPort,
  portsForSection,
  weaponCopyGroups,
  weaponTree,
  fittedPowerParts,
  snapshotForBuild,
  statsForFitted,
  type ShipSnapshotNumbers,
  stockPorts,
  type FittedPart,
  type GameShip,
  type ShipBuild,
  type ShipPort,
  type ShipShopStore,
} from '../../lib/shipShopData'
import {
  clickPowerColumn,
  componentGroups,
  flightRole,
  formatQuantumSpeed,
  formatShopNumber,
  partStatLine,
  powerColumns,
  powerGenerated,
  powerUsed,
  resolvedPower,
  shieldPowerFactor,
  togglePowerColumn,
  weaponBurstDps,
  weaponStatBits,
  wrapPipBlocks,
  type ShipItemStats,
} from '../../lib/shipShopMath'
import { getShipItem } from '../../lib/shipItemCatalog'
import { defaultShipShopLoadouts, fetchShipShopLoadouts, saveShipShopLoadouts } from '../../lib/shipShopOps'

const CHIP = 'px-3 py-1.5 text-sm font-medium rounded-lg site-btn-shimmer'
const PIP_WRAP_LIMIT = 8

function stackedPartKind(kind: string): boolean {
  return kind === 'weapon' || kind === 'missile' || kind === 'torpedo' || kind === 'missileRack'
}

function findRenderedPort(ship: GameShip, fitted: Record<string, FittedPart>, portId: string): ShipPort | null {
  const walk = (nodes: ReturnType<typeof weaponTree>): ShipPort | null => {
    for (const node of nodes) {
      if (node.port.id === portId) return node.port
      const child = walk(node.children)
      if (child) return child
    }
    return null
  }
  return ship.ports.find((port) => port.id === portId) || walk(weaponTree(ship, fitted))
}

/** 1080p and 1440p wrap a stack after 8 pips. Wider windows keep one column. */
function useCompactPipWrap(): boolean {
  const query = '(max-width: 2560px)'
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const onChange = () => setCompact(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return compact
}

function formatNumber(value: number | null | undefined): string {
  return formatShopNumber(value)
}

function formatPercent(value: number | null | undefined): string {
  const text = formatShopNumber(value)
  return text === '—' ? text : `${text}%`
}

function formatSignature(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—'
  if (value < 1000) {
    const text = formatShopNumber(value)
    return text.includes('.') ? text : `${text}.0`
  }
  const kilo = Math.trunc(value / 100) / 10
  const text = formatShopNumber(kilo)
  return `${text.includes('.') ? text : `${text}.0`}k`
}

const PLAIN_KINDS = new Set(['weapon', 'missile', 'torpedo', 'flight', 'missileRack', 'weaponMount'])

function itemTitle(item: { displayName: string; kind?: string; itemClass?: string | null; grade?: string | null }): string {
  if (item.kind && PLAIN_KINDS.has(item.kind)) return item.displayName
  const rank = [item.itemClass, item.grade].filter(Boolean).join(' ')
  return rank ? `${item.displayName} - ${rank}` : item.displayName
}

function CoolantBar({ snapshot }: { snapshot: ShipSnapshotNumbers }) {
  if (snapshot.coolant <= 0 && snapshot.coolantDemand <= 0) return null
  const supply = snapshot.coolant
  const demand = snapshot.coolantDemand
  const percent = supply > 0 ? Math.floor((demand / supply) * 100) : 0
  const over = supply > 0 && percent >= 100
  const width = supply > 0 ? Math.max(0, Math.min(100, percent)) : 0
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-slate-400">Coolant</span>
        <span className="font-mono text-white">{percent}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: over ? '#EF4444' : '#FBBF24' }} />
      </div>
    </div>
  )
}

function PipBoard({
  columns,
  power,
  remaining,
  generated,
  onPower,
}: {
  columns: ReturnType<typeof powerColumns>
  power: Record<string, number>
  remaining: number
  generated: number
  onPower: (patch: Record<string, number>, columnId: string) => void
}) {
  const used = powerUsed(columns, power)
  const wrap = useCompactPipWrap()
  if (columns.length === 0) return null
  return (
    <div className="flex min-w-0 max-w-full items-end gap-4 overflow-x-auto pb-1">
      <p className="ship-shop-pip-remain self-center font-mono text-slate-300 whitespace-nowrap">
        {generated > 0 ? `${remaining} / ${generated}` : `${used}`}
      </p>
      {columns.map((column) => {
        const groups = componentGroups(column)
        const selected = groups.reduce((sum, group) => sum + (power[group.key] || 0), 0)
        return (
          <div key={column.id} className="flex flex-col items-center">
            <div className="flex items-end gap-1">
              {groups.map((group) => {
                const count = power[group.key] || 0
                const flags = blockFlags(group.blocks, count)
                const top = flags.lastIndexOf(true)
                return (
                  <div key={group.key} className="flex flex-col items-center">
                    <div className="flex items-end gap-px">
                      {(wrap ? wrapPipBlocks(group.blocks, PIP_WRAP_LIMIT) : [group.blocks]).map((columnBlocks, columnIndex) => (
                        <div key={`${group.key}-${columnIndex}`} className="flex flex-col-reverse items-center gap-0.5">
                          {columnBlocks.map((block) => {
                            const index = group.blocks.indexOf(block)
                            const on = flags[index]
                            const target = on && index === top ? index - 1 : index
                            return (
                              <button
                                key={`${group.key}-${index}`}
                                type="button"
                                aria-pressed={on}
                                disabled={block.disabled}
                                aria-label={`${column.label} ${block.disabled ? 'unused pip' : block.size > 1 ? `${block.size} connected pips` : `pip ${index + 1}`}`}
                                className={`ship-shop-pip rounded-sm border font-semibold leading-none ${block.disabled ? 'ship-shop-pip-disabled' : on ? 'border-amber-200 bg-orange-400 text-slate-950' : 'border-slate-500 bg-slate-950 text-slate-600'}`}
                                style={{
                                  width: 'var(--ship-pip-size)',
                                  height: block.size > 1
                                    ? `calc(${block.size} * var(--ship-pip-size) + ${block.size - 1} * var(--ship-pip-gap))`
                                    : 'var(--ship-pip-size)',
                                }}
                                onClick={() => onPower({ [group.key]: clickPowerColumn(group.blocks, count, target, remaining) }, column.id)}
                              >
                                {block.size > 1 ? block.size : ''}
                              </button>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
            <button
              type="button"
              className="ship-shop-pip-label mt-1 text-slate-400 hover:text-white whitespace-nowrap"
              onClick={() => {
                const patch: Record<string, number> = {}
                if (groups.length === 1) {
                  const group = groups[0]
                  patch[group.key] = togglePowerColumn(group.blocks, power[group.key] || 0, remaining)
                } else if (selected > 0) {
                  for (const group of groups) patch[group.key] = 0
                } else {
                  let left = remaining
                  for (const group of groups) {
                    const next = togglePowerColumn(group.blocks, 0, left)
                    patch[group.key] = next
                    left = Math.max(0, left - next)
                  }
                }
                onPower(patch, column.id)
              }}
            >
              {column.label}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function ShipSnapshot({ snapshot }: { snapshot: ShipSnapshotNumbers }) {
  const rows = [
    {
      title: 'Signatures',
      lines: [
        ['IR', formatSignature(snapshot.signatureIr), 'same'],
        ['EM', formatSignature(snapshot.signatureEm), 'same'],
        ['CS', formatSignature(snapshot.signatureCs), 'same'],
      ],
    },
    {
      title: 'Offense',
      lines: [
        ['Burst DPS', formatNumber(snapshot.burstDps), 'same'],
        ['Sustained DPS', formatNumber(snapshot.sustainedDps), 'same'],
        ['Missile volley', formatNumber(snapshot.missileVolley), 'same'],
        ['Radar', snapshot.radarRange ? `${formatNumber(snapshot.radarRange)} m` : '—', 'same'],
      ],
    },
    {
      title: 'Defense',
      lines: [
        ['Shield HP', formatNumber(snapshot.shieldHp), 'same'],
        ['Shield regen', snapshot.shieldRegen ? `${formatNumber(snapshot.shieldRegen)}/s` : '—', 'same'],
        ['Armor', formatNumber(snapshot.armorHp), 'same'],
        ['Deflection', 'deflection', 'same'],
        ['Physical reduction', formatPercent(snapshot.physicalReduction), 'same'],
        ['Energy reduction', formatPercent(snapshot.energyReduction), 'same'],
        ['Noise', formatNumber(snapshot.noise), 'same'],
        ['Decoy', formatNumber(snapshot.decoy), 'same'],
      ],
    },
    {
      title: 'Hull',
      lines: [
        ['Hull HP', formatNumber(snapshot.hullHp), 'same'],
      ],
    },
    {
      title: 'Maneuverability',
      lines: [
        ['SCM', formatNumber(snapshot.scmSpeed), 'same'],
        ['Boosted', formatNumber(snapshot.boostSpeed), 'same'],
        ['Reverse', formatNumber(snapshot.reverseSpeed), 'same'],
        ['NAV', formatNumber(snapshot.navSpeed), 'same'],
        ['Pitch', formatNumber(snapshot.pitch), 'same'],
        ['Yaw', formatNumber(snapshot.yaw), 'same'],
        ['Roll', formatNumber(snapshot.roll), 'same'],
        ['Quantum', formatQuantumSpeed(snapshot.quantumSpeed), 'same'],
      ],
    },
  ] as const

  return (
    <aside className="site-surface rounded-xl p-4 max-h-[42vh] overflow-y-auto shrink-0 lg:min-h-full lg:max-h-none lg:w-full">
      <h2 className="text-sm font-semibold tracking-wide text-slate-300 mb-3">Ship snapshot</h2>
      <div className="space-y-4">
        {rows.map((group) => (
          <div key={group.title} className="space-y-4">
            <section>
              <h3 className="text-xs uppercase tracking-wide text-slate-500 mb-2">{group.title}</h3>
              <dl className="space-y-1">
                {group.lines.map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3 text-sm">
                    <dt className="text-slate-400 inline-flex items-center gap-1.5">
                      {group.title === 'Signatures' && <SignatureMark kind={label} />}
                      {label}
                    </dt>
                    {value === 'deflection' ? (
                      <dd className="font-mono text-right text-white">
                        {snapshot.deflectionPhysical == null && snapshot.deflectionEnergy == null ? (
                          <span>—</span>
                        ) : (
                          <>
                            <span>Phys {formatNumber(snapshot.deflectionPhysical)}</span>
                            <span className="text-slate-500"> · </span>
                            <span>Energy {formatNumber(snapshot.deflectionEnergy)}</span>
                          </>
                        )}
                      </dd>
                    ) : (
                      <dd className="font-mono text-white">{value}</dd>
                    )}
                  </div>
                ))}
              </dl>
            </section>
            {group.title === 'Signatures' ? <CoolantBar snapshot={snapshot} /> : null}
          </div>
        ))}
      </div>
    </aside>
  )
}

function blockFlags(blocks: PowerBlock[], selected: number): boolean[] {
  let left = selected
  return blocks.map((block) => {
    const on = left >= block.size
    if (on) left -= block.size
    return on
  })
}

function SignatureMark({ kind }: { kind: string }) {
  const color = kind === 'EM' ? '#FBBF24' : '#FB923C'
  if (kind === 'CS') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M7 1.2 12.2 7 7 12.8 1.8 7 Z" fill="none" stroke={color} strokeWidth="1.4" />
      </svg>
    )
  }
  if (kind === 'EM') {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <path d="M8 1.2 4.2 7.2h2.4L5.6 12.8 10.2 6.2H7.6Z" fill={color} />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2 9.2c1.6-2.4 2.4-2.4 4 0s2.4 2.4 4 0" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M2 6.2c1.6-2.4 2.4-2.4 4 0s2.4 2.4 4 0" fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

function sectionHasPorts(ship: GameShip, sectionId: string): boolean {
  if (sectionId === 'weapons') return weaponTree(ship).length > 0
  return portsForSection(ship, sectionId).length > 0
}

function listedPart(item: { displayName: string }) {
  const name = item.displayName.trim()
  return name.length > 0 && !/placeholder/i.test(name) && !name.startsWith('<=')
}

function listChip(item: { kind: string; weaponClass?: string | null; guidance?: string | null; itemClass?: string | null }): string | null {
  if (item.kind === 'weapon') return item.weaponClass || null
  if (item.kind === 'missile') return item.guidance || null
  return item.itemClass || null
}

function listScore(item: { kind: string; stats: Record<string, number> }): number {
  const stats = item.stats
  if (item.kind === 'weapon') return weaponBurstDps(stats)
  if (item.kind === 'missile') return stats.Missile_Damage || stats.Weapon_Damage || 0
  if (item.kind === 'shield') return stats.Shield_Maxhealth || 0
  if (item.kind === 'power') return stats.Itemresource_Powergeneration || 0
  if (item.kind === 'cooler') return stats.Itemresource_Coolantgeneration || 0
  if (item.kind === 'quantum') return stats.Quantum_Speed || 0
  if (item.kind === 'radar') return stats.Radar_DistanceMax || 0
  return 0
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
  const [chip, setChip] = useState<string | null>(null)
  const pool = useMemo(() => partsForPort(port).filter(listedPart), [port])
  const chips = useMemo(() => {
    const values = pool.map(listChip).filter((value): value is string => Boolean(value))
    return [...new Set(values)]
  }, [pool])
  const titled = (item: ShipItemStats) => {
    if (item.kind !== 'flight') return itemTitle(item)
    const stock = port.defaultEntityClass ? getShipItem(port.defaultEntityClass) : null
    return `${item.displayName} - ${flightRole(item, stock)}`
  }
  const options = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const ranked = port.kind === 'missileRack'
    return pool
      .filter((item) => !chip || listChip(item) === chip)
      .filter((item) => !needle || titled(item).toLowerCase().includes(needle))
      .sort((a, b) => (ranked ? a.displayName.localeCompare(b.displayName) : listScore(b) - listScore(a) || a.displayName.localeCompare(b.displayName)))
  }, [pool, query, chip, port.kind, port.defaultEntityClass])
  const current = statsForFitted(fitted)
  const blueprint = fitted ? blueprintForEntity(fitted.entityClass) : null
  const detail = current?.item.kind === 'weapon' ? weaponStatBits(current.stats) : []

  return (
    <div className="relative mt-2 space-y-2" onClick={(event) => event.stopPropagation()}>
      <input
        className="site-input w-full px-3 py-2"
        value={query}
        placeholder="Search parts"
        onChange={(event) => setQuery(event.target.value)}
      />
      {chips.length > 1 && (
        <div className="site-chip-strip w-fit max-w-full">
          <button type="button" className={`${CHIP} ${chip == null ? 'site-filter-selected-orange' : 'site-filter-idle'}`} onClick={() => setChip(null)}>
            All
          </button>
          {chips.map((value) => (
            <button key={value} type="button" className={`${CHIP} ${chip === value ? 'site-filter-selected-orange' : 'site-filter-idle'}`} onClick={() => setChip(value)}>
              {value}
            </button>
          ))}
        </div>
      )}
      <div className="site-dropdown-list max-h-56" style={{ position: 'static' }}>
        <button
          type="button"
          className="site-dropdown-item"
          onClick={() => onSelect(null)}
        >
          Empty mount
        </button>
        {options.map((item) => {
          const bits = item.kind === 'weapon' ? weaponStatBits(item.stats) : [partStatLine(item.kind, item.stats)].filter(Boolean)
          const inline = !stackedPartKind(port.kind)
          return (
            <button
              key={item.entityClass}
              type="button"
              className={`site-dropdown-item ${inline ? 'flex items-baseline gap-3' : ''} ${fitted?.entityClass === item.entityClass ? 'site-dropdown-item-active' : ''}`}
              onClick={() => onSelect(item.entityClass)}
            >
              <span className={inline ? 'shrink-0 text-white' : 'block text-white'}>{titled(item)}</span>
              {bits.length > 0 && <span className={inline ? 'truncate text-sm text-slate-200' : 'block text-sm text-slate-200'}>{bits.join(' · ')}</span>}
            </button>
          )
        })}
        {options.length === 0 && <p className="site-empty px-3 py-2">No parts fit this mount.</p>}
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
  const [copyPortId, setCopyPortId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!pickerPortId) return
    function onPointer(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof Element) || target.closest('[data-ship-port]')) return
      setPickerPortId(null)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [pickerPortId])

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
  const shipChoices = useMemo(() => {
    const needle = shipQuery.trim().toLowerCase()
    return SHIPS.filter((entry) => {
      if (!needle) return true
      return `${entry.displayName} ${entry.manufacturer} ${entry.role}`.toLowerCase().includes(needle)
    }).slice(0, 40)
  }, [shipQuery])

  if (!isOfficerOrAbove) return null
  if (!build) return null

  const powerParts = ship ? fittedPowerParts(ship, build.ports) : []
  const columns = powerColumns(ship?.weaponPowerPool || 0, powerParts)
  const generated = powerGenerated(powerParts)
  const power = resolvedPower(columns, build.power, generated)
  const remaining = Math.max(0, generated - powerUsed(columns, power))
  const snapshot = snapshotForBuild(ship, build.ports, build.power)

  function updateBuild(next: ShipBuild) {
    setStore((prev) => {
      const builds = prev.builds.slice()
      builds[buildIndex] = next
      return { version: 1, builds }
    })
  }

  function clearBuild(index: number) {
    setStore((prev) => {
      const builds = prev.builds.slice()
      builds[index] = emptyBuild()
      return { version: 1, builds }
    })
    if (index === buildIndex) setShipQuery('')
  }

  function chooseShip(shipId: string) {
    const nextShip = getShip(shipId)
    if (!nextShip) return
    updateBuild({ shipId: nextShip.id, ports: stockPorts(nextShip) })
    setShipQuery('')
  }

  function setFitted(port: ShipPort, part: FittedPart | null) {
    if (!build) return
    updateBuild({
      shipId: build.shipId,
      ports: applyPortFit(ship, build.ports, port, part),
      power: build.power,
    })
  }

  return (
    <div className="ship-shop-page flex min-w-0 max-w-full flex-col gap-4 lg:flex-row lg:items-start">
      <div className="ship-shop-snap shrink-0">
        <ShipSnapshot snapshot={snapshot} />
      </div>
      <div className="min-w-0 flex-1 space-y-4">
      <div className="ship-shop-header site-surface-solid sticky top-[var(--site-header-height,3.5rem)] z-20 min-w-0 max-w-full p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1>
              <img src="/fuzys-ship-shop.png" alt="Fuzy's Ship Shop" className="w-auto object-contain" style={{ height: 'var(--ship-logo-h)' }} />
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
            {store.builds.map((entry, index) => {
              const used = Boolean(entry.shipId)
              const tone = index === buildIndex ? 'site-filter-selected-orange' : 'site-filter-idle'
              const label = entry.shipId ? getShip(entry.shipId)?.displayName || `Build ${index + 1}` : `Build ${index + 1}`
              return (
                <span key={index} className={used ? 'ship-shop-build' : 'inline-flex'}>
                  <button
                    type="button"
                    className={`${CHIP} ${tone} ${used ? 'ship-shop-build-name' : ''}`}
                    onClick={() => setBuildIndex(index)}
                  >
                    {label}
                  </button>
                  {used && (
                    <button
                      type="button"
                      className={`ship-shop-build-clear ${tone}`}
                      aria-label={`Clear ${label}`}
                      title="Clear build"
                      onClick={() => clearBuild(index)}
                    >
                      ×
                    </button>
                  )}
                </span>
              )
            })}
          </div>
          {ship && (
            <div className="site-chip-strip w-fit max-w-full">
              {SHIP_SECTIONS.filter((section) => sectionHasPorts(ship, section.id)).map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={`${CHIP} ${expanded.size === 1 && expanded.has(section.id) ? 'site-filter-selected-orange' : 'site-filter-idle'}`}
                  onClick={() => {
                    setExpanded(new Set([section.id]))
                    const sectionId = section.id
                    window.requestAnimationFrame(() => {
                      const target = document.getElementById(`ship-section-${sectionId}`)
                      const header = document.querySelector('.ship-shop-header')
                      if (!target) return
                      const offset = header instanceof HTMLElement ? header.getBoundingClientRect().bottom : 0
                      const top = target.getBoundingClientRect().top + window.scrollY - offset - 8
                      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
                    })
                  }}
                >
                  {section.label}
                </button>
              ))}
            </div>
          )}
          </div>
          <PipBoard
            columns={columns}
            power={power}
            remaining={remaining}
            generated={generated}
            onPower={(patch, columnId) => {
              const next = { ...(build.power || {}), ...patch }
              if (!Object.prototype.hasOwnProperty.call(patch, columnId)) delete next[columnId]
              updateBuild({ shipId: build.shipId, ports: build.ports, power: next })
            }}
          />
        </div>
      </div>

        {ship && SHIP_SECTIONS.filter((section) => sectionHasPorts(ship, section.id)).map((section) => {
          const ports = portsForSection(ship, section.id, build.ports)
          const shieldScale = (portId: string) => {
            const part = powerParts.find((entry) => entry.portId === portId)
            if (!part) return 1
            return shieldPowerFactor(part.stats, power[portId] || 0)
          }
          const renderPort = (port: ShipPort, depth = 0) => {
            const fitted = statsForFitted(build.ports[port.id])
            const line = fitted ? partStatLine(fitted.item.kind, fitted.stats, port.kind === 'shield' ? shieldScale(port.id) : 1) : ''
            const source = fitted ? (build.ports[port.id]?.source === 'crafted' ? 'Crafted' : 'Stock') : ''
            const open = pickerPortId === port.id && !port.locked
            const info = fitted ? [line, source].filter(Boolean).join(' · ') : 'Open port'
            const sizeLabel = port.minSize && port.maxSize && port.minSize !== port.maxSize
              ? `S${port.minSize}–${port.maxSize}`
              : `S${port.size || port.maxSize || '—'}`
            const stockBlade = port.kind === 'flight' && port.defaultEntityClass ? getShipItem(port.defaultEntityClass) : null
            const name = fitted
              ? port.kind === 'flight'
                ? `${fitted.item.displayName} - ${flightRole(fitted.item, stockBlade)}`
                : itemTitle(fitted.item)
              : port.kind === 'turret'
                ? port.label
                : 'Empty mount'
            const attachment = port.kind === 'weaponMount' || port.kind === 'turret' || effectivePortKind(port) === 'weaponMount'
            const picker = open ? (
              <PartPicker
                port={port}
                fitted={build.ports[port.id]}
                onClose={() => setPickerPortId(null)}
                onSelect={(entityClass) => {
                  if (!entityClass) {
                    setFitted(port, null)
                    return
                  }
                  setFitted(port, { entityClass, source: 'stock' })
                }}
                onSource={(source) => {
                  const current = build.ports[port.id]
                  if (!current) return
                  setFitted(port, {
                    ...current,
                    source,
                    qualities: source === 'crafted' ? (current.qualities ?? defaultCraftQualities(current.entityClass)) : current.qualities,
                  })
                }}
                onQualities={(qualities) => {
                  const current = build.ports[port.id]
                  if (!current) return
                  setFitted(port, { ...current, source: 'crafted', qualities })
                }}
              />
            ) : null
            const openPicker = (event: MouseEvent) => {
              if (port.locked) return
              const target = event.target
              if (target instanceof Element && target.closest('button, input, a, label')) return
              setPickerPortId(open ? null : port.id)
            }
            const inline = !stackedPartKind(port.kind)
            const copyTargets = port.kind === 'weapon' ? [] : matchingCopyPorts(ship, build.ports, port)
            const addToAll = fitted && !port.locked && (port.kind === 'weapon' || copyTargets.length > 0) ? (
              <button
                type="button"
                className="site-btn-ghost shrink-0 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                onClick={() => {
                  if (port.kind === 'weapon') {
                    setCopyPortId(port.id)
                    return
                  }
                  const part = build.ports[port.id]
                  if (!part) return
                  updateBuild({
                    shipId: build.shipId,
                    ports: fitPartOnPorts(ship, build.ports, copyTargets, { ...part }),
                    power: build.power,
                  })
                }}
              >
                Add to All
              </button>
            ) : null
            return (
              <div
                key={port.id}
                data-ship-port={port.id}
                className={depth > 0 ? 'border-l border-orange-500/30 pl-3' : ''}
                style={depth > 0 ? { marginLeft: `${depth * 1.5}rem` } : undefined}
              >
                {attachment ? (
                  <div className="site-card flex items-center gap-3 rounded-lg px-3 py-1" data-ship-port={port.id} onClick={openPicker}>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs uppercase tracking-wide text-slate-500">{sizeLabel}</span>
                      {addToAll}
                    </span>
                    <span className="truncate text-sm font-medium text-white">{name}</span>
                    <span className="truncate text-sm text-slate-300">{info}</span>
                    <span className="ml-auto shrink-0 text-xs text-slate-500">{port.locked ? `${port.label} · Locked` : port.label}</span>
                    {fitted && !port.locked && (
                      <button type="button" className="site-btn-ghost shrink-0 px-2 py-0.5 text-xs" onClick={() => setFitted(port, null)}>
                        Clear
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="site-card rounded-xl p-3" data-ship-port={port.id} onClick={openPicker}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2">
                        <span className="text-xs uppercase tracking-wide text-slate-500">{sizeLabel}</span>
                        {addToAll}
                      </span>
                      <span className="text-xs text-slate-500">{port.locked ? `${port.label} · Locked` : port.label}</span>
                    </div>
                    <div className={`mt-1 flex w-full gap-3 text-left ${inline ? 'flex-nowrap items-center' : 'flex-wrap items-baseline gap-y-1'}`}>
                      <span className="ship-shop-part-name min-w-0 truncate font-medium text-white">{name}</span>
                      <span className={`text-base text-slate-300 ${inline ? 'min-w-0 truncate' : ''}`}>{info}</span>
                      {inline && fitted && !port.locked && (
                        <button type="button" className="site-btn-ghost ml-auto shrink-0 px-3 py-1 text-sm" onClick={() => setFitted(port, null)}>
                          Clear
                        </button>
                      )}
                    </div>
                    {!inline && fitted && !port.locked && (
                      <div className="mt-2">
                        <button type="button" className="site-btn-ghost px-3 py-1 text-sm" onClick={() => setFitted(port, null)}>
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {picker}
              </div>
            )
          }
          const openSection = expanded.has(section.id)
          const renderWeaponNodes = (nodes: ReturnType<typeof weaponTree>, depth = 0): ReactNode => nodes.map((node) => (
            <div key={node.port.id} className="space-y-1">
              {renderPort(node.port, depth)}
              {node.children.length > 0 && renderWeaponNodes(node.children, depth + 1)}
            </div>
          ))
          return (
            <section key={section.id} id={`ship-section-${section.id}`} className="ship-shop-section site-surface rounded-xl p-4 scroll-mt-64">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-200">{section.label}</h2>
                <button
                  type="button"
                  className="ship-shop-expand site-btn-ghost"
                  onClick={() => setExpanded((current) => {
                    const next = new Set(current)
                    if (next.has(section.id)) next.delete(section.id)
                    else next.add(section.id)
                    return next
                  })}
                >
                  {openSection ? 'Collapse' : 'Expand'}
                </button>
              </div>
              {openSection && (
                <div className="space-y-2 mt-3">
                  {section.id === 'weapons'
                    ? renderWeaponNodes(weaponTree(ship, build.ports))
                    : ports.map((port) => (
                      <div key={port.id} className="space-y-2">
                        {renderPort(port)}
                        {(port.kind === 'missileRack' || port.kind === 'torpedo') && missileSlotsForRack(ship, port, build.ports[port.id]).map((slot) => renderPort(slot, 1))}
                      </div>
                    ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
      {copyPortId && (() => {
        const source = findRenderedPort(ship, build.ports, copyPortId)
        const part = source ? build.ports[source.id] : null
        const groups = source && part ? weaponCopyGroups(ship, build.ports, source) : []
        if (!source || !part) return null
        const paint = (slots: ShipPort[], on: boolean) => {
          const targets = slots.filter((slot) => {
            const current = build.ports[slot.id]?.entityClass
            return on ? current !== part.entityClass : current === part.entityClass
          })
          if (targets.length === 0) return
          updateBuild({
            shipId: build.shipId,
            ports: fitPartOnPorts(
              ship,
              build.ports,
              targets,
              on ? { entityClass: part.entityClass, source: part.source, qualities: part.qualities } : null,
            ),
            power: build.power,
          })
        }
        return (
          <div className="site-modal-backdrop z-50 flex items-start justify-center overflow-y-auto p-6" onClick={() => setCopyPortId(null)}>
            <div
              className="site-modal-shell mt-16 w-full max-w-3xl p-4"
              role="dialog"
              aria-label="Add to all"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-end gap-2">
                <button type="button" className="site-btn-secondary px-3 py-1 text-sm" onClick={() => paint(groups.flatMap((group) => group.slots), true)}>
                  Mark all
                </button>
                <button type="button" className="site-btn-secondary px-3 py-1 text-sm" onClick={() => paint(groups.flatMap((group) => group.slots), false)}>
                  Unmark all
                </button>
                <button type="button" className="site-btn-ghost px-3 py-1 text-sm" aria-label="Close" onClick={() => setCopyPortId(null)}>
                  ×
                </button>
              </div>
              <div className="space-y-4">
                {groups.length === 0 && <p className="site-hint text-sm">No mount of this type can take this weapon.</p>}
                {groups.map((group) => (
                  <div key={group.rootId} className="flex items-start gap-4">
                    <p className="w-44 shrink-0 text-sm font-medium text-slate-100">{group.rootName}</p>
                    <div className="grid flex-1 grid-cols-2 gap-2">
                      {group.slots.map((slot) => {
                        const on = build.ports[slot.id]?.entityClass === part.entityClass
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            className={`${on ? 'site-filter-selected-orange' : 'site-filter-idle'} flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm`}
                            onClick={() => paint([slot], !on)}
                          >
                            <span className={`h-3 w-3 shrink-0 rounded-sm ${on ? 'bg-orange-400' : 'bg-slate-700'}`} />
                            <span className="truncate">{slot.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
