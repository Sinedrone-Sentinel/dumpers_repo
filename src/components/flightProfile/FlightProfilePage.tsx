import { useEffect, useMemo, useRef, useState } from 'react'
import FeaturePageLayout from '../layout/FeaturePageLayout'
import SiteTooltip from '../SiteTooltip'
import ControlMap from './ControlMap'
import ButtonPressModal from './ButtonPressModal'
import { loadFlightProfile, saveFlightLayout, saveFlightPresses, saveFlightProfile } from '../../lib/flightProfile/api'
import { DEVICES } from '../../lib/flightProfile/devices'
import {
  BAY_SLOTS,
  EMPTY_SETUP,
  SLOT_LABEL,
  emptyPresses,
  firstUnpressed,
  hearsButtonPress,
  moduleById,
  optionsFor,
  place,
  sampleButton,
  sheetsFor,
  shiftDevice,
  slotAvailable,
  syncPresses,
  unpressedLabels,
  type PressSetup,
  type Setup,
  type SideId,
  type SlotId,
} from '../../lib/flightProfile/catalog'
import { deadBinds, readFlightProfile, type ParsedFlightProfile } from '../../lib/flightProfile/parseProfile'

function explainProfileError(message: string): string {
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

export default function FlightProfilePage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [setup, setSetup] = useState<Setup>(EMPTY_SETUP)
  const [presses, setPresses] = useState<PressSetup>(emptyPresses)
  const [prompt, setPrompt] = useState<{ side: SideId; slot: SlotId } | null>(null)
  const [active, setActive] = useState<{ side: SideId; slot: SlotId } | null>(null)
  const [profile, setProfile] = useState<ParsedFlightProfile | null>(null)
  const [source, setSource] = useState<'account' | 'upload' | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shown, setShown] = useState<Setup | null>(null)
  const layoutSave = useRef({ running: false, dirty: false, setup: EMPTY_SETUP, presses: emptyPresses() })
  const editedLayout = useRef(false)
  const hear = hearsButtonPress(typeof navigator === 'undefined' ? '' : navigator.userAgent)

  useEffect(() => {
    let cancelled = false
    void loadFlightProfile().then((result) => {
      if (cancelled) return
      if (!editedLayout.current) {
        setSetup(result.setup)
        setPresses(result.presses)
        if (hear) setPrompt(firstUnpressed(result.setup, result.presses))
      }
      if (result.error) setError(explainProfileError(result.error))
      if (result.profile) {
        setProfile(result.profile)
        setSource('account')
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [hear])

  async function persist(nextSetup: Setup, nextPresses: PressSetup) {
    const gate = layoutSave.current
    gate.setup = nextSetup
    gate.presses = nextPresses
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
        const savedLayout = await saveFlightLayout(setupSnapshot)
        const savedPresses = await saveFlightPresses(pressSnapshot)
        if (gate.setup !== setupSnapshot || gate.presses !== pressSnapshot) continue
        if (savedLayout.error) setError(explainProfileError(savedLayout.error))
        else if (savedPresses.error) setError(explainProfileError(savedPresses.error))
      } while (gate.dirty)
    } finally {
      gate.running = false
    }
  }

  const sheets = useMemo(() => {
    if (!shown) return []
    return sheetsFor(shown).map((sheet) => {
      const press = presses[sheet.side][sheet.slot]
      const delta = press?.accepted && press.moduleId === sheet.device.id ? press.delta : 0
      return { ...sheet, device: shiftDevice(sheet.device, delta) }
    })
  }, [shown, presses])
  const dead = useMemo(
    () => (profile && shown ? deadBinds(profile, sheets.map((sheet) => sheet.device)) : []),
    [profile, shown, sheets]
  )

  const pendingPresses = hear ? unpressedLabels(setup, presses) : []
  const ready = Boolean(setup.left.main && setup.right.main && profile) && pendingPresses.length === 0
  const missing = [
    !setup.left.main ? 'a left main' : null,
    !setup.right.main ? 'a right main' : null,
    !profile ? 'a flight profile' : null,
    pendingPresses.length ? `a button press for ${pendingPresses.join(', ')}` : null,
  ].filter((item): item is string => Boolean(item))

  function choose(side: SideId, slot: SlotId) {
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
    if (hear && id) setPrompt({ side: active.side, slot: active.slot })
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
    setPrompt(firstUnpressed(setup, nextPresses))
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
  const choices = active ? optionsFor(setup, active.side, active.slot) : []
  const activeFilled = active ? setup[active.side][active.slot] : null
  const needsMain = active ? active.slot !== 'main' && !setup[active.side].main : false

  return (
    <FeaturePageLayout title="Flight Profile" badge="Experimental" badgeVariant="explicit">
      <section className="rounded-2xl border border-orange-500/30 bg-slate-950/75 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-center gap-x-16 gap-y-6">
          <Bay side="left" setup={setup} active={active?.side === 'left' ? active.slot : null} onPick={(slot) => choose('left', slot)} />
          <Bay side="right" setup={setup} active={active?.side === 'right' ? active.slot : null} onPick={(slot) => choose('right', slot)} />
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
              onClick={() => setShown(setup)}
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

      {shown && profile && (
        <div className="mt-4 w-full min-w-0 overflow-x-hidden">
          <ControlMap
            pages={sheets.map((sheet) => ({ device: sheet.device, side: sheet.side }))}
            binds={profile.binds}
            dead={dead}
            profileName={profile.profileName}
          />
        </div>
      )}
    </FeaturePageLayout>
  )
}
