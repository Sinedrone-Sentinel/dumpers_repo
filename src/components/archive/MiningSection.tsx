import React, { useState, useMemo } from 'react'
import { useMiningData, type MiningData } from '../../hooks/useArchiveData'

const RARITY_ORDER = ['legendary', 'epic', 'rare', 'uncommon', 'common', 'handMineable']

// Mining scanner signatures (RS n*) - base values for ore identification
const ORE_SIGNATURES: Record<string, number> = {
  'Quantainium': 3170,
  'Stileron': 3185,
  'Savrilium': 3200,
  'Ouratite': 3370,
  'Riccite': 3385,
  'Lindinium': 3400,
  'Beryl': 3540,
  'Taranite': 3555,
  'Borase': 3570,
  'Gold': 3585,
  'Bexalite': 3600,
  'Laranite': 3825,
  'Aslarite': 3840,
  'Titanium': 3855,
  'Tungsten': 3870,
  'Agricium': 3885,
  'Torite': 3900,
  'Hephestanite': 4180,
  'Tin': 4195,
  'Quartz': 4210,
  'Corundum': 4225,
  'Copper': 4240,
  'Silicon': 4255,
  'Iron': 4270,
  'Aluminium': 4285,
  'Ice': 4300,
}

// Location to system mapping for context
const LOCATION_SYSTEMS: Record<string, string> = {
  // Stanton moons
  'Aberdeen': 'Stanton',
  'Arial': 'Stanton',
  'Hurston': 'Stanton',
  'Yela': 'Stanton',
  'Yela Ring': 'Stanton',
  'Daymar': 'Stanton',
  'Cellin': 'Stanton',
  'Wala': 'Stanton',
  'Magda': 'Stanton',
  'Clio': 'Stanton',
  'Calliope': 'Stanton',
  'Euterpe': 'Stanton',
  'Lyria': 'Stanton',
  // Stanton stations/belts
  'Aaron Halo': 'Stanton',
  'ARC-L1': 'Stanton',
  'ARC-L2': 'Stanton',
  'ARC-L3': 'Stanton',
  'ARC-L4': 'Stanton',
  'ARC-L5': 'Stanton',
  'CRU-L1': 'Stanton',
  'CRU-L2': 'Stanton',
  'CRU-L3': 'Stanton',
  'CRU-L4': 'Stanton',
  'CRU-L5': 'Stanton',
  'HUR-L1': 'Stanton',
  'HUR-L2': 'Stanton',
  'HUR-L3': 'Stanton',
  'HUR-L4': 'Stanton',
  'HUR-L5': 'Stanton',
  'MIC-L1': 'Stanton',
  'MIC-L2': 'Stanton',
  'MIC-L3': 'Stanton',
  'MIC-L4': 'Stanton',
  'MIC-L5': 'Stanton',
  // Pyro locations
  'Adir': 'Pyro',
  'Bloom': 'Pyro',
  'Fairo': 'Pyro',
  'Fuego': 'Pyro',
  'Ignis': 'Pyro',
  'Terminus': 'Pyro',
  'Vatra': 'Pyro',
  'Vuur': 'Pyro',
  'Pyro IV': 'Pyro',
  'Akiro Cluster': 'Pyro',
  'Glaciem Ring': 'Pyro',
  'Keeger Belt': 'Pyro',
  'Pyro Asteroid Clusters': 'Pyro',
  'All Pyro Planets': 'Pyro',
  // Nyx locations
  'QV Breaker Stations (Nyx)': 'Nyx',
  // Generic
  'Found in All Stanton Deposits': 'Stanton',
}

const SYSTEM_COLORS: Record<string, string> = {
  'Stanton': 'text-blue-400',
  'Pyro': 'text-orange-400',
  'Nyx': 'text-purple-400',
}

const RARITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  legendary: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  epic: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  rare: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  uncommon: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  common: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30' },
  handMineable: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
}

const RARITY_LABELS: Record<string, string> = {
  legendary: 'Legendary',
  epic: 'Epic',
  rare: 'Rare',
  uncommon: 'Uncommon',
  common: 'Common',
  handMineable: 'Hand Mineable',
}

export default function MiningSection() {
  const { data, loading, error, refetch } = useMiningData()
  const [selectedRarity, setSelectedRarity] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<'ores' | 'locations'>('ores')
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)

  const groupedByRarity = useMemo(() => {
    if (!data) return {}
    return data.reduce<Record<string, MiningData[]>>((acc, item) => {
      if (!acc[item.rarity]) acc[item.rarity] = []
      acc[item.rarity].push(item)
      return acc
    }, {})
  }, [data])

  // Build location -> ores map
  const locationOresMap = useMemo(() => {
    if (!data) return {}
    const map: Record<string, MiningData[]> = {}
    for (const ore of data) {
      for (const loc of ore.locations) {
        if (!map[loc]) map[loc] = []
        map[loc].push(ore)
      }
    }
    return map
  }, [data])

  // Get unique locations sorted by system then name
  const allLocations = useMemo(() => {
    return Object.keys(locationOresMap).sort((a, b) => {
      const sysA = LOCATION_SYSTEMS[a] || 'Unknown'
      const sysB = LOCATION_SYSTEMS[b] || 'Unknown'
      if (sysA !== sysB) return sysA.localeCompare(sysB)
      return a.localeCompare(b)
    })
  }, [locationOresMap])

  const filteredData = useMemo(() => {
    let filtered = data || []
    
    if (selectedRarity) {
      filtered = filtered.filter((item) => item.rarity === selectedRarity)
    }
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (item) =>
          item.ore_name.toLowerCase().includes(term) ||
          item.locations.some((loc) => loc.toLowerCase().includes(term))
      )
    }
    
    return filtered
  }, [data, selectedRarity, searchTerm])

  const filteredLocations = useMemo(() => {
    if (!searchTerm) return allLocations
    const term = searchTerm.toLowerCase()
    return allLocations.filter(loc => 
      loc.toLowerCase().includes(term) ||
      locationOresMap[loc]?.some(ore => ore.ore_name.toLowerCase().includes(term))
    )
  }, [allLocations, locationOresMap, searchTerm])

  if (loading) {
    return (
      <div className="w-full">
        <LoadingState />
      </div>
    )
  }

  if (error) {
    return (
      <div className="w-full">
        <ErrorState message={error} onRetry={refetch} />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="w-full">
        <EmptyState />
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      {/* View mode toggle */}
      <div className="flex items-center gap-2 p-1 bg-slate-800/50 rounded-lg w-fit">
        <button
          onClick={() => setViewMode('ores')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            viewMode === 'ores' 
              ? 'bg-orange-600 text-white' 
              : 'text-slate-400 hover:text-white'
          }`}
        >
          By Ore
        </button>
        <button
          onClick={() => setViewMode('locations')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            viewMode === 'locations' 
              ? 'bg-orange-600 text-white' 
              : 'text-slate-400 hover:text-white'
          }`}
        >
          By Location
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder={viewMode === 'ores' ? "Search ores or locations..." : "Search locations or ores..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="site-input w-full pl-9 pr-4 py-2 text-sm"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        {viewMode === 'ores' && (
          <select
            value={selectedRarity || ''}
            onChange={(e) => setSelectedRarity(e.target.value || null)}
            className="site-input px-3 py-2 text-sm"
          >
            <option value="">All Rarities</option>
            {RARITY_ORDER.map((rarity) => (
              <option key={rarity} value={rarity}>
                {RARITY_LABELS[rarity]} ({groupedByRarity[rarity]?.length || 0})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Stats summary - only in ore view */}
      {viewMode === 'ores' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {RARITY_ORDER.map((rarity) => {
            const colors = RARITY_COLORS[rarity]
            const count = groupedByRarity[rarity]?.length || 0
            return (
              <button
                key={rarity}
                onClick={() => setSelectedRarity(selectedRarity === rarity ? null : rarity)}
                className={`
                  p-2 rounded-lg border text-center transition-all
                  ${selectedRarity === rarity ? colors.bg + ' ' + colors.border : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600'}
                `}
              >
                <span className={`text-lg font-bold ${selectedRarity === rarity ? colors.text : 'text-white'}`}>
                  {count}
                </span>
                <span className="block text-[10px] text-slate-500 uppercase tracking-wider">
                  {RARITY_LABELS[rarity]}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Results */}
      {viewMode === 'ores' ? (
        <div className="space-y-3">
          {filteredData.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No matching ores found.</p>
          ) : (
            filteredData.map((item) => (
              <OreCard key={item.id} item={item} onLocationClick={setSelectedLocation} />
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLocations.length === 0 ? (
            <p className="text-center text-slate-500 py-8">No matching locations found.</p>
          ) : (
            filteredLocations.map((location) => (
              <LocationCard 
                key={location} 
                location={location} 
                ores={locationOresMap[location] || []} 
              />
            ))
          )}
        </div>
      )}

      {/* Location detail modal */}
      {selectedLocation && (
        <LocationModal
          location={selectedLocation}
          ores={locationOresMap[selectedLocation] || []}
          onClose={() => setSelectedLocation(null)}
        />
      )}
    </div>
  )
}

function OreCard({ item, onLocationClick }: { item: MiningData; onLocationClick: (loc: string) => void }) {
  const colors = RARITY_COLORS[item.rarity] || RARITY_COLORS.common
  const signature = ORE_SIGNATURES[item.ore_name]
  
  return (
    <div className={`p-4 rounded-lg border ${colors.bg} ${colors.border}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className={`font-semibold ${colors.text}`}>{item.ore_name}</h3>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-slate-500 uppercase tracking-wider">
              {RARITY_LABELS[item.rarity]}
            </span>
            {signature && (
              <span className="text-xs text-amber-400 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded">
                RS {signature}
              </span>
            )}
          </div>
        </div>
        <span className="text-xs text-slate-400 bg-slate-800/50 px-2 py-1 rounded">
          {item.locations.length} location{item.locations.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {item.locations.map((location, idx) => {
          const system = LOCATION_SYSTEMS[location]
          const systemColor = system ? SYSTEM_COLORS[system] : 'text-slate-400'
          return (
            <button
              key={idx}
              onClick={() => onLocationClick(location)}
              className="text-xs px-2 py-1 rounded bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 hover:text-white transition-colors cursor-pointer text-left"
            >
              {location}
              {system && (
                <span className={`ml-1 ${systemColor} opacity-70`}>({system})</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LocationCard({ location, ores }: { location: string; ores: MiningData[] }) {
  const system = LOCATION_SYSTEMS[location]
  const systemColor = system ? SYSTEM_COLORS[system] : 'text-slate-400'
  
  // Sort ores by rarity (legendary first)
  const sortedOres = [...ores].sort((a, b) => {
    return RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity)
  })
  
  return (
    <div className="p-4 rounded-lg border bg-slate-800/30 border-slate-700/50">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-white">{location}</h3>
          {system && (
            <span className={`text-xs ${systemColor} uppercase tracking-wider`}>
              {system} System
            </span>
          )}
        </div>
        <span className="text-xs text-slate-400 bg-slate-800/50 px-2 py-1 rounded">
          {ores.length} ore{ores.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {sortedOres.map((ore) => {
          const colors = RARITY_COLORS[ore.rarity] || RARITY_COLORS.common
          const signature = ORE_SIGNATURES[ore.ore_name]
          return (
            <span
              key={ore.id}
              className={`text-xs px-2 py-1 rounded ${colors.bg} ${colors.text} border ${colors.border}`}
            >
              {ore.ore_name}
              {signature && (
                <span className="ml-1 text-amber-400/70 font-mono text-[10px]">
                  {signature}
                </span>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function LocationModal({ location, ores, onClose }: { location: string; ores: MiningData[]; onClose: () => void }) {
  const system = LOCATION_SYSTEMS[location]
  const systemColor = system ? SYSTEM_COLORS[system] : 'text-slate-400'
  
  // Sort ores by rarity
  const sortedOres = [...ores].sort((a, b) => {
    return RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity)
  })
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full max-h-[80vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{location}</h2>
            {system && (
              <span className={`text-sm ${systemColor}`}>{system} System</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          <p className="text-sm text-slate-400 mb-4">
            {ores.length} ore{ores.length !== 1 ? 's' : ''} found at this location:
          </p>
          <div className="space-y-2">
            {sortedOres.map((ore) => {
              const colors = RARITY_COLORS[ore.rarity] || RARITY_COLORS.common
              const signature = ORE_SIGNATURES[ore.ore_name]
              return (
                <div
                  key={ore.id}
                  className={`p-3 rounded-lg ${colors.bg} border ${colors.border}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-medium ${colors.text}`}>{ore.ore_name}</span>
                    {signature && (
                      <span className="text-xs text-amber-400 font-mono bg-amber-500/10 px-2 py-1 rounded">
                        RS {signature}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500 uppercase">
                    {RARITY_LABELS[ore.rarity]}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="w-full flex items-center justify-center min-h-[400px]">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-orange-500/30 border-t-orange-500 rounded-full animate-spin mx-auto" />
        <p className="text-sm text-slate-400">Loading mining data...</p>
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      </div>
      <p className="text-slate-400">No mining data available yet.</p>
    </div>
  )
}
