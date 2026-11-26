import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { STAR_MAP_ICON_COLORS, starMapMarkerLabel, starMapMarkerReadout, type StarMapMarker } from '../../lib/starMap'
import { getStarMapData } from '../../lib/starMapData'
import type { ServiceGroup, StarMapLocationInfo } from '../../lib/starMapLocationInfo'
import SiteTooltip from '../SiteTooltip'
import { usePanelDrag } from './usePanelDrag'

type InfoModule = typeof import('../../lib/starMapLocationInfo')

let infoModule: Promise<InfoModule> | null = null
function loadInfo(): Promise<InfoModule> {
  infoModule ??= import('../../lib/starMapLocationInfo')
  return infoModule
}

const CARD_W = 360
const EDGE = 8
const LIST_PREVIEW = 12

const RARITY_COLORS: Record<string, string> = {
  legendary: '#ff8000',
  epic: '#a335ee',
  rare: '#3b9cff',
  uncommon: '#1eff00',
  common: '#e2e8f0',
}

const GROUP_STYLE: Record<ServiceGroup, string> = {
  Medical: 'text-rose-300',
  Ships: 'text-sky-300',
  Trade: 'text-amber-300',
  Shopping: 'text-violet-300',
}

const GAS_COLORS = ['#38bdf8', '#a78bfa', '#f472b6', '#facc15', '#34d399', '#fb923c', '#94a3b8']

const HABITAT_TIP: Record<string, string> = {
  surface: 'Found on the surface.',
  caves: 'Found only in caves.',
  both: 'Found on the surface and in caves.',
}

interface Props {
  marker: StarMapMarker
  /** Screen point of the marker inside the map. */
  anchor: { sx: number; sy: number }
  bounds: { w: number; h: number }
  onClose: () => void
  /** Jump button for a jump point. */
  footer?: ReactNode
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <section className="site-section !rounded-lg">
      <button
        type="button"
        className="site-section-header !px-3 !py-1.5 flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-orange-200">
          {title}
          {count != null && <span className="ml-1.5 font-normal text-slate-400">{count}</span>}
        </span>
        <svg className={`h-3 w-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && <div className="space-y-2.5 px-3 py-2.5">{children}</div>}
    </section>
  )
}

function Chip({ children, color, className = '' }: { children: ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border border-slate-600/50 bg-slate-900/70 px-1.5 py-0.5 text-[11px] leading-4 text-slate-200 ${className}`}
      style={color ? { color, borderColor: `${color}55`, backgroundColor: `${color}14` } : undefined}
    >
      {children}
    </span>
  )
}

function ChipList({ items, render, label }: { items: string[]; render?: (item: string) => ReactNode; label: string }) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, LIST_PREVIEW)
  return (
    <div className="flex flex-wrap gap-1" aria-label={label}>
      {shown.map((item) => (
        <span key={item}>{render ? render(item) : <Chip>{item}</Chip>}</span>
      ))}
      {items.length > LIST_PREVIEW && (
        <button type="button" className="site-btn-ghost !px-1.5 !py-0.5 text-[11px]" onClick={() => setAll((v) => !v)}>
          {all ? 'Show less' : `+${items.length - LIST_PREVIEW} more`}
        </button>
      )}
    </div>
  )
}

function SubHead({ children, tip, className = 'text-slate-400' }: { children: ReactNode; tip?: string; className?: string }) {
  const head = <div className={`text-[10px] font-semibold uppercase tracking-wide ${className}`}>{children}</div>
  return tip ? (
    <SiteTooltip side="top" content={tip}>
      <span className="cursor-help" tabIndex={0}>
        {head}
      </span>
    </SiteTooltip>
  ) : (
    head
  )
}

function Stat({ label, value, tip }: { label: string; value: string; tip: string }) {
  return (
    <SiteTooltip side="top" content={tip} className="w-full">
      <div className="cursor-help rounded-md border border-slate-700/60 bg-slate-900/60 px-2 py-1.5 text-center" tabIndex={0}>
        <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
        <div className="text-sm font-semibold text-slate-100">{value}</div>
      </div>
    </SiteTooltip>
  )
}

function EnvironmentBlock({ env }: { env: NonNullable<StarMapLocationInfo['environment']> }) {
  const stats: { label: string; value: string; tip: string }[] = []
  if (env.gravityG != null) stats.push({ label: 'Gravity', value: `${env.gravityG} g`, tip: 'Surface gravity. 1 g is Earth normal.' })
  if (env.temperatureC != null) {
    stats.push({ label: 'Temp', value: `${env.temperatureC} °C`, tip: 'Base surface temperature. Weather, altitude and time of day move it.' })
  }
  if (env.pressureBar != null) stats.push({ label: 'Pressure', value: `${env.pressureBar} bar`, tip: 'Surface air pressure. 1 bar is Earth normal.' })
  if (env.humidityPct != null) stats.push({ label: 'Humidity', value: `${env.humidityPct}%`, tip: 'Base surface humidity.' })
  if (env.dayHours != null) stats.push({ label: 'Day', value: `${env.dayHours} h`, tip: 'Length of one full day and night.' })
  const gases = env.atmosphere || []
  return (
    <>
      {stats.length > 0 && <div className="grid grid-cols-3 gap-1.5">{stats.map((s) => <Stat key={s.label} {...s} />)}</div>}
      {gases.length > 0 && (
        <div className="space-y-1.5">
          <SubHead>Atmosphere</SubHead>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-800">
            {gases.map((g, i) => (
              <span key={g.gas} style={{ width: `${Math.max(g.percent, 0.5)}%`, backgroundColor: GAS_COLORS[i % GAS_COLORS.length] }} />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
            {gases.map((g, i) => (
              <li key={g.gas} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-slate-300">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: GAS_COLORS[i % GAS_COLORS.length] }} />
                  <span className="truncate">{g.gas}</span>
                </span>
                <span className="tabular-nums text-slate-400">{g.percent < 0.1 ? 'trace' : `${g.percent}%`}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function placeHeading(place: string | null): ReactNode {
  return place ? <div className="text-xs font-semibold text-slate-100">{place}</div> : null
}

function ServicesBlock({ info }: { info: StarMapLocationInfo }) {
  return (
    <>
      {info.services.map((block) => (
        <div key={block.place || '_self'} className="space-y-1">
          {placeHeading(block.place)}
          {block.groups.map((g) => (
            <div key={g.group} className="flex items-start gap-2">
              <span className={`w-16 shrink-0 pt-0.5 text-[10px] font-semibold uppercase tracking-wide ${GROUP_STYLE[g.group]}`}>{g.group}</span>
              <div className="flex flex-wrap gap-1">
                {g.items.map((item) => (
                  <Chip key={item}>{item}</Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

function TradeBlock({ info }: { info: StarMapLocationInfo }) {
  return (
    <>
      {info.trade.map((row) => (
        <div key={row.place || '_self'} className="space-y-1.5">
          {(row.place || row.refinery) && (
            <div className="flex items-center gap-2">
              {placeHeading(row.place)}
              {row.refinery && (
                <SiteTooltip side="top" content="Refine raw ore here.">
                  <span className="site-badge-orange cursor-help !px-1.5 !py-0 !text-[10px]" tabIndex={0}>
                    Refinery
                  </span>
                </SiteTooltip>
              )}
            </div>
          )}
          {row.buy.length > 0 && (
            <div className="space-y-1">
              <SubHead className="text-emerald-300" tip="Commodities you can buy here.">
                Buy · {row.buy.length}
              </SubHead>
              <ChipList label="Buy" items={row.buy} render={(c) => <Chip color="#34d399">{c}</Chip>} />
            </div>
          )}
          {row.sell.length > 0 && (
            <div className="space-y-1">
              <SubHead className="text-amber-300" tip="Commodities you can sell here.">
                Sell · {row.sell.length}
              </SubHead>
              <ChipList label="Sell" items={row.sell} render={(c) => <Chip color="#fbbf24">{c}</Chip>} />
            </div>
          )}
        </div>
      ))}
    </>
  )
}

function ShopsBlock({ info }: { info: StarMapLocationInfo }) {
  const places = [...new Set(info.shops.map((s) => s.place || ''))]
  return (
    <>
      {places.map((place) => (
        <div key={place || '_self'} className="space-y-1">
          {placeHeading(place || null)}
          <ul className="space-y-1.5">
            {info.shops
              .filter((s) => (s.place || '') === place)
              .map((s) => (
                <li key={s.store} className="text-[11px] leading-4">
                  <div className="font-semibold text-slate-100">{s.store}</div>
                  <div className="text-slate-400">{s.kinds.join(', ')}</div>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </>
  )
}

function MiningBlock({ info }: { info: StarMapLocationInfo }) {
  const ores = (title: string, tip: string, rows: StarMapLocationInfo['ship']) =>
    rows.length > 0 && (
      <div className="space-y-1">
        <SubHead tip={tip}>{title}</SubHead>
        <div className="flex flex-wrap gap-1">
          {rows.map((o) => (
            <Chip key={o.name} color={o.rarity ? RARITY_COLORS[o.rarity] : undefined}>
              {o.name}
            </Chip>
          ))}
        </div>
      </div>
    )
  return (
    <>
      {ores('Ship mining', 'Ores a mining ship can crack here. Color shows rarity.', info.ship)}
      {ores('Ground vehicle', 'Ores a ROC or other ground mining vehicle can mine here.', info.ground)}
      {info.hand.length > 0 && (
        <div className="space-y-1">
          <SubHead tip="Gems you can mine by hand with a multi-tool.">Hand mining</SubHead>
          <div className="flex flex-wrap gap-1">
            {info.hand.map((g) => {
              const chip = (
                <Chip color="#facc15">
                  {g.name}
                  {g.habitat === 'caves' && <span className="text-[9px] uppercase text-slate-300">caves</span>}
                </Chip>
              )
              return g.habitat ? (
                <SiteTooltip key={g.name} side="top" content={HABITAT_TIP[g.habitat]}>
                  <span className="cursor-help" tabIndex={0}>
                    {chip}
                  </span>
                </SiteTooltip>
              ) : (
                <span key={g.name}>{chip}</span>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

function NatureBlock({ info }: { info: StarMapLocationInfo }) {
  return (
    <>
      {info.harvestables.length > 0 && (
        <div className="space-y-1">
          <SubHead tip="Plants and other things you can pick up by hand.">Harvestables</SubHead>
          <div className="flex flex-wrap gap-1">
            {info.harvestables.map((h) => (
              <Chip key={h.name} color="#4ade80">
                {h.name}
                {h.caves && <span className="text-[9px] uppercase text-slate-300">caves</span>}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {info.creatures.length > 0 && (
        <div className="space-y-1">
          <SubHead>Creatures</SubHead>
          <div className="flex flex-wrap gap-1">
            {info.creatures.map((c) => (
              <Chip key={c} color="#f87171">
                {c}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function CavesBlock({ caves }: { caves: NonNullable<StarMapLocationInfo['caves']> }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className="text-sm font-semibold text-slate-100">{caves.total}</span>
      <span className="text-slate-400">caves</span>
      {caves.biomes.map((b) => (
        <Chip key={b.label}>
          {b.label} <span className="text-slate-400">{b.count}</span>
        </Chip>
      ))}
      {caves.occupied > 0 && (
        <SiteTooltip side="top" content="Caves with armed occupants inside.">
          <span className="site-badge-red cursor-help !px-1.5 !py-0 !text-[10px]" tabIndex={0}>
            {caves.occupied} occupied
          </span>
        </SiteTooltip>
      )}
    </div>
  )
}

function Description({ text }: { text: string }) {
  const [full, setFull] = useState(false)
  const long = text.length > 240
  return (
    <p className="text-xs leading-relaxed text-slate-300">
      {long && !full ? `${text.slice(0, 220).replace(/\s+\S*$/, '')}…` : text}
      {long && (
        <button type="button" className="ml-1 text-orange-300 hover:text-orange-200" onClick={() => setFull((v) => !v)}>
          {full ? 'Less' : 'More'}
        </button>
      )}
    </p>
  )
}

export default function StarMapLocationCard({ marker, anchor, bounds, onClose, footer }: Props) {
  const [info, setInfo] = useState<StarMapLocationInfo | null>(null)
  const [height, setHeight] = useState(0)
  const drag = usePanelDrag(marker.id)
  const ref = drag.panelRef

  useEffect(() => {
    let live = true
    setInfo(null)
    loadInfo()
      .then((mod) => {
        if (live) setInfo(mod.buildLocationInfo(marker, getStarMapData().systems))
      })
      .catch(() => {
        if (live) setInfo(null)
      })
    return () => {
      live = false
    }
  }, [marker])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setHeight(el.offsetHeight)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  const readout = starMapMarkerReadout(marker)
  const label = starMapMarkerLabel(marker)
  const color = STAR_MAP_ICON_COLORS[marker.kind]
  const width = Math.min(CARD_W, Math.max(200, bounds.w - EDGE * 2))
  const maxH = Math.max(160, Math.min(bounds.h - EDGE * 2, bounds.h * 0.8))
  const left = anchor.sx + 18 + width > bounds.w - EDGE ? Math.max(EDGE, anchor.sx - 18 - width) : anchor.sx + 18
  const top = Math.min(Math.max(EDGE, anchor.sy - 24), Math.max(EDGE, bounds.h - EDGE - (height || 200)))

  const sections: ReactNode[] = []
  if (info) {
    if (info.environment) {
      sections.push(
        <Section key="env" title="Environment">
          <EnvironmentBlock env={info.environment} />
        </Section>,
      )
    }
    if (info.services.length) {
      sections.push(
        <Section key="services" title="Services" count={info.services.length > 1 ? info.services.length : undefined}>
          <ServicesBlock info={info} />
        </Section>,
      )
    }
    if (info.ship.length || info.ground.length || info.hand.length) {
      sections.push(
        <Section key="mining" title="Mining">
          <MiningBlock info={info} />
        </Section>,
      )
    }
    if (info.harvestables.length || info.creatures.length) {
      sections.push(
        <Section key="nature" title="Harvestables & Creatures">
          <NatureBlock info={info} />
        </Section>,
      )
    }
    if (info.caves) {
      sections.push(
        <Section key="caves" title="Caves">
          <CavesBlock caves={info.caves} />
        </Section>,
      )
    }
    if (info.trade.length) {
      sections.push(
        <Section key="trade" title="Commodity Trading" count={info.trade.length > 1 ? info.trade.length : undefined}>
          <TradeBlock info={info} />
        </Section>,
      )
    }
    if (info.shops.length) {
      sections.push(
        <Section key="shops" title="Stores" count={info.shops.length}>
          <ShopsBlock info={info} />
        </Section>,
      )
    }
  }

  return (
    <div
      ref={ref}
      className="site-tooltip-panel absolute z-10 flex flex-col !overflow-hidden !p-0"
      style={{ left, top, width, maxWidth: width, maxHeight: maxH, ...drag.style }}
      role="dialog"
      aria-label={label}
    >
      <div
        {...drag.handleProps}
        className={`flex items-start justify-between gap-2 border-b border-slate-700/60 px-3 py-2.5 ${drag.handleProps.className}`}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-100">{label}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span
              className="rounded px-1.5 py-0.5 font-semibold uppercase tracking-wide"
              style={{ color, backgroundColor: `${color}1f`, border: `1px solid ${color}55` }}
            >
              {readout.subtitle}
            </span>
            {marker.parentName && <span className="text-slate-400">{marker.parentName}</span>}
          </div>
        </div>
        <button type="button" className="site-btn-icon !p-1" aria-label="Close" onClick={onClose}>
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 py-2.5">
        {readout.mission && <p className="text-xs text-slate-300">{readout.mission}</p>}
        {readout.description && <Description text={readout.description} />}
        {marker.notes.length > 0 && (
          <ul className="list-disc pl-4 text-xs text-slate-300">
            {marker.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        {info && info.facts.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
            {info.facts.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-slate-400">{f.label}</dt>
                <dd className="text-slate-200">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {sections}
        {footer}
      </div>
    </div>
  )
}
