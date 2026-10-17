import { useEffect, useMemo, useState, type ReactNode } from 'react'
import BlueprintSlotQualityCard from '../BlueprintSlotQualityCard'
import { useAuth } from '../../contexts/AuthContext'
import {
  SHIP_SECTIONS,
  SHIPS,
  applyPortFit,
  blueprintForEntity,
  defaultCraftQualities,
  getShip,
  missileSlotsForRack,
  partsForPort,
  portsForSection,
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
  columnTotal,
  flightRole,
  formatQuantumSpeed,
  partStatLine,
  powerColumns,
  powerGenerated,
  powerUsed,
  resolvedPower,
  togglePowerColumn,
  weaponBurstDps,
  weaponStatBits,
  type PowerBlock,
  type ShipItemStats,
} from '../../lib/shipShopMath'
import { getShipItem } from '../../lib/shipItemCatalog'
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

function formatSignature(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—'
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return Math.round(value).toLocaleString()
}

const PLAIN_KINDS = new Set(['weapon', 'missile', 'torpedo', 'flight', 'missileRack', 'weaponMount'])

function itemTitle(item: { displayName: string; kind?: string; itemClass?: string | null; grade?: string | null }): string {
  if (item.kind && PLAIN_KINDS.has(item.kind)) return item.displayName
  const rank = [item.itemClass, item.grade].filter(Boolean).join(' ')
  return rank ? `${item.displayName} - ${rank}` : item.displayName
}

function CoolantBar({ snapshot }: { snapshot: ShipSnapshotNumbers }) {
  if (snapshot.coolant <= 0 && snapshot.coolantDemand <= 0) return null
  const ratio = snapshot.coolantDemand > 0 ? snapshot.coolant / snapshot.coolantDemand : 1
  const covered = ratio >= 1
  const percent = Math.round(ratio * 100)
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-slate-400">Coolant</span>
        <span className="font-mono text-white">{percent}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, percent))}%`, background: covered ? '#FBBF24' : '#EF4444' }} />
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
  onPower: (groupId: string, count: number) => void
}) {
  const used = powerUsed(columns, power)
  if (columns.length === 0) return null
  return (
    <div className="flex items-end gap-3 overflow-x-auto pb-1">
      <p className="self-center font-mono text-xs text-slate-300 whitespace-nowrap">
        {generated > 0 ? `${remaining} / ${generated}` : `${used}`}
      </p>
      {columns.map((column) => {
        const total = columnTotal(column)
        const selected = power[column.id] || 0
        const flags = blockFlags(column.blocks, selected)
        const top = flags.lastIndexOf(true)
        const groups = pipGroups(column.blocks)
        return (
          <div key={column.id} className="flex flex-col items-center">
            <div className="flex items-end gap-1">
              {groups.map((group, groupIndex) => (
                <div key={`${column.id}-${groupIndex}`} className="flex flex-col-reverse items-center gap-0.5">
                  {group.map((block) => {
                    const index = column.blocks.indexOf(block)
                    const on = flags[index]
                    const target = on && index === top ? index - 1 : index
                    return (
                      <button
                        key={`${column.id}-${index}`}
                        type="button"
                        aria-pressed={on}
                        aria-label={`${column.label} ${block.size > 1 ? `${block.size} connected pips` : `pip ${index + 1}`}`}
                        className={`w-3.5 rounded-sm border text-[10px] font-semibold leading-none ${on ? 'border-amber-200 bg-orange-400 text-slate-950' : 'border-slate-500 bg-slate-950 text-slate-600'}`}
                        style={{ height: block.size > 1 ? `${block.size * 14 + 6}px` : '14px' }}
                        onClick={() => onPower(column.id, clickPowerColumn(column.blocks, selected, target, remaining))}
                      >
                        {block.size > 1 ? block.size : ''}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
            <button
              type="button"
              className="mt-1 text-[11px] text-slate-400 hover:text-white whitespace-nowrap"
              onClick={() => onPower(column.id, togglePowerColumn(column.blocks, selected, remaining))}
            >
              {column.label}
            </button>
            <span className="font-mono text-[10px] text-slate-500">{selected}/{total}</span>
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
        ['NAV', formatNumber(snapshot.navSpeed), 'same'],
        ['Pitch', formatNumber(snapshot.pitch), 'same'],
        ['Yaw', formatNumber(snapshot.yaw), 'same'],
        ['Roll', formatNumber(snapshot.roll), 'same'],
        ['Quantum', formatQuantumSpeed(snapshot.quantumSpeed), 'same'],
      ],
    },
  ] as const

  return (
    <aside className="site-surface rounded-xl p-4 max-h-[42vh] overflow-y-auto shrink-0 lg:max-h-none lg:w-80">
      <h2 className="text-sm font-semibold tracking-wide text-slate-300 mb-3">Ship snapshot</h2>
      <div className="space-y-4">
        {rows.map((group) => (
          <section key={group.title}>
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
        ))}
      </div>
      <CoolantBar snapshot={snapshot} />
    </aside>
  )
}

function pipGroups(blocks: PowerBlock[]): PowerBlock[][] {
  const groups: PowerBlock[][] = []
  for (const block of blocks) {
    if (block.groupStart || groups.length === 0) groups.push([])
    groups[groups.length - 1].push(block)
  }
  return groups
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

function listChip(item: { kind: string; weaponClass?: string | null; guidance?: string | null }): string | null {
  if (item.kind === 'weapon') return item.weaponClass || null
  if (item.kind === 'missile') return item.guidance || null
  return null
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
    <div className="relative mt-2 space-y-2">
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
        <button type="button" className="site-dropdown-item" onClick={() => onSelect(null)}>
          Empty mount
        </button>
        {options.map((item) => {
          const bits = item.kind === 'weapon' ? weaponStatBits(item.stats) : [partStatLine(item.kind, item.stats)].filter(Boolean)
          return (
            <button
              key={item.entityClass}
              type="button"
              className={`site-dropdown-item ${fitted?.entityClass === item.entityClass ? 'site-dropdown-item-active' : ''}`}
              onClick={() => onSelect(item.entityClass)}
            >
              <span className="block text-white">{titled(item)}</span>
              {bits.length > 0 && <span className="block text-sm text-slate-200">{bits.join(' · ')}</span>}
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
    <div className="space-y-4">
      <div className="sticky top-[var(--site-header-height,3.5rem)] z-20 site-surface-solid p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1>
              <img src="/fuzys-ship-shop.jpg" alt="Fuzy's Ship Shop" className="h-20 w-auto object-contain" />
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
              {SHIP_SECTIONS.filter((section) => sectionHasPorts(ship, section.id)).map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={`${CHIP} ${expanded.size === 1 && expanded.has(section.id) ? 'site-filter-selected-orange' : 'site-filter-idle'}`}
                  onClick={() => {
                    setExpanded(new Set([section.id]))
                    document.getElementById(`ship-section-${section.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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
            onPower={(groupId, count) => {
              updateBuild({ shipId: build.shipId, ports: build.ports, power: { ...build.power, [groupId]: count } })
            }}
          />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
      <ShipSnapshot snapshot={snapshot} />
      <div className="min-w-0 flex-1 space-y-4">
        {ship && SHIP_SECTIONS.filter((section) => sectionHasPorts(ship, section.id)).map((section) => {
          const ports = portsForSection(ship, section.id)
          const renderPort = (port: ShipPort, nested = false) => {
            const fitted = statsForFitted(build.ports[port.id])
            const line = fitted ? partStatLine(fitted.item.kind, fitted.stats) : ''
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
            return (
              <div key={port.id} className={`${nested ? 'ml-6 border-l border-orange-500/30 pl-3' : ''}`}>
                <div
                  className="site-card rounded-xl p-3"
                  data-ship-port={port.id}
                  onClick={(event) => {
                    if (port.locked) return
                    const target = event.target
                    if (target instanceof Element && target.closest('button, input, a, label')) return
                    setPickerPortId(open ? null : port.id)
                  }}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-xs uppercase tracking-wide text-slate-500">{sizeLabel}</span>
                    <span className="text-xs text-slate-500">{port.locked ? `${port.label} · Locked` : port.label}</span>
                  </div>
                  <div className="mt-1 flex w-full flex-wrap items-baseline gap-x-3 gap-y-1 text-left">
                    <span className="text-lg font-medium text-white">{name}</span>
                    <span className="text-base text-slate-300">{info}</span>
                  </div>
                  {fitted && !port.locked && (
                    <div className="mt-2">
                      <button type="button" className="site-btn-ghost px-3 py-1 text-sm" onClick={() => setFitted(port, null)}>
                        Clear
                      </button>
                    </div>
                  )}
                  {open && (
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
                  )}
                </div>
              </div>
            )
          }
          const openSection = expanded.has(section.id)
          const renderWeaponNodes = (nodes: ReturnType<typeof weaponTree>, nested = false): ReactNode => nodes.map((node) => (
            <div key={node.port.id} className="space-y-2">
              {renderPort(node.port, nested)}
              {node.children.length > 0 && renderWeaponNodes(node.children, true)}
            </div>
          ))
          return (
            <section key={section.id} id={`ship-section-${section.id}`} className="site-surface rounded-xl p-4 scroll-mt-64">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-200">{section.label}</h2>
                <button
                  type="button"
                  className="site-btn-ghost px-3 py-1 text-sm"
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
                    ? renderWeaponNodes(weaponTree(ship))
                    : ports.map((port) => (
                      <div key={port.id} className="space-y-2">
                        {renderPort(port)}
                        {(port.kind === 'missileRack' || port.kind === 'torpedo') && missileSlotsForRack(ship, port, build.ports[port.id]).map((slot) => renderPort(slot, true))}
                      </div>
                    ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
      </div>
    </div>
  )
}
