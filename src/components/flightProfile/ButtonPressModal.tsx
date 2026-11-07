import { useEffect, useRef, useState } from 'react'
import AppModal from '../layout/AppModal'
import { risingBit, risingButton } from '../../lib/flightProfile/catalog'

const VKB_VENDOR = 0x231d

interface HidDeviceLike {
  opened: boolean
  open: () => Promise<void>
  addEventListener: (type: 'inputreport', listener: (event: { data: DataView }) => void) => void
  removeEventListener: (type: 'inputreport', listener: (event: { data: DataView }) => void) => void
}

interface HidLike {
  requestDevice: (options: { filters: { vendorId: number }[] }) => Promise<HidDeviceLike[]>
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
  const [heard, setHeard] = useState<number | null>(null)
  const [usbError, setUsbError] = useState<string | null>(null)
  const padsRef = useRef(new Map<number, boolean[]>())
  const reportsRef = useRef(new Map<HidDeviceLike, Uint8Array>())
  const listeners = useRef(new Map<HidDeviceLike, (event: { data: DataView }) => void>())

  useEffect(() => {
    let stopped = false
    let frame = 0
    const tick = () => {
      if (stopped) return
      const pads = navigator.getGamepads?.() ?? []
      for (const pad of pads) {
        if (!pad || pad.mapping === 'standard') continue
        const current = pad.buttons.map((button) => button.pressed)
        const previous = padsRef.current.get(pad.index) ?? []
        const rising = risingButton(previous, current)
        padsRef.current.set(pad.index, current)
        if (rising != null) setHeard(rising)
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
    const reports = reportsRef.current
    const currentListeners = listeners.current
    return () => {
      for (const [device, listener] of currentListeners) {
        device.removeEventListener('inputreport', listener)
      }
      reports.clear()
    }
  }, [])

  async function allowUsb() {
    const hid = hidApi()
    if (!hid) {
      setUsbError('This browser cannot open the VKB device directly.')
      return
    }
    setUsbError(null)
    try {
      const devices = await hid.requestDevice({ filters: [{ vendorId: VKB_VENDOR }] })
      for (const device of devices) {
        if (!device.opened) await device.open()
        if (listeners.current.has(device)) continue
        const listener = (event: { data: DataView }) => {
          const current = reportBytes(event.data)
          const previous = reportsRef.current.get(device)
          reportsRef.current.set(device, current)
          if (!previous) return
          const rising = risingBit(previous, current)
          if (rising != null) setHeard(rising)
        }
        listeners.current.set(device, listener)
        device.addEventListener('inputreport', listener)
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
              if (heard != null) onAccept(heard)
            }}
          >
            Accept
          </button>
        </div>
      }
    >
      <p className="text-sm text-slate-300">
        The number below is what this browser received. Press the control again to replace it. Accept saves it.
      </p>
      <p className="mt-4 text-center text-4xl font-semibold tabular-nums text-amber-100">
        {heard == null ? '—' : heard}
      </p>
      <p className="mt-1 text-center text-xs uppercase tracking-wide text-slate-500">
        {heard == null ? 'Waiting for a press' : 'Button number'}
      </p>
      <button type="button" className="site-btn-secondary mt-4 px-3 py-1.5 text-sm" onClick={() => void allowUsb()}>
        Allow VKB device
      </button>
      {usbError && <p className="mt-2 text-sm text-red-300">{usbError}</p>}
    </AppModal>
  )
}
