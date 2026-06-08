import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { BlueprintWithSlots } from '../lib/blueprintResources'
import {
  BLUEPRINT_SEARCH_MIN_CHARS,
  BLUEPRINT_SEARCH_MAX_RESULTS,
  filterBlueprintsForSearch,
} from '../lib/blueprintSearch'

interface BlueprintTypeaheadProps {
  blueprints: BlueprintWithSlots[]
  selectedBlueprint: BlueprintWithSlots | null
  onSelect: (blueprint: BlueprintWithSlots) => void
  onClear: () => void
}

export default function BlueprintTypeahead({
  blueprints,
  selectedBlueprint,
  onSelect,
  onClear,
}: BlueprintTypeaheadProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const { results, totalMatches } = useMemo(
    () => filterBlueprintsForSearch(blueprints, query),
    [blueprints, query]
  )

  const canSearch = query.trim().length >= BLUEPRINT_SEARCH_MIN_CHARS

  useEffect(() => {
    setHighlightIndex(0)
  }, [query, results.length])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (bp: BlueprintWithSlots) => {
    onSelect(bp)
    setQuery('')
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      return
    }
    if (!canSearch || results.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlightIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const bp = results[highlightIndex]
      if (bp) handleSelect(bp)
    }
  }

  return (
    <div ref={containerRef} className="space-y-2">
      {selectedBlueprint?.file && (
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-800/80 border border-slate-600 rounded-lg">
          <span className="text-slate-200 text-sm truncate">
            Selected: {selectedBlueprint.blueprintName || selectedBlueprint.file}
          </span>
          <button
            type="button"
            onClick={() => {
              onClear()
              setQuery('')
            }}
            className="text-xs text-slate-400 hover:text-white shrink-0"
          >
            Clear
          </button>
        </div>
      )}

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={`Type at least ${BLUEPRINT_SEARCH_MIN_CHARS} characters to search blueprints…`}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-white text-sm"
          autoComplete="off"
        />

        {open && canSearch && (
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-slate-900 border border-slate-600 rounded-lg shadow-xl">
            {results.length === 0 ? (
              <p className="px-3 py-2 text-slate-500 text-xs">No matches for &quot;{query.trim()}&quot;</p>
            ) : (
              <>
                {totalMatches > BLUEPRINT_SEARCH_MAX_RESULTS && (
                  <p className="px-3 py-1.5 text-slate-500 text-[10px] border-b border-slate-700">
                    Showing {BLUEPRINT_SEARCH_MAX_RESULTS} of {totalMatches} — refine search
                  </p>
                )}
                <ul>
                  {results.map((bp, index) => (
                    <li key={bp.file}>
                      <button
                        type="button"
                        onMouseEnter={() => setHighlightIndex(index)}
                        onClick={() => handleSelect(bp)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                          index === highlightIndex
                            ? 'bg-red-950/50 text-red-100'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {bp.blueprintName || bp.file}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {open && !canSearch && query.trim().length > 0 && (
          <p className="mt-1 text-slate-500 text-xs">
            Type {BLUEPRINT_SEARCH_MIN_CHARS - query.trim().length} more character
            {BLUEPRINT_SEARCH_MIN_CHARS - query.trim().length === 1 ? '' : 's'}…
          </p>
        )}
      </div>
    </div>
  )
}
