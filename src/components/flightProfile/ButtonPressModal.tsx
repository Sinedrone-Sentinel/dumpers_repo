import { useEffect, useRef, useState } from 'react'
import AppModal from '../layout/AppModal'
import {
  applyButtonReport,
  buttonBitsFromCollections,
  buttonTracks,
  stableButton,
  type ButtonBit,
} from '../../lib/flightProfile/catalog'

const VKB_VENDOR = 0x231d

interface HidDeviceLike {
  productName?: string
  opened: boolean
  open: () => Promise<void>
  collections?: Parameters<typeof buttonBitsFromCollections>[0]
  addEventListener: (
    type: 'inputreport',
    listener: (event: { data: DataView; reportId?: number }) => void,
  ) => void
  removeEventListener: (
    type: 'inputreport',
    listener: (event: { data: DataView; reportId?: number }) => void,
  ) => void
}

interface Heard {
  button: number
  source: string
  label: string
}

interface HidWatch {
  id: string
  bits: ButtonBit[]
  highs: boolean[]
}

interface HidLike {
  requestDevice: (options: { filters: { vendorId: number }[] }) => Promise<HidDeviceLike[]>
  getDevices?: () => Promise<HidDeviceLike[]>
}

function hidApi(): HidLike | null {
  const nav = navigator as Navigator & { hid?: HidLike }
  return nav.hid ?? null
}

function reportBytes(data: DataView): Uint8Array {
  const bytes = new Uint8Array(data.byteLength)
  for (let index = 0; index < data.byteLength; index += 1) bytes[index] = data.getUint8(index)
  return bytes
}

function controllerLabel(id: string): string {
  const name = id.split('(')[0]?.trim()
  return name || 'controller'
}

function digitalDown(button: GamepadButton): boolean {
  return button.pressed || button.value >= 0.5
}

export default function ButtonPressModal({
  moduleName,
  controlName,
  onAccept,
  onSkip,
}: {
  moduleName: string
  controlName: string
  onAccept: (button: number) => void
  onSkip: () => void
}) {
  const [heard, setHeard] = useState<Heard | null>(null)
  const [allowed, setAllowed] = useState<string[]>([])
  const [usbError, setUsbError] = useState<string | null>(null)
  const trackers = useRef(buttonTracks())
  const hid = useRef(new Map<HidDeviceLike, HidWatch>())
  const listeners = useRef(new Map<HidDeviceLike, (event: { data: DataView; reportId?: number }) => void>())
  const hidSerial = useRef(0)

  useEffect(() => {
    let stopped = false
    let frame = 0
    const tick = () => {
      if (stopped) return
      const now = performance.now()
      const updates: { source: string; label: string; button: number | null; revoked: number[] }[] = []
      if (hid.current.size === 0) {
        const pads = navigator.getGamepads?.() ?? []
        for (const pad of pads) {
          if (!pad?.connected || pad.mapping === 'standard') continue
          const settled = stableButton(
            trackers.current,
            `pad:${pad.index}`,
            pad.buttons.map((button) => digitalDown(button)),
            now,
          )
          updates.push({ source: `pad:${pad.index}`, label: controllerLabel(pad.id), ...settled })
        }
      }
      for (const watch of hid.current.values()) {
        const settled = stableButton(trackers.current, watch.id, watch.highs, now)
        updates.push({ source: watch.id, label: 'VKB device', ...settled })
      }
      if (updates.length) {
        setHeard((current) => {
          let next = current
          for (const update of updates) {
            if (update.button != null) next = { button: update.button, source: update.source, label: update.label }
            else if (next && next.source === update.source && update.revoked.includes(next.button)) next = null
          }
          if (next === current) return current
          if (next && current && next.button === current.button && next.source === current.source) return current
          return next
        })
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => {
      stopped = true
      window.cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    const watches = hid.current
    const currentListeners = listeners.current
    return () => {
      for (const [device, listener] of currentListeners) {
        device.removeEventListener('inputreport', listener)
      }
      watches.clear()
    }
  }, [])

  async function allowUsb() {
    const api = hidApi()
    if (!api) {
      setUsbError('This browser cannot open the VKB device directly.')
      return
    }
    setUsbError(null)
    try {
      const picked = await api.requestDevice({ filters: [{ vendorId: VKB_VENDOR }] })
      const known = api.getDevices ? await api.getDevices() : []
      const devices = [...picked]
      for (const device of known) {
        if (!devices.includes(device)) devices.push(device)
      }
      const names: string[] = []
      for (const device of devices) {
        if (!device.opened) await device.open()
        if (listeners.current.has(device)) {
          if (device.productName) names.push(device.productName)
          continue
        }
        const bits = buttonBitsFromCollections(device.collections ?? [])
        if (!bits.length) continue
        hidSerial.current += 1
        const watch: HidWatch = {
          id: `hid:${hidSerial.current}`,
          bits,
          highs: [],
        }
        hid.current.set(device, watch)
        const listener = (event: { data: DataView; reportId?: number }) => {
          watch.highs = applyButtonReport(watch.highs, watch.bits, event.reportId ?? 0, reportBytes(event.data))
        }
        listeners.current.set(device, listener)
        device.addEventListener('inputreport', listener)
        names.push(device.productName || 'VKB controller')
      }
      setAllowed((current) => [...new Set([...current, ...names])])
      if (!names.length) {
        setUsbError('That connection has no button list. Allow the throttle or the stick.')
      }
    } catch {
      setUsbError('The VKB device was not allowed.')
    }
  }

  return (
    <AppModal
      title={moduleName}
      subtitle={`Press ${controlName}.`}
      onClose={onSkip}
      size="sm"
      closeOnBackdrop={false}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="site-btn-ghost px-3 py-1.5" onClick={onSkip}>
            Skip
          </button>
          <button
            type="button"
            className="site-btn-primary px-4 py-1.5 text-sm"
            disabled={heard == null}
            onClick={() => {
              if (heard != null) onAccept(heard.button)
            }}
          >
            Accept
          </button>
        </div>
      }
    >
      <p className="text-sm text-slate-300">
        The browser&apos;s controller list stops at button 32, so SEM and STEM never appear there. They are part of the
        throttle. Allow that controller. Allow the stick with another click. The number below is the button you pressed.
        Press again to replace it.
      </p>
      <p className="mt-4 text-center text-4xl font-semibold tabular-nums text-amber-100">
        {heard == null ? '—' : heard.button}
      </p>
      <p className="mt-1 text-center text-xs uppercase tracking-wide text-slate-500">
        {heard == null ? 'Waiting for a press' : heard.label}
      </p>
      <button type="button" className="site-btn-secondary mt-4 px-3 py-1.5 text-sm" onClick={() => void allowUsb()}>
        {allowed.length ? 'Allow another controller' : 'Allow VKB controller'}
      </button>
      {allowed.length > 0 && <p className="mt-2 text-sm text-slate-400">Listening to {allowed.join(', ')}.</p>}
      {usbError && <p className="mt-2 text-sm text-red-300">{usbError}</p>}
    </AppModal>
  )
}
