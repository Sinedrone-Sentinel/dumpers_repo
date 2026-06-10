import React, { useState, useMemo } from 'react'
import { useOrdnanceData, type OrdnanceData } from '../../hooks/useArchiveData'

const GUIDANCE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Cross-Section': { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  'Electromagnetic': { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  'Infrared': { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
}

const GUIDANCE_DESCRIPTIONS: Record<string, string> = {
  'Cross-Section': 'Tracks physical signature - best against large targets',
  'Electromagnetic': 'Tracks EM emissions - best against active shields/power',
  'Infrared': 'Tracks heat signature - best against running engines',
}

export default function OrdnanceSection() {
  const { data, loading, error, refetch } = useOrdnanceData()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedGuidance, setSelectedGuidance] = useState<string | null>(null)
  const [selectedSize, setSelectedSize] = useState<number | null>(null)
  const [showTorpedoesOnly, setShowTorpedoesOnly] = useState(false)

  const sizes = useMemo(() => {
    if (!data) return []
    return [...new Set(data.map((o) => o.size))].sort((a, b) => a - b)
  }, [data])

  const guidanceTypes = useMemo(() => {
    if (!data) return []
    return [...new Set(data.map((o) => o.guidance))].sort()
  }, [data])

  const filteredData = useMemo(() => {
    let filtered = data || []
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (o) =>
          o.display_name.toLowerCase().includes(term) ||
          o.manufacturer?.toLowerCase().includes(term) ||
          o.guidance.toLowerCase().includes(term)
      )
    }
    if (selectedGuidance) filtered = filtered.filter((o) => o.guidance === selectedGuidance)
    if (selectedSize !== null) filtered = filtered.filter((o) => o.size === selectedSize)
    if (showTorpedoesOnly) filtered = filtered.filter((o) => o.is_torpedo)
    
    return filtered.sort((a, b) => {
      if (a.size !== b.size) return a.size - b.size
      return a.display_name.localeCompare(b.display_name)
    })
  }, [data, searchTerm, selectedGuidance, selectedSize, showTorpedoesOnly])

  const stats = useMemo(() => {
    if (!data) return { missiles: 0, torpedoes: 0, gimbal: 0 }
    return {
      missiles: data.filter((o) => !o.is_torpedo).length,
      torpedoes: data.filter((o) => o.is_torpedo).length,
      gimbal: data.filter((o) => o.is_gimbal).length,
    }
  }, [data])

  const clearFilters = () => {
    setSearchTerm('')
    setSelectedGuidance(null)
    setSelectedSize(null)
    setShowTorpedoesOnly(false)
  }

  const hasFilters = searchTerm || selectedGuidance || selectedSize !== null || showTorpedoesOnly

  if (loading) {
    return <LoadingState />
  }

  if (error) {
    return <ErrorState message={error} onRetry={refetch} />
  }

  if (!data || data.length === 0) {
    return <EmptyState />
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 text-center">
          <span className="text-xl font-bold text-white">{stats.missiles}</span>
          <span className="block text-[10px] text-slate-500 uppercase tracking-wider">Missiles</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 text-center">
          <span className="text-xl font-bold text-white">{stats.torpedoes}</span>
          <span className="block text-[10px] text-slate-500 uppercase tracking-wider">Torpedoes</span>
        </div>
        <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 text-center">
          <span className="text-xl font-bold text-white">{stats.gimbal}</span>
          <span className="block text-[10px] text-slate-500 uppercase tracking-wider">Gimbal</span>
        </div>
      </div>

      {/* Guidance type legend */}
      <div className="p-4 rounded-lg bg-slate-800/30 border border-slate-700/50">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Guidance Types</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries(GUIDANCE_DESCRIPTIONS).map(([type, desc]) => {
            const colors = GUIDANCE_COLORS[type]
            return (
              <div key={type} className={`p-2 rounded border ${colors.bg} ${colors.border}`}>
                <span className={`text-sm font-medium ${colors.text}`}>{type}</span>
                <p className="text-[10px] text-slate-400 mt-0.5">{desc}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search ordnance..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="site-input w-full pl-9 pr-4 py-2 text-sm"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={selectedGuidance || ''}
          onChange={(e) => setSelectedGuidance(e.target.value || null)}
          className="site-input px-3 py-1.5 text-xs"
        >
          <option value="">All Guidance</option>
          {guidanceTypes.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        
        <select
          value={selectedSize ?? ''}
          onChange={(e) => setSelectedSize(e.target.value ? Number(e.target.value) : null)}
          className="site-input px-3 py-1.5 text-xs"
        >
          <option value="">All Sizes</option>
          {sizes.map((s) => (
            <option key={s} value={s}>Size {s}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 px-3 py-1.5 text-xs text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={showTorpedoesOnly}
            onChange={(e) => setShowTorpedoesOnly(e.target.checked)}
            className="rounded border-slate-600 bg-slate-800 text-orange-500 focus:ring-orange-500/20"
          />
          Torpedoes only
        </label>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="text-xs text-slate-500">
        Showing {filteredData.length} of {data.length} ordnance
      </div>

      {/* Results */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredData.length === 0 ? (
          <p className="col-span-full text-center text-slate-500 py-8">No matching ordnance found.</p>
        ) : (
          filteredData.map((item) => (
            <OrdnanceCard key={item.id} item={item} />
          ))
        )}
      </div>
    </div>
  )
}

function OrdnanceCard({ item }: { item: OrdnanceData }) {
  const colors = GUIDANCE_COLORS[item.guidance] || GUIDANCE_COLORS['Infrared']
  
  return (
    <div className={`p-3 rounded-lg border ${colors.bg} ${colors.border}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-sm text-white leading-tight">{item.display_name}</h3>
        <div className="flex items-center gap-1 shrink-0">
          {item.is_torpedo && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
              TORP
            </span>
          )}
          {item.is_gimbal && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              GIMBAL
            </span>
          )}
        </div>
      </div>
      
      <div className="mt-2 space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Guidance:</span>
          <span className={colors.text}>{item.guidance}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Size:</span>
          <span className="text-slate-300">{item.size}</span>
          {item.manufacturer && (
            <>
              <span className="text-slate-600">|</span>
              <span className="text-slate-500">Mfr:</span>
              <span className="text-slate-300">{item.manufacturer}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin mx-auto" />
        <p className="text-sm text-slate-400">Loading ordnance data...</p>
      </div>
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 mb-4">
        <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <p className="text-slate-400 mb-4">{message}</p>
      <button onClick={onRetry} className="px-4 py-2 text-sm bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors">
        Try Again
      </button>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-800/50 border border-slate-700/50 mb-4">
        <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      </div>
      <p className="text-slate-400">No ordnance data available yet.</p>
    </div>
  )
}
