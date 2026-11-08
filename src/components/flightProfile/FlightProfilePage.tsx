import { useEffect, useMemo, useRef, useState } from 'react'
import FeaturePageLayout from '../layout/FeaturePageLayout'
import SiteTooltip from '../SiteTooltip'
import ControlMap from './ControlMap'
import ButtonPressModal from './ButtonPressModal'
import { useAuth } from '../../contexts/AuthContext'
import {
  loadFlightProfile,
  loadListedGear,
  saveFlightLayout,
  saveFlightPresses,
  saveFlightProfile,
  type ExternalPresses,
} from '../../lib/flightProfile/api'
import { DEVICES } from '../../lib/flightProfile/devices'
import {
  BAY_SLOTS,
  DEFAULT_LISTED,
  deviceNeedsPress,
  EMPTY_EXTERNALS,
  EMPTY_SETUP,
  EXTERNAL_SIDES,
  SLOT_LABEL,
  emptyPresses,
  externalOptions,
  externalPressesFromStored,
  firstUnpressed,
  hearsButtonPress,
  manufacturers,
  moduleById,
  optionsFor,
  place,
  sampleButton,
  sheetsFor,
  shiftDevice,
  slotAvailable,
  syncPresses,
  unpressedLabels,
  type ExternalSetup,
  type ExternalSide,
  type PressSetup,
  type Setup,
  type SideId,
  type SlotId,
} from '../../lib/flightProfile/catalog'
import { deadBinds, readFlightProfile, type ParsedFlightProfile } from '../../lib/flightProfile/parseProfile'

function explainProfileError(message: string): string {
  if (/flight_gear|external devices|RSI verification is required/i.test(message)) {
    return 'External devices need supabase/migrations/219_flight_gear.sql applied after 218_flight_button_presses.sql. Then reload this page.'
  }
  if (/save_flight_button_presses|column .*button_presses/i.test(message)) {
    return 'Button numbers are not on the database yet. Run supabase/migrations/218_flight_button_presses.sql, then reload this page.'
  }
  if (/save_flight_profile_layout|column .*layout/i.test(message)) {
    return 'The flight profile layout is not on the database yet. Run supabase/migrations/217_flight_profile_layout.sql, then 218_flight_button_presses.sql, and reload this page.'
  }
  if (/flight_profiles/i.test(message) && /schema cache|does not exist/i.test(message)) {
    return 'The flight profile table is not on the database yet. Run supabase/migrations/216_flight_profiles.sql, then 217_flight_profile_layout.sql, and reload this page.'
  }
  return message
}

const SLOT_CLASS: Record<SlotId, string> = {
  topLeft: 'col-start-1 row-start-1',
  top: 'col-start-2 row-start-1',
  topRight: 'col-start-3 row-start-1',
  left: 'col-start-1 row-start-2',
  main: 'col-start-2 row-start-2',
  right: 'col-start-3 row-start-2',
  bottom: 'col-start-2 row-start-3',
}

function mountHint(setup: Setup, side: SideId, slot: SlotId, open: boolean): string {
  if (!open) {
    if (!setup[side].main) return "Choose this side's main first."
    if (slot === 'left' || slot === 'right') return 'This hardware has no side connector.'
    if (slot === 'bottom') return 'This hardware has no front connector.'
    return 'This hardware has no top mount.'
  }
  if (slot === 'main') return 'Stick or throttle for this side.'
  if (slot === 'top') return 'UCM desk mount, or a standalone mount.'
  if (slot === 'left' || slot === 'right') return 'Side connector on the stick base.'
  return 'Front of the throttle, toward you.'
}

function Bay({
  side,
  setup,
  active,
  onPick,
}: {
  side: SideId
  setup: Setup
  active: SlotId | null
  onPick: (slot: SlotId) => void
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-200/80">
        {side === 'left' ? 'Left side' : 'Right side'}
      </p>
      <div className="grid grid-cols-[4.25rem_6.75rem_4.25rem] grid-rows-[3.1rem_5.4rem_3.1rem] gap-1.5">
        {BAY_SLOTS.map((slot) => {
          const id = setup[side][slot]
          const module = id ? moduleById(id) : null
          const open = slotAvailable(setup, side, slot)
          const selected = open && active === slot
          const hint = mountHint(setup, side, slot, open)
          return (
            <SiteTooltip
              key={slot}
              className={`${SLOT_CLASS[slot]} !block h-full w-full ${open ? '' : 'cursor-not-allowed'}`}
              side="bottom"
              content={hint}
            >
              <button
                type="button"
                disabled={!open}
                onClick={() => onPick(slot)}
                className={`relative h-full w-full overflow-hidden rounded-lg border text-center transition-colors ${
                  !open
                    ? 'cursor-not-allowed border-slate-600 bg-slate-900/80 text-slate-500 opacity-50'
                    : selected
                      ? 'border-amber-300 ring-2 ring-amber-300/70'
                      : module
                        ? 'border-orange-400/70'
                        : 'border-dashed border-orange-500/40 bg-slate-950/80 hover:border-orange-300/70'
                }`}
              >
                {module && open && (
                  <img src={module.photo} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
                )}
                <span
                  className={`relative px-1 text-[10px] font-semibold uppercase leading-tight tracking-wide ${
                    !open
                      ? 'text-slate-500'
                      : module
                        ? 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]'
                        : 'text-orange-100/80'
                  }`}
                >
                  {module && open ? module.name : SLOT_LABEL[slot]}
                </span>
              </button>
            </SiteTooltip>
          )
        })}
      </div>
    </div>
  )
}

function SetupMenu() {
  return (
    <SiteTooltip side="top" content="VKB is the only setup. This panel keeps its own mounts.">
      <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-200/80">
        Setup
        <select className="site-input px-2 py-1 text-xs normal-case tracking-normal" value="vkb" onChange={() => undefined}>
          <option value="vkb">VKB</option>
        </select>
      </label>
    </SiteTooltip>
  )
}

function ExternalPanel({
  title,
  side,
  bay,
  filter,
  listed,
  activeIndex,
  onFilter,
  onPick,
}: {
  title: string
  side: ExternalSide
  bay: ExternalSetup[ExternalSide]
  filter: string
  listed: Set<string>
  activeIndex: 0 | 1 | null
  onFilter: (value: string) => void
  onPick: (index: 0 | 1) => void
}) {
  const brands = manufacturers().filter((name) => externalOptions(listed, name).length > 0)
  return (
    <div className="flex w-44 flex-col gap-2">
      <SiteTooltip side="top" content="Filters the two devices below. ALL shows every extra device that is available.">
        <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-200/80">
          {title}
          <select
            className="site-input px-2 py-1 text-xs normal-case tracking-normal"
            value={filter}
            onChange={(event) => onFilter(event.target.value)}
          >
            <option value="ALL">ALL</option>
            {brands.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
      </SiteTooltip>
      {[0, 1].map((index) => {
        const slot = index as 0 | 1
        const id = bay[slot]
        const module = id ? moduleById(id) : null
        const selected = activeIndex === slot
        return (
          <SiteTooltip key={`${side}-${slot}`} side="top" content="One extra device. It is used on its own.">
          <button
            type="button"
            onClick={() => onPick(slot)}
            className={`relative h-24 w-full overflow-hidden rounded-lg border text-center ${
              selected
                ? 'border-amber-300 ring-2 ring-amber-300/70'
                : module
                  ? 'border-orange-400/70'
                  : 'border-dashed border-orange-500/40 bg-slate-950/80 hover:border-orange-300/70'
            }`}
          >
            {module && <img src={module.photo} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />}
            <span className="relative px-2 text-[11px] font-semibold leading-tight text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              {module ? module.name : `Device ${slot + 1}`}
            </span>
          </button>
          </SiteTooltip>
        )
      })}
    </div>
  )
}

const EMPTY_EXTERNAL_PRESSES: ExternalPresses = externalPressesFromStored(null)

function firstExternal(
  layout: ExternalSetup,
  stored: ExternalPresses
): { side: ExternalSide; index: 0 | 1 } | null {
  for (const side of EXTERNAL_SIDES) {
    for (const index of [0, 1] as const) {
      const id = layout[side][index]
      if (!id || !deviceNeedsPress(id)) continue
      const press = stored[side][index]
      if (press?.accepted && press.moduleId === id) continue
      return { side, index }
    }
  }
  return null
}

function externalLabels(layout: ExternalSetup, stored: ExternalPresses): string[] {
  const labels: string[] = []
  for (const side of EXTERNAL_SIDES) {
    const place = side === 'externalLeft' ? 'External 1' : 'External 2'
    for (const index of [0, 1] as const) {
      const id = layout[side][index]
      if (!id || !deviceNeedsPress(id)) continue
      const press = stored[side][index]
      if (press?.accepted && press.moduleId === id) continue
      labels.push(`${place} ${moduleById(id).name}`)
    }
  }
  return labels
}

export default function FlightProfilePage() {
  const { profile: account } = useAuth()
  const verified = Boolean(account?.rsi_handle_verified)
  const fileRef = useRef<HTMLInputElement>(null)
  const [setup, setSetup] = useState<Setup>(EMPTY_SETUP)
  const [presses, setPresses] = useState<PressSetup>(emptyPresses)
  const [externals, setExternals] = useState<ExternalSetup>(EMPTY_EXTERNALS)
  const [externalPresses, setExternalPresses] = useState<ExternalPresses>(EMPTY_EXTERNAL_PRESSES)
  const [listed, setListed] = useState<Set<string>>(DEFAULT_LISTED)
  const [filters, setFilters] = useState<Record<ExternalSide, string>>({ externalLeft: 'ALL', externalRight: 'ALL' })
  const [prompt, setPrompt] = useState<{ side: SideId; slot: SlotId } | null>(null)
  const [externalPrompt, setExternalPrompt] = useState<{ side: ExternalSide; index: 0 | 1 } | null>(null)
  const [active, setActive] = useState<{ side: SideId; slot: SlotId } | null>(null)
  const [externalActive, setExternalActive] = useState<{ side: ExternalSide; index: 0 | 1 } | null>(null)
  const [profile, setProfile] = useState<ParsedFlightProfile | null>(null)
  const [source, setSource] = useState<'account' | 'upload' | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shown, setShown] = useState<{ setup: Setup; externals: ExternalSetup } | null>(null)
  const layoutSave = useRef({
    running: false,
    dirty: false,
    setup: EMPTY_SETUP,
    presses: emptyPresses(),
    externals: EMPTY_EXTERNALS,
    externalPresses: EMPTY_EXTERNAL_PRESSES,
  })
  const editedLayout = useRef(false)
  const hear = hearsButtonPress(typeof navigator === 'undefined' ? '' : navigator.userAgent)

  useEffect(() => {
    let cancelled = false
    void loadFlightProfile().then(async (result) => {
      if (cancelled) return
      if (!editedLayout.current) {
        setSetup(result.setup)
        setPresses(result.presses)
        if (verified) {
          setExternals(result.externals)
          setExternalPresses(result.externalPresses)
        }
        if (hear) {
          const bayPrompt = firstUnpressed(result.setup, result.presses)
          setPrompt(bayPrompt)
          if (!bayPrompt && verified) setExternalPrompt(firstExternal(result.externals, result.externalPresses))
        }
      }
      if (result.error) setError(explainProfileError(result.error))
      if (result.profile) {
        setProfile(result.profile)
        setSource('account')
      }
      setLoading(false)
      const gear = await loadListedGear()
      if (!cancelled && gear) setListed(gear)
    })
    return () => {
      cancelled = true
    }
  }, [hear, verified])

  async function persist(
    nextSetup: Setup,
    nextPresses: PressSetup,
    nextExternals: ExternalSetup = externals,
    nextExternalPresses: ExternalPresses = externalPresses
  ) {
    const gate = layoutSave.current
    gate.setup = nextSetup
    gate.presses = nextPresses
    gate.externals = nextExternals
    gate.externalPresses = nextExternalPresses
    if (gate.running) {
      gate.dirty = true
      return
    }
    gate.running = true
    try {
      do {
        gate.dirty = false
        const setupSnapshot = gate.setup
        const pressSnapshot = gate.presses
        const externalSnapshot = gate.externals
        const externalPressSnapshot = gate.externalPresses
        const savedLayout = await saveFlightLayout(setupSnapshot, verified ? externalSnapshot : EMPTY_EXTERNALS)
        const savedPresses = await saveFlightPresses(
          pressSnapshot,
          verified ? externalPressSnapshot : EMPTY_EXTERNAL_PRESSES
        )
        if (
          gate.setup !== setupSnapshot ||
          gate.presses !== pressSnapshot ||
          gate.externals !== externalSnapshot ||
          gate.externalPresses !== externalPressSnapshot
        ) {
          continue
        }
        if (savedLayout.error) setError(explainProfileError(savedLayout.error))
        else if (savedPresses.error) setError(explainProfileError(savedPresses.error))
      } while (gate.dirty)
    } finally {
      gate.running = false
    }
  }

  const sheets = useMemo(() => {
    if (!shown) return []
    const bay = sheetsFor(shown.setup).map((sheet) => {
      const press = presses[sheet.side][sheet.slot]
      const delta = press?.accepted && press.moduleId === sheet.device.id ? press.delta : 0
      return { device: shiftDevice(sheet.device, delta), side: sheet.side, place: undefined as string | undefined }
    })
    const extra = EXTERNAL_SIDES.flatMap((side) =>
      shown.externals[side].flatMap((id, index) => {
        if (!id) return []
        const device = DEVICES.find((item) => item.id === id)
        if (!device) return []
        const press = externalPresses[side][index]
        const delta = press?.accepted && press.moduleId === id ? press.delta : 0
        const place = `${side === 'externalLeft' ? 'External 1' : 'External 2'} · Device ${index + 1}`
        return [{ device: shiftDevice(device, delta), side: side === 'externalLeft' ? 'left' as const : 'right' as const, place }]
      })
    )
    const leftBay = bay.filter((sheet) => sheet.side === 'left')
    const rightBay = bay.filter((sheet) => sheet.side === 'right')
    const externalLeft = extra.filter((sheet) => sheet.place?.startsWith('External 1'))
    const externalRight = extra.filter((sheet) => sheet.place?.startsWith('External 2'))
    return [...externalLeft, ...leftBay, ...rightBay, ...externalRight]
  }, [shown, presses, externalPresses])
  const dead = useMemo(
    () => (profile && shown ? deadBinds(profile, sheets.map((sheet) => sheet.device)) : []),
    [profile, shown, sheets]
  )

  const pendingPresses = hear
    ? [...unpressedLabels(setup, presses), ...(verified ? externalLabels(externals, externalPresses) : [])]
    : []
  const ready = Boolean(setup.left.main && setup.right.main && profile) && pendingPresses.length === 0
  const missing = [
    !setup.left.main ? 'a left main' : null,
    !setup.right.main ? 'a right main' : null,
    !profile ? 'a flight profile' : null,
    pendingPresses.length ? `a button press for ${pendingPresses.join(', ')}` : null,
  ].filter((item): item is string => Boolean(item))

  function choose(side: SideId, slot: SlotId) {
    setExternalActive(null)
    setActive((current) => (current?.side === side && current.slot === slot ? null : { side, slot }))
  }

  function apply(id: Parameters<typeof place>[3]) {
    if (!active) return
    const same = id != null && setup[active.side][active.slot] === id
    if (same) {
      if (hear) setPrompt(active)
      return
    }
    editedLayout.current = true
    const next = place(setup, active.side, active.slot, id)
    const nextPresses = syncPresses(presses, setup, next)
    setSetup(next)
    setPresses(nextPresses)
    setShown(null)
    setActive(null)
    void persist(next, nextPresses)
    if (hear && id && deviceNeedsPress(id)) {
      setExternalPrompt(null)
      setPrompt({ side: active.side, slot: active.slot })
    }
  }

  function applyExternal(id: string | null) {
    if (!externalActive) return
    const current = externals[externalActive.side][externalActive.index]
    if (id != null && current === id) {
      if (hear && deviceNeedsPress(id)) {
        setPrompt(null)
        setExternalPrompt(externalActive)
      }
      return
    }
    editedLayout.current = true
    const next: ExternalSetup = {
      externalLeft: [...externals.externalLeft] as ExternalSetup['externalLeft'],
      externalRight: [...externals.externalRight] as ExternalSetup['externalRight'],
    }
    next[externalActive.side][externalActive.index] = id
    const nextPresses: ExternalPresses = {
      externalLeft: [...externalPresses.externalLeft] as ExternalPresses['externalLeft'],
      externalRight: [...externalPresses.externalRight] as ExternalPresses['externalRight'],
    }
    if (current !== id) nextPresses[externalActive.side][externalActive.index] = null
    setExternals(next)
    setExternalPresses(nextPresses)
    setShown(null)
    setExternalActive(null)
    void persist(setup, presses, next, nextPresses)
    if (hear && id && deviceNeedsPress(id)) {
      setPrompt(null)
      setExternalPrompt(externalActive)
    }
  }

  function acceptPress(button: number) {
    if (!prompt) return
    const id = setup[prompt.side][prompt.slot]
    const device = id ? DEVICES.find((item) => item.id === id) : null
    const sample = device ? sampleButton(device) : null
    if (!id || !sample) {
      setPrompt(null)
      return
    }
    const nextPresses: PressSetup = {
      left: { ...presses.left },
      right: { ...presses.right },
    }
    nextPresses[prompt.side][prompt.slot] = { moduleId: id, delta: button - sample.button, accepted: true }
    editedLayout.current = true
    setPresses(nextPresses)
    void persist(setup, nextPresses)
    const nextPrompt = firstUnpressed(setup, nextPresses)
    setPrompt(nextPrompt)
    if (!nextPrompt && verified) setExternalPrompt(firstExternal(externals, externalPresses))
  }

  function acceptExternalPress(button: number) {
    if (!externalPrompt) return
    const id = externals[externalPrompt.side][externalPrompt.index]
    const device = id ? DEVICES.find((item) => item.id === id) : null
    const sample = device ? sampleButton(device) : null
    if (!id || !sample) {
      setExternalPrompt(null)
      return
    }
    const nextPresses: ExternalPresses = {
      externalLeft: [...externalPresses.externalLeft] as ExternalPresses['externalLeft'],
      externalRight: [...externalPresses.externalRight] as ExternalPresses['externalRight'],
    }
    nextPresses[externalPrompt.side][externalPrompt.index] = {
      moduleId: id,
      delta: button - sample.button,
      accepted: true,
    }
    editedLayout.current = true
    setExternalPresses(nextPresses)
    void persist(setup, presses, externals, nextPresses)
    setExternalPrompt(firstExternal(externals, nextPresses))
  }

  async function onFile(file: File) {
    setError(null)
    const xml = await file.text()
    const read = readFlightProfile(xml, file.name)
    if (!read.ok) {
      setError(read.error)
      return
    }
    setSaving(true)
    const saved = await saveFlightProfile(read.profile, xml)
    setSaving(false)
    if (saved.error) {
      setError(explainProfileError(saved.error))
      return
    }
    setProfile(read.profile)
    setSource('upload')
    setShown(null)
  }

  const promptId = prompt ? setup[prompt.side][prompt.slot] : null
  const promptDevice = promptId ? DEVICES.find((item) => item.id === promptId) ?? null : null
  const promptSample = promptDevice ? sampleButton(promptDevice) : null
  const choices = active ? optionsFor(setup, active.side, active.slot, listed) : []
  const externalChoices = externalActive ? externalOptions(listed, filters[externalActive.side]) : []
  const activeFilled = active ? setup[active.side][active.slot] : null
  const needsMain = active ? active.slot !== 'main' && !setup[active.side].main : false

  return (
    <FeaturePageLayout title="Flight Profile" badge="Experimental" badgeVariant="explicit">
      <section className="rounded-2xl border border-orange-500/30 bg-slate-950/75 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-center gap-x-10 gap-y-6">
          {verified && (
            <ExternalPanel
              title="External 1"
              side="externalLeft"
              bay={externals.externalLeft}
              filter={filters.externalLeft}
              listed={listed}
              activeIndex={externalActive?.side === 'externalLeft' ? externalActive.index : null}
              onFilter={(value) => setFilters((current) => ({ ...current, externalLeft: value }))}
              onPick={(index) => {
                setActive(null)
                setExternalActive((current) =>
                  current?.side === 'externalLeft' && current.index === index ? null : { side: 'externalLeft', index }
                )
              }}
            />
          )}
          <div className="flex flex-col items-start gap-2">
            <SetupMenu />
            <Bay side="left" setup={setup} active={active?.side === 'left' ? active.slot : null} onPick={(slot) => choose('left', slot)} />
          </div>
          <div className="flex flex-col items-start gap-2">
            <SetupMenu />
            <Bay side="right" setup={setup} active={active?.side === 'right' ? active.slot : null} onPick={(slot) => choose('right', slot)} />
          </div>
          {verified && (
            <ExternalPanel
              title="External 2"
              side="externalRight"
              bay={externals.externalRight}
              filter={filters.externalRight}
              listed={listed}
              activeIndex={externalActive?.side === 'externalRight' ? externalActive.index : null}
              onFilter={(value) => setFilters((current) => ({ ...current, externalRight: value }))}
              onPick={(index) => {
                setActive(null)
                setExternalActive((current) =>
                  current?.side === 'externalRight' && current.index === index ? null : { side: 'externalRight', index }
                )
              }}
            />
          )}
        </div>

        {active && (
          <div className="mt-4 border-t border-orange-500/20 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {active.side === 'left' ? 'Left' : 'Right'} · {SLOT_LABEL[active.slot]}
            </p>
            {needsMain ? (
              <p className="text-sm text-slate-300">Choose this side&apos;s main first. A main is a stick or a throttle.</p>
            ) : choices.length === 0 ? (
              <p className="text-sm text-slate-300">No designed VKB module fits this mount.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {choices.map((module) => {
                  const current = activeFilled === module.id
                  return (
                    <button
                      key={module.id}
                      type="button"
                      onClick={() => apply(module.id)}
                      className={`flex w-36 flex-col overflow-hidden rounded-lg border text-left ${
                        current ? 'border-amber-300 ring-2 ring-amber-300/60' : 'border-orange-500/40 hover:border-orange-300'
                      }`}
                    >
                      <img src={module.photo} alt="" className="h-20 w-full object-cover" />
                      <span className="px-2 py-1.5 text-[11px] font-semibold leading-tight text-slate-100">{module.name}</span>
                    </button>
                  )
                })}
              </div>
            )}
            {activeFilled && (
              <button type="button" onClick={() => apply(null)} className="site-btn-ghost mt-3 px-3 py-1.5 text-slate-300">
                Clear this mount
              </button>
            )}
          </div>
        )}

        {externalActive && (
          <div className="mt-4 border-t border-orange-500/20 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {externalActive.side === 'externalLeft' ? 'External 1' : 'External 2'} · Device {externalActive.index + 1}
            </p>
            {externalChoices.length === 0 ? (
              <p className="text-sm text-slate-300">No extra device is available for this filter yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {externalChoices.map((module) => {
                  const current = externals[externalActive.side][externalActive.index] === module.id
                  return (
                    <button
                      key={module.id}
                      type="button"
                      onClick={() => applyExternal(module.id)}
                      className={`flex w-36 flex-col overflow-hidden rounded-lg border text-left ${
                        current ? 'border-amber-300 ring-2 ring-amber-300/60' : 'border-orange-500/40 hover:border-orange-300'
                      }`}
                    >
                      <img src={module.photo} alt="" className="h-20 w-full object-cover" />
                      <span className="px-2 py-1.5 text-[11px] font-semibold leading-tight text-slate-100">{module.name}</span>
                    </button>
                  )
                })}
              </div>
            )}
            {externals[externalActive.side][externalActive.index] && (
              <button type="button" onClick={() => applyExternal(null)} className="site-btn-ghost mt-3 px-3 py-1.5 text-slate-300">
                Clear this device
              </button>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3 border-t border-orange-500/20 pt-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            {loading && <p className="text-sm text-slate-400">Checking your account for a saved flight profile…</p>}
            {!loading && source === 'account' && profile && (
              <p className="text-sm font-medium text-green-400">
                A flight profile was loaded from your account · {profile.profileName}
              </p>
            )}
            {!loading && source === 'upload' && profile && (
              <p className="text-sm font-medium text-green-400">
                Saved to your account. The previous profile was replaced · {profile.profileName}
              </p>
            )}
            {!loading && !profile && !error && (
              <p className="text-sm text-slate-400">No flight profile is saved on your account yet.</p>
            )}
            {error && <p className="mt-1 text-sm text-red-300">{error}</p>}
            <p className="mt-1 text-xs text-slate-500">Uploading a profile replaces the one saved on your account.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) void onFile(file)
              }}
            />
            <button
              type="button"
              className="site-btn-secondary"
              disabled={saving || loading}
              onClick={() => fileRef.current?.click()}
            >
              {saving ? 'Saving…' : 'Upload profile'}
            </button>
            <button
              type="button"
              className="site-btn-primary px-5 py-2 text-sm"
              disabled={!ready}
              onClick={() => setShown({ setup, externals: verified ? externals : EMPTY_EXTERNALS })}
            >
              Show Map
            </button>
          </div>
        </div>
        {!ready && !loading && (
          <p className="mt-2 text-xs text-slate-500">Show Map needs {missing.join(', ')}.</p>
        )}
      </section>

      {prompt && hear && promptDevice && (
        <ButtonPressModal
          key={`${prompt.side}-${prompt.slot}`}
          moduleName={promptDevice.title}
          controlName={
            promptSample?.name === 'SYS'
              ? 'SYS. It is on the throttle base, next to START'
              : (promptSample?.name ?? 'the first button')
          }
          onAccept={acceptPress}
          onSkip={() => setPrompt(null)}
        />
      )}

      {!prompt && externalPrompt && hear && (() => {
        const id = externals[externalPrompt.side][externalPrompt.index]
        const device = id ? DEVICES.find((item) => item.id === id) : null
        const sample = device ? sampleButton(device) : null
        if (!device || !sample) return null
        return (
          <ButtonPressModal
            key={`${externalPrompt.side}-${externalPrompt.index}`}
            moduleName={device.title}
            controlName={sample.name === 'SYS' ? 'SYS. It is on the throttle base, next to START' : sample.name}
            onAccept={acceptExternalPress}
            onSkip={() => setExternalPrompt(null)}
          />
        )
      })()}

      {shown && profile && (
        <div className="mt-4 w-full min-w-0 overflow-x-hidden">
          <ControlMap
            pages={sheets.map((sheet) => ({ device: sheet.device, side: sheet.side, place: sheet.place }))}
            binds={profile.binds}
            dead={dead}
            profileName={profile.profileName}
          />
        </div>
      )}
    </FeaturePageLayout>
  )
}
