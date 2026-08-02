import React from 'react'
import type { BootstrapStep } from '../../lib/bootstrapSteps'
import { computeBootstrapProgress } from '../../lib/bootstrapSteps'

function SpaceshipIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 80 40"
      className={className}
      aria-hidden="true"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6 20h18"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.35"
      />
      <path
        d="M24 20h10"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.2"
      />
      <path
        d="M18 20 L52 10 L74 20 L52 30 Z"
        fill="currentColor"
        opacity="0.95"
      />
      <path d="M52 10 L74 20 L52 30 Z" fill="currentColor" opacity="0.55" />
      <path
        d="M30 16 L38 20 L30 24 Z"
        fill="currentColor"
        opacity="0.45"
      />
      <circle cx="58" cy="20" r="2.5" fill="#fb923c" opacity="0.9" />
      <path
        d="M74 18 L78 20 L74 22 Z"
        fill="#fdba74"
      />
    </svg>
  )
}

function stepFillPercent(step: BootstrapStep): number {
  if (step.status === 'done' || step.status === 'skipped') return 100
  if (step.status === 'error') return Math.max(step.progress, 100)
  if (step.status === 'active') return Math.max(step.progress, 12)
  return 0
}

function StepStatusMark({ status }: { status: BootstrapStep['status'] }) {
  if (status === 'done' || status === 'skipped') {
    return <span className="text-emerald-400 text-[10px] font-bold tracking-wider">OK</span>
  }
  if (status === 'error') {
    return <span className="text-amber-400 text-[10px] font-bold tracking-wider">HOLD</span>
  }
  if (status === 'active') {
    return (
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-400" />
      </span>
    )
  }
  return <span className="h-2 w-2 rounded-full bg-slate-700" />
}

function BootstrapStepRow({ step }: { step: BootstrapStep }) {
  const fill = stepFillPercent(step)
  const isActive = step.status === 'active'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`text-xs sm:text-sm tracking-wide uppercase ${
            isActive ? 'text-orange-200' : step.status === 'done' ? 'text-slate-300' : 'text-slate-500'
          }`}
          style={{ fontFamily: 'Orbitron, sans-serif' }}
        >
          {step.label}
        </span>
        <StepStatusMark status={step.status} />
      </div>
      <div className="relative site-progress h-2">
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            step.status === 'error'
              ? 'bg-gradient-to-r from-amber-700 to-amber-500'
              : 'site-progress-bar'
          }`}
          style={{ width: `${fill}%` }}
        />
        {isActive && (
          <div
            className="absolute inset-y-0 w-8 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-[shimmer_1.4s_ease-in-out_infinite]"
            style={{ left: `${Math.max(fill - 12, 0)}%` }}
          />
        )}
      </div>
    </div>
  )
}

interface AppBootstrapScreenProps {
  steps: BootstrapStep[]
}

export default function AppBootstrapScreen({ steps }: AppBootstrapScreenProps) {
  const overall = computeBootstrapProgress(steps)
  const activeStep = steps.find((s) => s.status === 'active')

  return (
    <div className="site-page-bg min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center space-y-2">
          <p
            className="text-orange-400/90 text-xs tracking-[0.35em] uppercase"
            style={{ fontFamily: 'Orbitron, sans-serif' }}
          >
            Dumper&apos;s Repo
          </p>
          <h1
            className="text-white text-xl sm:text-2xl font-black uppercase tracking-[0.2em]"
            style={{ fontFamily: 'Orbitron, sans-serif' }}
          >
            Systems Initializing
          </h1>
          <p className="text-slate-500 text-sm">
            {activeStep ? `${activeStep.label}…` : 'Preparing your hangar bay…'}
          </p>
        </div>

        <div className="relative pt-2 pb-1">
          <div className="site-progress h-1">
            <div
              className="site-progress-bar transition-all duration-500 ease-out"
              style={{ width: `${overall}%` }}
            />
          </div>
          <div
            className="absolute top-0 -translate-x-1/2 transition-all duration-500 ease-out pointer-events-none"
            style={{ left: `${Math.min(Math.max(overall, 4), 96)}%` }}
          >
            <div className="relative -mt-1">
              <div className="absolute inset-0 blur-md bg-orange-500/30 rounded-full scale-150" />
              <SpaceshipIcon className="relative w-14 h-7 text-orange-300 drop-shadow-[0_0_12px_rgba(251,146,60,0.55)]" />
            </div>
          </div>
        </div>

        <div className="site-surface backdrop-blur-sm p-5 sm:p-6 space-y-5 shadow-xl shadow-black/30">
          {steps.map((step) => (
            <BootstrapStepRow key={step.id} step={step} />
          ))}
        </div>

        <p className="text-center text-[11px] text-slate-600 tracking-wider uppercase">
          {overall}% complete
        </p>
      </div>
    </div>
  )
}
