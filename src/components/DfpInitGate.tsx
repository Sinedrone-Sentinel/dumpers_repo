import React, { useEffect, useState } from 'react'
import { ensureDfpEngine } from '../lib/dfpEngine'

export default function DfpInitGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ensureDfpEngine()
      .then(() => setReady(true))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load DFP engine')
      })
  }, [])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200 p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-lg font-semibold text-white">Pricing engine unavailable</h1>
          <p className="text-sm text-slate-400">{error}</p>
        </div>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        Loading pricing engine…
      </div>
    )
  }

  return <>{children}</>
}
