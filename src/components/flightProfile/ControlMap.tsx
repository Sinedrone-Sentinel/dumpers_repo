import React, { useLayoutEffect, useRef, useState } from 'react'
import type { BreakoutDef, ControlDef, DeviceDef } from '../../lib/flightProfile/devices'
import { PHOTO_SIZE } from '../../lib/flightProfile/devices'
import { bindLabels, inputParts, type ProfileBind } from '../../lib/flightProfile/parseProfile'
import type { SideId } from '../../lib/flightProfile/catalog'
import './control-map.css'

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

function labelsFor(control: ControlDef, binds: Map<string, string[]>): string[] {
  return bindLabels(control.input, binds)
}

function ControlList({
  controls,
  binds,
  columns,
}: {
  controls: ControlDef[]
  binds: Map<string, string[]>
  columns: number
}) {
  const rows = Math.ceil(controls.length / columns)
  return (
    <div className={`fp-list${columns === 2 ? ' two' : ''}`} style={{ ['--rows' as string]: rows }}>
      {controls.map((control) => (
        <div key={control.input} className="fp-row">
          <span className="fp-n">{control.label}</span>
          <span className="fp-hw">{control.name}</span>
          <FunctionText labels={labelsFor(control, binds)} />
        </div>
      ))}
    </div>
  )
}

function DeviceSheet({
  device,
  side,
  profileName,
  binds,
}: {
  device: DeviceDef
  side: SideId
  profileName: string
  binds: Map<string, string[]>
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
    <FitPage>
      <section className="fp-page">
        <header>
          <h1>{device.title}</h1>
          <p>
            {device.subtitle} · {sideName} · {profileName}
          </p>
        </header>
        <div className="fp-body">
          <ControlList controls={device.controls} binds={binds} columns={device.columns} />
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
    </FitPage>
  )
}

function DeadSheet({ dead, profileName }: { dead: ProfileBind[]; profileName: string }) {
  const columns = dead.length > 18 ? 2 : 1
  const rows = Math.ceil(dead.length / columns) || 1
  return (
    <FitPage>
      <section className="fp-page">
        <header>
          <h1>Dead Assignments</h1>
          <p>
            Joystick / HOTAS flight binds that are not on any control in this setup · {dead.length} · {profileName}
          </p>
        </header>
        <div className="fp-body dead">
          {dead.length ? (
            <div className={`fp-list${columns === 2 ? ' two' : ''}`} style={{ ['--rows' as string]: rows }}>
              {dead.map((bind) => {
                const [where, what] = inputParts(bind.input)
                return (
                  <div key={`${bind.input}-${bind.label}`} className="fp-row">
                    <span className="fp-n">{where}</span>
                    <span className="fp-hw">{what}</span>
                    <span className="fp-fn">{bind.label}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="fp-empty">Every joystick assignment in the flight profile matches a control in this setup.</p>
          )}
        </div>
      </section>
    </FitPage>
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
      {pages.map((page) => (
        <DeviceSheet
          key={`${page.side}-${page.device.id}`}
          device={page.device}
          side={page.side}
          profileName={profileName}
          binds={binds}
        />
      ))}
      <DeadSheet dead={dead} profileName={profileName} />
    </div>
  )
}
