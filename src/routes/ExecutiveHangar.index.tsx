import { useEffect, useState } from 'react'
import FeaturePageLayout from '../components/layout/FeaturePageLayout'
import {
  FALLBACK_CLOCK,
  hangarState,
  loadHangarClock,
  type HangarClock,
  type HangarLight,
  type HangarPhase,
} from '../lib/executiveHangar'

const PHASE_LABEL: Record<HangarPhase, string> = {
  charging: 'Charging',
  insert: 'Insert the 7 compboards',
  blackout: 'Powered down',
}

function lampClass(light: HangarLight): string {
  if (light === 'green') return 'bg-green-500'
  if (light === 'red') return 'bg-red-500'
  return 'border border-slate-600 bg-slate-900'
}

function remain(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function localTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function ExecutiveHangarRoute() {
  const [now, setNow] = useState(() => Date.now())
  const [clock, setClock] = useState<HangarClock>(FALLBACK_CLOCK)
  const [live, setLive] = useState(false)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    let cancelled = false
    loadHangarClock()
      .then((result) => {
        if (cancelled) return
        setClock(result.clock)
        setLive(result.live)
        setChecked(true)
      })
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [])

  const state = hangarState(now, clock)

  return (
    <FeaturePageLayout
      title="Executive Hangar"
      subtitle="Five lights at PYAM-EXHANG-0-1. The same clock on every server."
      seoIntro="See when the Star Citizen Executive Hangar lights are green so the seven compboards can open the hangar."
    >
      <section className="site-card max-w-xl p-4">
        <div className="flex items-center gap-3" aria-hidden="true">
          {state.lights.map((light, index) => (
            <span key={index} className={`h-8 w-8 rounded-full ${lampClass(light)}`} />
          ))}
        </div>
        <p className="mt-4 text-sm font-semibold text-white">{PHASE_LABEL[state.phase]}</p>
        <p className="site-hint mt-1 text-sm">Next light in {remain(state.nextChangeAt - now)}</p>
        <p className="mt-3 text-sm text-white">
          {state.phase === 'insert'
            ? `Compboards work until ${localTime(state.insertEndsAt)}`
            : `Compboards work at ${localTime(state.insertOpensAt)}`}
        </p>
        <p className="site-hint mt-4 text-xs">
          {checked
            ? live
              ? 'This is the published hangar clock.'
              : 'Showing the saved 4.10.2 clock. The live update did not load.'
            : 'Checking the published clock.'}
          {' '}
          If another player already opened this hangar, the lights in game can look dark while this clock is still open.
        </p>
      </section>
    </FeaturePageLayout>
  )
}
