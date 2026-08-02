import React, { useState, useMemo } from 'react'
import gameReputationData from '../../data/game-reputation.json'

interface FactionStanding {
  name: string
  minReputation: number
}

interface CareerTrack {
  name: string
  standings: FactionStanding[]
}

interface Faction {
  name: string
  uuid: string
  standings: FactionStanding[]
  careers?: Record<string, CareerTrack>
}

type FactionsData = Record<string, Faction>

// Transform game-reputation.json factionStandings to the expected format
const factions: FactionsData = Object.entries(gameReputationData.factionStandings || {}).reduce((acc, [key, data]) => {
  const factionData = data as {
    faction: string
    factionKey: string
    scopeName?: string
    standings?: Array<{ displayName: string; minReputation: number; gated?: boolean }>
    careers?: Record<string, { scopeKey: string; name?: string; standings: Array<{ displayName: string; minReputation: number; gated?: boolean }> }>
  }
  
  // Convert standings format (displayName -> name)
  const standings: FactionStanding[] = (factionData.standings || []).map(s => ({
    name: s.displayName,
    minReputation: s.minReputation
  }))
  
  // Convert careers format if present
  let careers: Record<string, CareerTrack> | undefined
  if (factionData.careers && Object.keys(factionData.careers).length > 0) {
    careers = Object.entries(factionData.careers).reduce((careerAcc, [careerKey, careerData]) => {
      // Format career name from key (e.g., "bounty_bountyhuntersguild" -> "Bounty")
      const careerName = careerData.name || careerKey
        .split('_')[0]
        .replace(/([A-Z])/g, ' $1')
        .trim()
        .replace(/^./, c => c.toUpperCase())
      
      careerAcc[careerKey] = {
        name: careerName,
        standings: (careerData.standings || []).map(s => ({
          name: s.displayName,
          minReputation: s.minReputation
        }))
      }
      return careerAcc
    }, {} as Record<string, CareerTrack>)
  }
  
  // Get faction info from the factions list for UUID
  const factionInfo = (gameReputationData.factions as Record<string, { id?: string }>)?.[key]
  
  acc[key] = {
    name: factionData.faction,
    uuid: factionInfo?.id || key,
    standings,
    careers
  }
  
  return acc
}, {} as FactionsData)

function getStandingColor(standing: string, index: number, total: number): string {
  const lowerName = standing.toLowerCase()
  
  if (lowerName.includes('hostile')) return 'bg-red-500/20 text-red-400 border-red-500/30'
  if (lowerName.includes('neutral') || lowerName.includes('applicant') || lowerName.includes('not eligible') || lowerName.includes('volunteer') || lowerName.includes('enthusiast')) {
    return 'bg-slate-500/20 text-slate-400 border-slate-500/30'
  }
  
  if (index === total - 1) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30'
  if (index === total - 2) return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
  if (index === total - 3) return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
  if (index >= total - 4) return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
  if (index >= 2) return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  
  return 'bg-green-500/20 text-green-400 border-green-500/30'
}

export default function FactionsSection() {
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedFaction, setExpandedFaction] = useState<string | null>(null)

  const factionList = useMemo(() => {
    return Object.entries(factions)
      .map(([slug, faction]) => ({ slug, ...faction }))
      .filter((f) => f.name !== '<= PLACEHOLDER =>')
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [])

  const filteredFactions = useMemo(() => {
    if (!searchTerm) return factionList
    const term = searchTerm.toLowerCase()
    return factionList.filter((f) => f.name.toLowerCase().includes(term))
  }, [factionList, searchTerm])

  const toggleFaction = (slug: string) => {
    setExpandedFaction(expandedFaction === slug ? null : slug)
  }

  return (
    <div className="space-y-6">
      <div className="p-4 site-surface">
        <h3 className="text-sm font-semibold text-slate-300 mb-2">Understanding Reputation</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          Each faction tracks your reputation separately. Completing contracts and missions 
          increases your standing, unlocking access to higher-tier contracts and blueprint rewards.
          <span className="text-orange-400"> Note: Different factions use different rank names</span> — 
          Covalex uses "Trainee → Master" while Bounty Hunters Guild uses "Applicant → Guild Steward".
          Some factions also have multiple career tracks (e.g., Bounty Hunting vs Security).
        </p>
      </div>

      <div className="relative">
        <input
          type="text"
          placeholder="Search factions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="site-input w-full pl-9 pr-4 py-2 text-sm"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      <div className="text-xs text-slate-500">
        {filteredFactions.length} faction{filteredFactions.length !== 1 ? 's' : ''} found
      </div>

      <div className="space-y-2">
        {filteredFactions.length === 0 ? (
          <p className="text-center text-slate-500 py-8">No matching factions found.</p>
        ) : (
          filteredFactions.map((faction) => (
            <FactionCard
              key={faction.slug}
              faction={faction}
              isExpanded={expandedFaction === faction.slug}
              onToggle={() => toggleFaction(faction.slug)}
            />
          ))
        )}
      </div>
    </div>
  )
}

interface FactionCardProps {
  faction: Faction & { slug: string }
  isExpanded: boolean
  onToggle: () => void
}

function FactionCard({ faction, isExpanded, onToggle }: FactionCardProps) {
  const [selectedCareer, setSelectedCareer] = useState<string | null>(null)
  
  const hasMultipleCareers = faction.careers && Object.keys(faction.careers).length > 0
  const careerKeys = hasMultipleCareers ? Object.keys(faction.careers!) : []
  
  const activeStandings = useMemo(() => {
    if (hasMultipleCareers && selectedCareer && faction.careers![selectedCareer]) {
      return faction.careers![selectedCareer].standings.filter(s => s.minReputation >= 0)
    }
    return faction.standings.filter((s) => s.minReputation >= 0)
  }, [faction, selectedCareer, hasMultipleCareers])
  
  const maxRep = activeStandings[activeStandings.length - 1]?.minReputation || 0

  return (
    <div className="site-section">
      <button
        onClick={onToggle}
        className="site-section-header w-full flex items-center justify-between transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-600/30 to-amber-600/30 border border-orange-500/30 flex items-center justify-center">
            <span className="text-sm font-bold text-orange-300">
              {faction.name.charAt(0)}
            </span>
          </div>
          <div className="text-left">
            <h4 className="text-sm font-medium text-white">{faction.name}</h4>
            <span className="text-[10px] text-slate-500">
              {activeStandings.length} standing levels
              {hasMultipleCareers && ` • ${careerKeys.length} career tracks`}
            </span>
          </div>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isExpanded && (
        <div className="site-section-body site-divider">
          {hasMultipleCareers && (
            <div className="mb-4">
              <label className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 block">
                Career Track
              </label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedCareer(null)}
                  className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors site-btn-shimmer ${
                    selectedCareer === null
                      ? 'site-filter-selected-orange'
                      : 'site-filter-idle'
                  }`}
                >
                  Default
                </button>
                {careerKeys.map((key) => (
                  <button
                    key={key}
                    onClick={() => setSelectedCareer(key)}
                    className={`px-2 py-1 rounded text-[10px] font-medium border transition-colors site-btn-shimmer ${
                      selectedCareer === key
                        ? 'site-filter-selected-orange'
                        : 'site-filter-idle'
                    }`}
                  >
                    {faction.careers![key].name}
                  </button>
                ))}
              </div>
            </div>
          )}
          
          <div className="mb-4">
            <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
              <span>0 Rep</span>
              <span>{maxRep.toLocaleString()} Rep</span>
            </div>
            <div className="h-2 site-surface rounded-full overflow-hidden flex">
              {activeStandings.map((standing, idx) => {
                const prevRep = idx > 0 ? activeStandings[idx - 1].minReputation : 0
                const width = maxRep > 0 ? ((standing.minReputation - prevRep) / maxRep) * 100 : 0
                const colorClass = getStandingColor(standing.name, idx, activeStandings.length).split(' ')[0]
                return (
                  <div
                    key={standing.name}
                    className={`h-full ${colorClass}`}
                    style={{ width: `${Math.max(width, 2)}%` }}
                    title={`${standing.name}: ${standing.minReputation.toLocaleString()}+ rep`}
                  />
                )
              })}
            </div>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500">
                <th className="text-left pb-2 font-medium">Standing</th>
                <th className="text-right pb-2 font-medium">Min Rep</th>
                <th className="text-right pb-2 font-medium">Rep Needed</th>
              </tr>
            </thead>
            <tbody>
              {activeStandings.map((standing, idx) => {
                const prevRep = idx > 0 ? activeStandings[idx - 1].minReputation : 0
                const repNeeded = standing.minReputation - prevRep
                return (
                  <tr key={standing.name} className="site-divider">
                    <td className="py-1.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${getStandingColor(standing.name, idx, activeStandings.length)}`}>
                        {standing.name}
                      </span>
                    </td>
                    <td className="text-right text-slate-400">
                      {standing.minReputation.toLocaleString()}
                    </td>
                    <td className="text-right text-slate-500">
                      {idx === 0 ? '-' : `+${repNeeded.toLocaleString()}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
