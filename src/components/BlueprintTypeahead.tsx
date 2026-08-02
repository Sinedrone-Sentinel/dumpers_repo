import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { BlueprintWithSlots } from '../lib/blueprintResources'
import {
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

  const { results, totalMatches } = useMemo(() => {
    const q = query.trim()
    if (q.length === 0) {
      const sorted = [...blueprints].sort((a, b) =>
        (a.blueprintName || a.file || '').localeCompare(b.blueprintName || b.file || '')
      )
      return {
        results: sorted.slice(0, BLUEPRINT_SEARCH_MAX_RESULTS),
        totalMatches: sorted.length,
      }
    }
    return filterBlueprintsForSearch(blueprints, query)
  }, [blueprints, query])

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
    if (results.length === 0) return

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
        <div className="site-surface flex items-center justify-between gap-2 px-3 py-2">
          <span className="text-slate-200 text-sm truncate">
            Selected: {selectedBlueprint.blueprintName || selectedBlueprint.file}
          </span>
          <button
            type="button"
            onClick={() => {
              onClear()
              setQuery('')
            }}
            className="site-btn-ghost text-xs shrink-0"
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
          placeholder="Type to search items…"
          className="site-input w-full px-3 py-2 text-sm"
          autoComplete="off"
        />

        {open && (
          <div className="site-dropdown-list">
            {results.length === 0 ? (
              <p className="px-3 py-2 text-slate-500 text-xs">No matches for &quot;{query.trim()}&quot;</p>
            ) : (
              <>
                {totalMatches > BLUEPRINT_SEARCH_MAX_RESULTS && (
                  <p className="px-3 py-1.5 text-slate-500 text-[10px] border-b border-orange-500/15">
                    Showing {BLUEPRINT_SEARCH_MAX_RESULTS} of {totalMatches} — type to filter
                  </p>
                )}
                <ul>
                  {results.map((bp, index) => (
                    <li key={bp.internalName}>
                      <button
                        type="button"
                        onMouseEnter={() => setHighlightIndex(index)}
                        onClick={() => handleSelect(bp)}
                        className={
                          index === highlightIndex
                            ? 'site-dropdown-item site-dropdown-item-active'
                            : 'site-dropdown-item'
                        }
                      >
                        {bp.blueprintName || bp.internalName}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
