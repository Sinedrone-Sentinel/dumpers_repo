import React, { useLayoutEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { BreakoutDef, ControlDef, DeviceDef } from '../../lib/flightProfile/devices'
import { PHOTO_SIZE } from '../../lib/flightProfile/devices'
import { bindLabels, inputParts, type ProfileBind } from '../../lib/flightProfile/parseProfile'
import type { SideId } from '../../lib/flightProfile/catalog'
import SiteTooltip from '../SiteTooltip'
import mapCss from './control-map.css?raw'
import './control-map.css'

const PRINT_FRAME = `
html, body { margin: 0; background: #e7e9ee; }
.fp-printbar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  justify-content: flex-end;
  padding: 10px 16px;
  background: #1a1e24;
}
.fp-printbar button {
  font: 600 14px/1 "Segoe UI", Arial, sans-serif;
  color: #1a1e24;
  background: white;
  border: 0;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
}
.fp-printmount { display: flex; justify-content: center; padding: 16px; }
.fp-printmount .fp-page { box-shadow: 0 8px 28px rgba(0, 0, 0, 0.18); }
@media print {
  html, body { background: white; }
  .fp-printbar { display: none !important; }
  .fp-printmount { display: block; padding: 0; }
  .fp-printmount .fp-page { box-shadow: none; }
}
@page { size: 11in 8.5in; margin: 0; }
`

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch)
}

function openMapWindow(title: string, sheet: React.ReactNode): boolean {
  const win = window.open('', '_blank', 'width=1200,height=900')
  if (!win) return false
  const origin = window.location.origin
  win.document.open()
  win.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><base href="${origin}/"><title>${escapeHtml(title)}</title></head><body><div class="fp-printbar"><button type="button" id="fp-print">Print</button></div><div id="fp-mount" class="fp-printmount"></div></body></html>`,
  )
  win.document.close()
  const style = win.document.createElement('style')
  style.textContent = `${mapCss}\n${PRINT_FRAME}`
  win.document.head.appendChild(style)
  win.document.getElementById('fp-print')?.addEventListener('click', () => win.print())
  const mount = win.document.getElementById('fp-mount')
  if (!mount) return true
  const root: Root = createRoot(mount)
  root.render(sheet)
  win.addEventListener('pagehide', () => root.unmount())
  return true
}

const PAGE_WIDTH = 11 * 96
const PAGE_HEIGHT = 8.5 * 96

function groupLabels(group: BreakoutDef): string[] {
  if (group.kind === 'hat') {
    return [...Object.values(group.slots ?? {}), ...(group.extra ?? [])].filter((label): label is string => Boolean(label))
  }
  return [...(group.items ?? []), ...(group.extra ?? [])]
}

function FitPage({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setScale(el.clientWidth / PAGE_WIDTH)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="relative w-full min-w-0 overflow-hidden" style={{ height: PAGE_HEIGHT * scale }}>
      <div
        className="absolute left-0 top-0"
        style={{
          width: '11in',
          height: '8.5in',
          transform: `scale(${scale || 0})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  )
}

function Leaders({ device, width, height }: { device: DeviceDef; width: number; height: number }) {
  const sw = Math.max(width, height) * 0.0034
  const halo = sw * 2.6
  const groups = (device.breakouts ?? []).filter(
    (group) => Number.isFinite(group.cx) && Number.isFinite(group.cy) && Number.isFinite(group.r)
  )
  return (
    <svg className="fp-leaders" viewBox={`0 0 ${width} ${height}`}>
      {groups.map((group, index) => {
        const cx = ((group.cx ?? 0) / 100) * width
        const cy = ((group.cy ?? 0) / 100) * height
        const radius = ((group.r ?? 0) / 100) * width
        const x2 = (group.x / 100) * width
        const y2 = (group.y / 100) * height
        const dx = x2 - cx
        const dy = y2 - cy
        const len = Math.hypot(dx, dy) || 1
        const x1 = cx + (dx / len) * (radius + sw)
        const y1 = cy + (dy / len) * (radius + sw)
        return (
          <g key={`${group.name}-${index}`}>
            <line className="halo" x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={halo} />
            <line className="ink" x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth={sw} />
            <circle className="halo" cx={cx} cy={cy} r={radius} strokeWidth={halo} />
            <circle className="ink" cx={cx} cy={cy} r={radius} strokeWidth={sw} />
          </g>
        )
      })}
    </svg>
  )
}

function Callout({ group }: { group: BreakoutDef }) {
  const style = { left: `${group.x}%`, top: `${group.y}%` }
  if (group.kind === 'hat') {
    const slot = (place: 'up' | 'right' | 'down' | 'left' | 'press') =>
      group.slots?.[place] ? <span className={`b fp-${place}`}>{group.slots[place]}</span> : null
    const extra = group.extra ?? []
    return (
      <div className="fp-callout hat" style={style}>
        <div className="fp-cap">{group.name}</div>
        <div className="fp-cross">
          {slot('up')}
          {slot('left')}
          {slot('press')}
          {slot('right')}
          {slot('down')}
        </div>
        {extra.length > 0 && (
          <div className="fp-extra">
            {extra.map((label) => (
              <span key={label} className="b">
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }
  const items = group.items ?? []
  return (
    <div className={`fp-callout ${group.kind}`} style={style}>
      <div className="fp-cap">{group.name}</div>
      {items.length > 0 && (
        <div className="fp-stack">
          {items.map((label) => (
            <span key={label} className="b">
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function FunctionText({ labels }: { labels: string[] }) {
  if (!labels.length) return <span className="fp-ln" />
  return (
    <span className="fp-fn">
      {labels.map((label, index) => (
        <React.Fragment key={`${label}-${index}`}>
          {index > 0 && <br />}
          {label}
        </React.Fragment>
      ))}
    </span>
  )
}

function BlankWrite({ name }: { name: string }) {
  return (
    <span className="fp-write">
      <span className="fp-hw">{name}</span>
      <span className="fp-rule" />
      <span className="fp-rule" />
      <span className="fp-rule" />
    </span>
  )
}

function labelsFor(control: ControlDef, binds: Map<string, string[]>): string[] {
  return bindLabels(control.input, binds)
}

function ControlList({
  controls,
  binds,
  columns,
  blank,
}: {
  controls: ControlDef[]
  binds: Map<string, string[]>
  columns: number
  blank?: boolean
}) {
  const rows = Math.ceil(controls.length / columns)
  return (
    <div className={`fp-list${columns === 2 ? ' two' : ''}`} style={{ ['--rows' as string]: rows }}>
      {controls.map((control) => (
        <div key={control.input} className={blank ? 'fp-row fp-row-blank' : 'fp-row'}>
          <span className="fp-n">{control.label}</span>
          {blank ? (
            <BlankWrite name={control.name} />
          ) : (
            <>
              <span className="fp-hw">{control.name}</span>
              <FunctionText labels={labelsFor(control, binds)} />
            </>
          )}
        </div>
      ))}
    </div>
  )
}

function DevicePage({
  device,
  side,
  profileName,
  binds,
  blank,
}: {
  device: DeviceDef
  side: SideId
  profileName: string
  binds: Map<string, string[]>
  blank?: boolean
}) {
  const size = PHOTO_SIZE[device.photo]
  const grouped = new Set((device.breakouts ?? []).flatMap(groupLabels))
  const badges = device.controls.filter(
    (control) =>
      !grouped.has(control.label) &&
      control.pin !== false &&
      Number.isFinite(control.x) &&
      Number.isFinite(control.y)
  )
  const sideName = side === 'left' ? 'Left side' : 'Right side'
  return (
    <section className={blank ? 'fp-page fp-blank' : 'fp-page'}>
      <header>
        <h1>{device.title}</h1>
        <p>
          {device.subtitle} · {sideName} · {profileName}
          {blank ? ' · Blank' : ''}
        </p>
      </header>
      <div className="fp-body">
        <ControlList controls={device.controls} binds={binds} columns={device.columns} blank={blank} />
        <div className="fp-art">
          <div className="fp-frame">
            <img src={`/flight-profile/${device.photo}`} alt="" />
            {size && <Leaders device={device} width={size.width} height={size.height} />}
            <div className="fp-badges">
              {badges.map((control) => (
                <span key={control.label} className="fp-badge" style={{ left: `${control.x}%`, top: `${control.y}%` }}>
                  {control.label}
                </span>
              ))}
              {(device.breakouts ?? []).map((group, index) => (
                <Callout key={`${group.name}-${index}`} group={group} />
              ))}
            </div>
            <p className="fp-credit">Photo from VKB</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function DeadPage({ dead, profileName, blank }: { dead: ProfileBind[]; profileName: string; blank?: boolean }) {
  const columns = dead.length > 18 ? 2 : 1
  const rows = Math.ceil(dead.length / columns) || 1
  return (
    <section className={blank ? 'fp-page fp-blank' : 'fp-page'}>
      <header>
        <h1>Dead Assignments</h1>
        <p>
          Joystick / HOTAS flight binds that are not on any control in this setup · {dead.length} · {profileName}
          {blank ? ' · Blank' : ''}
        </p>
      </header>
      <div className="fp-body dead">
        {dead.length ? (
          <div className={`fp-list${columns === 2 ? ' two' : ''}`} style={{ ['--rows' as string]: rows }}>
            {dead.map((bind) => {
              const [where, what] = inputParts(bind.input)
              return (
                <div key={`${bind.input}-${bind.label}`} className={blank ? 'fp-row fp-row-blank' : 'fp-row'}>
                  <span className="fp-n">{where}</span>
                  {blank ? (
                    <BlankWrite name={what} />
                  ) : (
                    <>
                      <span className="fp-hw">{what}</span>
                      <span className="fp-fn">{bind.label}</span>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="fp-empty">Every joystick assignment in the flight profile matches a control in this setup.</p>
        )}
      </div>
    </section>
  )
}

function MapSection({
  title,
  screen,
  openFilled,
  openBlank,
}: {
  title: string
  screen: React.ReactNode
  openFilled: () => React.ReactNode
  openBlank: () => React.ReactNode
}) {
  const [blocked, setBlocked] = useState(false)
  const open = (kind: 'filled' | 'blank') => {
    const sheet = kind === 'filled' ? openFilled() : openBlank()
    const name = kind === 'filled' ? title : `${title} blank`
    setBlocked(!openMapWindow(name, sheet))
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="site-surface flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2">
        <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        <div className="flex flex-wrap gap-2">
          <SiteTooltip side="top" content="Opens this sheet the way it looks now. The new window has a print button.">
            <button type="button" className="site-btn-secondary px-3 py-1.5 text-xs" onClick={() => open('filled')}>
              Print map
            </button>
          </SiteTooltip>
          <SiteTooltip side="top" content="Opens this sheet with the flight-profile actions cleared. Each numbered control has three blank lines.">
            <button type="button" className="site-btn-secondary px-3 py-1.5 text-xs" onClick={() => open('blank')}>
              Print blank
            </button>
          </SiteTooltip>
        </div>
      </div>
      {blocked && (
        <p className="site-error-text text-xs">Allow pop-ups for this site, then try the print button again.</p>
      )}
      {screen}
    </div>
  )
}

export default function ControlMap({
  pages,
  binds,
  dead,
  profileName,
}: {
  pages: { device: DeviceDef; side: SideId }[]
  binds: Map<string, string[]>
  dead: ProfileBind[]
  profileName: string
}) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-3 overflow-x-hidden">
      {pages.map((page) => {
        const sideName = page.side === 'left' ? 'Left side' : 'Right side'
        const title = `${page.device.title} · ${sideName}`
        const sheet = (blank: boolean) => (
          <DevicePage device={page.device} side={page.side} profileName={profileName} binds={binds} blank={blank} />
        )
        return (
          <MapSection
            key={`${page.side}-${page.device.id}`}
            title={title}
            screen={
              <FitPage>
                <DevicePage device={page.device} side={page.side} profileName={profileName} binds={binds} />
              </FitPage>
            }
            openFilled={() => sheet(false)}
            openBlank={() => sheet(true)}
          />
        )
      })}
      <MapSection
        title="Dead Assignments"
        screen={
          <FitPage>
            <DeadPage dead={dead} profileName={profileName} />
          </FitPage>
        }
        openFilled={() => <DeadPage dead={dead} profileName={profileName} />}
        openBlank={() => <DeadPage dead={dead} profileName={profileName} blank />}
      />
    </div>
  )
}
