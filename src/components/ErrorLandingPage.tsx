import React from 'react'
import { Link } from '@tanstack/react-router'
import { getErrorCopy } from '../lib/errorMessages'

interface ErrorLandingPageProps {
  statusCode: number
  onRetry?: () => void
}

export default function ErrorLandingPage({ statusCode, onRetry }: ErrorLandingPageProps) {
  const copy = getErrorCopy(statusCode)

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] px-6 py-16 text-center">
      <p
        className="text-[clamp(5rem,22vw,11rem)] font-black leading-none text-transparent bg-clip-text select-none"
        style={{
          fontFamily: 'Orbitron, sans-serif',
          backgroundImage: 'linear-gradient(to bottom, #f87171, #7c3aed)',
          WebkitBackgroundClip: 'text',
        }}
        aria-label={`Error ${statusCode}`}
      >
        {statusCode}
      </p>

      <h1
        className="mt-4 text-2xl sm:text-3xl font-bold text-white"
        style={{ fontFamily: 'Orbitron, sans-serif' }}
      >
        {copy.headline}
      </h1>

      <p className="mt-4 max-w-lg text-slate-400 text-sm sm:text-base leading-relaxed">
        {copy.message}
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          to="/"
          className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Return to base
        </Link>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg text-sm font-medium transition-colors"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  )
}
