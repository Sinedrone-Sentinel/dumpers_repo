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
  vendorId?: number
  productId?: number
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
}

interface HidWatch {
  id: string
  bits: ButtonBit[]
  highs: boolean[]
}

interface ControllerChoice {
  name: string
  devices: HidDeviceLike[]
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

function controllerChoices(devices: HidDeviceLike[]): ControllerChoice[] {
  const groups = new Map<string, HidDeviceLike[]>()
  for (const device of devices) {
    if (device.vendorId !== VKB_VENDOR) continue
    const name = device.productName?.trim() || 'VKB controller'
    const list = groups.get(name) ?? []
    list.push(device)
    groups.set(name, list)
  }
  return [...groups.entries()].map(([name, list]) => ({ name, devices: list }))
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
  const [step, setStep] = useState<'choose' | 'press'>('choose')
  const [choices, setChoices] = useState<ControllerChoice[]>([])
  const [chosen, setChosen] = useState<string | null>(null)
  const [heard, setHeard] = useState<Heard | null>(null)
  const [usbError, setUsbError] = useState<string | null>(null)
  const trackers = useRef(buttonTracks())
  const hid = useRef(new Map<HidDeviceLike, HidWatch>())
  const listeners = useRef(new Map<HidDeviceLike, (event: { data: DataView; reportId?: number }) => void>())
  const hidSerial = useRef(0)

  function stopListening() {
    for (const [device, listener] of listeners.current) {
      device.removeEventListener('inputreport', listener)
    }
    listeners.current.clear()
    hid.current.clear()
    trackers.current = buttonTracks()
    setHeard(null)
  }

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

  useEffect(() => {
    let cancelled = false
    const api = hidApi()
    if (!api?.getDevices) return
    void api.getDevices().then((devices) => {
      if (!cancelled) setChoices(controllerChoices(devices))
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (step !== 'press') return
    let stopped = false
    let frame = 0
    const tick = () => {
      if (stopped) return
      const now = performance.now()
      let nextHeard: Heard | null = null
      const revoked = new Set<string>()
      for (const watch of hid.current.values()) {
        const settled = stableButton(trackers.current, watch.id, watch.highs, now)
        if (settled.button != null) nextHeard = { button: settled.button, source: watch.id }
        for (const button of settled.revoked) revoked.add(`${watch.id}:${button}`)
      }
      if (nextHeard || revoked.size) {
        setHeard((current) => {
          if (nextHeard) return nextHeard
          if (current && revoked.has(`${current.source}:${current.button}`)) return null
          return current
        })
      }
      frame = window.requestAnimationFrame(tick)
    }
    frame = window.requestAnimationFrame(tick)
    return () => {
      stopped = true
      window.cancelAnimationFrame(frame)
    }
  }, [step])

  async function refreshChoices(extra: HidDeviceLike[] = []) {
    const api = hidApi()
    const known = api?.getDevices ? await api.getDevices() : []
    const devices = [...extra]
    for (const device of known) {
      if (!devices.includes(device)) devices.push(device)
    }
    setChoices(controllerChoices(devices))
  }

  async function allowController() {
    const api = hidApi()
    if (!api) {
      setUsbError('This browser cannot open a VKB controller.')
      return
    }
    setUsbError(null)
    try {
      const picked = await api.requestDevice({ filters: [{ vendorId: VKB_VENDOR }] })
      await refreshChoices(picked)
    } catch {
      setUsbError('The controller was not allowed.')
    }
  }

  async function chooseController(choice: ControllerChoice) {
    stopListening()
    setUsbError(null)
    let listening = false
    for (const device of choice.devices) {
      if (!device.opened) await device.open()
      const bits = buttonBitsFromCollections(device.collections ?? [])
      if (!bits.length) continue
      hidSerial.current += 1
      const watch: HidWatch = { id: `hid:${hidSerial.current}`, bits, highs: [] }
      hid.current.set(device, watch)
      const listener = (event: { data: DataView; reportId?: number }) => {
        watch.highs = applyButtonReport(watch.highs, watch.bits, event.reportId ?? 0, reportBytes(event.data))
      }
      listeners.current.set(device, listener)
      device.addEventListener('inputreport', listener)
      listening = true
    }
    if (!listening) {
      setUsbError('That controller has no button list. Choose the other one.')
      return
    }
    setChosen(choice.name)
    setStep('press')
  }

  function changeController() {
    stopListening()
    setChosen(null)
    setStep('choose')
  }

  return (
    <AppModal
      title={moduleName}
      subtitle={step === 'choose' ? 'Choose the controller' : `Press ${controlName}.`}
      onClose={onSkip}
      size="sm"
      closeOnBackdrop={false}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {step === 'press' && (
            <button type="button" className="site-btn-ghost px-3 py-1.5" onClick={changeController}>
              Change controller
            </button>
          )}
          <button type="button" className="site-btn-ghost px-3 py-1.5" onClick={onSkip}>
            Skip
          </button>
          {step === 'press' && (
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
          )}
        </div>
      }
    >
      {step === 'choose' ? (
        <>
          <p className="text-sm text-slate-300">
            Choose the controller this module is on before you press a button. Chrome asks only the first time you
            allow one. SEM and STEM are part of the throttle.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {choices.map((choice) => (
              <button
                key={choice.name}
                type="button"
                className="site-btn-secondary px-3 py-2 text-left text-sm"
                onClick={() => void chooseController(choice)}
              >
                {choice.name}
              </button>
            ))}
            <button type="button" className="site-btn-primary px-3 py-2 text-sm" onClick={() => void allowController()}>
              {choices.length ? 'Allow another controller' : 'Allow a controller'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-300">
            Press {controlName} on {chosen}. Press again to replace the number.
          </p>
          <p className="mt-4 text-center text-4xl font-semibold tabular-nums text-amber-100">
            {heard == null ? '—' : heard.button}
          </p>
          <p className="mt-1 text-center text-xs uppercase tracking-wide text-slate-500">
            {heard == null ? 'Waiting for a press' : chosen}
          </p>
        </>
      )}
      {usbError && <p className="mt-2 text-sm text-red-300">{usbError}</p>}
    </AppModal>
  )
}
