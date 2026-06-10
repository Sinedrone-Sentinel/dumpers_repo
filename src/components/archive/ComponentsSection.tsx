import React, { useState, useMemo } from 'react'
import { useComponentsData, type ComponentData } from '../../hooks/useArchiveData'

const GRADE_COLORS: Record<string, string> = {
  A: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  B: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  C: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  D: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
}

const CLASS_COLORS: Record<string, string> = {
  Military: 'text-red-300',
  Civilian: 'text-green-300',
  Stealth: 'text-purple-300',
  Competition: 'text-yellow-300',
  Industrial: 'text-orange-300',
}

export default function ComponentsSection() {
  const { data, loading, error, refetch } = useComponentsData()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [selectedManufacturer, setSelectedManufacturer] = useState<string | null>(null)
  const [selectedSize, setSelectedSize] = useState<number | null>(null)
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null)

  const types = useMemo(() => {
    if (!data) return []
    return [...new Set(data.map((c) => c.component_type))].sort()
  }, [data])

  const manufacturers = useMemo(() => {
    if (!data) return []
    return [...new Set(data.map((c) => c.manufacturer))].sort()
  }, [data])

  const sizes = useMemo(() => {
    if (!data) return []
    return [...new Set(data.map((c) => c.size))].sort((a, b) => a - b)
  }, [data])

  const filteredData = useMemo(() => {
    let filtered = data || []
    
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (c) =>
          c.display_name.toLowerCase().includes(term) ||
          c.manufacturer.toLowerCase().includes(term) ||
          c.component_type.toLowerCase().includes(term)
      )
    }
    if (selectedType) filtered = filtered.filter((c) => c.component_type === selectedType)
    if (selectedManufacturer) filtered = filtered.filter((c) => c.manufacturer === selectedManufacturer)
    if (selectedSize !== null) filtered = filtered.filter((c) => c.size === selectedSize)
    if (selectedGrade) filtered = filtered.filter((c) => c.grade === selectedGrade)
    
    return filtered.sort((a, b) => a.display_name.localeCompare(b.display_name))
  }, [data, searchTerm, selectedType, selectedManufacturer, selectedSize, selectedGrade])

  const clearFilters = () => {
    setSearchTerm('')
    setSelectedType(null)
    setSelectedManufacturer(null)
    setSelectedSize(null)
    setSelectedGrade(null)
  }

  const hasFilters = searchTerm || selectedType || selectedManufacturer || selectedSize !== null || selectedGrade

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
      {/* Search */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search components..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="site-input w-full pl-9 pr-4 py-2 text-sm"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={selectedType || ''}
          onChange={(e) => setSelectedType(e.target.value || null)}
          className="site-input px-3 py-1.5 text-xs"
        >
          <option value="">All Types</option>
          {types.map((type) => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
        
        <select
          value={selectedManufacturer || ''}
          onChange={(e) => setSelectedManufacturer(e.target.value || null)}
          className="site-input px-3 py-1.5 text-xs"
        >
          <option value="">All Manufacturers</option>
          {manufacturers.map((m) => (
            <option key={m} value={m}>{m}</option>
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
        
        <select
          value={selectedGrade || ''}
          onChange={(e) => setSelectedGrade(e.target.value || null)}
          className="site-input px-3 py-1.5 text-xs"
        >
          <option value="">All Grades</option>
          {['A', 'B', 'C', 'D'].map((g) => (
            <option key={g} value={g}>Grade {g}</option>
          ))}
        </select>

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
        Showing {filteredData.length} of {data.length} components
      </div>

      {/* Results grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filteredData.length === 0 ? (
          <p className="col-span-full text-center text-slate-500 py-8">No matching components found.</p>
        ) : (
          filteredData.slice(0, 100).map((item) => (
            <ComponentCard key={item.id} item={item} />
          ))
        )}
      </div>
      
      {filteredData.length > 100 && (
        <p className="text-center text-sm text-slate-500">
          Showing first 100 results. Use filters to narrow down.
        </p>
      )}
    </div>
  )
}

function ComponentCard({ item }: { item: ComponentData }) {
  const gradeClass = GRADE_COLORS[item.grade] || GRADE_COLORS.D
  const classColor = CLASS_COLORS[item.class] || 'text-slate-300'
  
  return (
    <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium text-sm text-white leading-tight">{item.display_name}</h3>
        <span className={`shrink-0 px-2 py-0.5 text-[10px] font-bold rounded border ${gradeClass}`}>
          {item.grade}
        </span>
      </div>
      
      <div className="mt-2 space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Type:</span>
          <span className="text-slate-300">{item.component_type}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Manufacturer:</span>
          <span className="text-slate-300">{item.manufacturer}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-500">Size:</span>
          <span className="text-slate-300">{item.size}</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-500">Class:</span>
          <span className={classColor}>{item.class}</span>
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
        <p className="text-sm text-slate-400">Loading component data...</p>
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
      <p className="text-slate-400">No component data available yet.</p>
    </div>
  )
}
