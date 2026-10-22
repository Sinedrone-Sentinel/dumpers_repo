import { useEffect, useState } from 'react'
import {
  FALLBACK_CLOCK,
  hangarBrief,
  hangarPhaseTimers,
  hangarState,
  loadHangarClock,
  type HangarClock,
  type HangarLight,
} from '../lib/executiveHangar'

function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  if (hours > 0) return `${hours}:${mm}:${ss}`
  return `${mm}:${ss}`
}

function lightLabel(light: HangarLight): string {
  if (light === 'green') return 'green'
  if (light === 'red') return 'red'
  return 'dark'
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
  const brief = hangarBrief(state.lights)
  const phases = hangarPhaseTimers(state)
  const lampText = state.lights.map((light, index) => `Light ${index + 1} ${lightLabel(light)}`).join(', ')

  return (
    <main className="site-shell relative z-10 flex min-h-[calc(100dvh-var(--site-header-height,3.5rem))] items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl">
        <h1 className="site-page-title text-center">Executive Hangar</h1>
        <p data-seo="tool-intro" className="mx-auto mt-3 max-w-xl text-center text-sm leading-relaxed text-slate-300">
          See when the five hangar lights are green so the seven compboards can open it. The same clock on every server.
        </p>
        <section className="hangar-panel site-surface mt-6 p-5 sm:p-6" aria-label={lampText}>
          <div className="flex items-end justify-between gap-4">
            <p className="text-lg font-semibold tracking-wide text-white">{brief.title}</p>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-slate-300">
                {state.status === 'online' ? 'Online ends in' : 'Opens in'}
              </p>
              <p className="hangar-readout text-2xl">{clockText(state.statusChangesAt - now)}</p>
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-white">{brief.where}</p>
          <p className="mt-2 text-sm leading-relaxed text-white">
            {brief.next} in <span className="hangar-readout text-base">{clockText(state.nextChangeAt - now)}</span>
          </p>
          <p className="mt-2 text-sm leading-relaxed text-white">{brief.boards}</p>

          <div className="hangar-rack mt-6">
            {state.lights.map((light, index) => (
              <div key={index} className="hangar-lamp" data-light={light}>
                <span className="hangar-lamp-bezel">
                  <span className="hangar-lamp-lens" />
                </span>
                <span className="hangar-lamp-index">{index + 1}</span>
              </div>
            ))}
          </div>

          <ul className="mt-6 space-y-2">
            {phases.map((phase) => {
              const active = phase.kind === 'remaining'
              return (
                <li key={phase.id} className={`hangar-phase ${active ? 'hangar-phase-active' : ''}`}>
                  <span className="text-sm text-white">{phase.label}</span>
                  <span className="hangar-readout">
                    {active ? `${clockText(phase.at - now)} left` : `starts in ${clockText(phase.at - now)}`}
                  </span>
                </li>
              )
            })}
          </ul>

          <p className="site-hint mt-4 text-xs">
            {checked
              ? live
                ? 'Published clock.'
                : 'Saved 4.10.2 clock. The live update did not load.'
              : 'Checking the published clock.'}
            {' '}
            If another player already opened this hangar, the lights in game can look dark while this clock is still open.
          </p>
        </section>
      </div>
    </main>
  )
}
