import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { BlueprintResourceRow } from '../lib/operations'

const MAX_RESULTS = 50

interface ResourceTypeaheadProps {
  resources: BlueprintResourceRow[]
  selectedResource: BlueprintResourceRow | null
  onSelect: (resource: BlueprintResourceRow) => void
}

export default function ResourceTypeahead({
  resources,
  selectedResource,
  onSelect,
}: ResourceTypeaheadProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { results, totalMatches } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = q.length === 0
      ? resources
      : resources.filter((r) => r.label.toLowerCase().includes(q))

    const sorted = [...matches].sort((a, b) => a.label.localeCompare(b.label))

    return {
      results: sorted.slice(0, MAX_RESULTS),
      totalMatches: sorted.length,
    }
  }, [resources, query])

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

  const handleSelect = (resource: BlueprintResourceRow) => {
    onSelect(resource)
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
      const r = results[highlightIndex]
      if (r) handleSelect(r)
    }
  }

  return (
    <div ref={containerRef} className="space-y-2">
      {selectedResource && (
        <div className="site-surface flex items-center justify-between gap-2 px-3 py-2">
          <span className="text-slate-200 text-sm truncate">
            Selected: {selectedResource.label}
          </span>
          <button
            type="button"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
              setOpen(true)
            }}
            className="site-btn-ghost text-xs shrink-0"
          >
            Change
          </button>
        </div>
      )}

      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Type to search commodities…"
          className="site-input w-full px-3 py-2 text-sm"
          autoComplete="off"
        />

        {open && (
          <div className="site-dropdown-list">
            {results.length === 0 ? (
              <p className="px-3 py-2 text-slate-500 text-xs">No matches for &quot;{query.trim()}&quot;</p>
            ) : (
              <>
                {totalMatches > MAX_RESULTS && (
                  <p className="px-3 py-1.5 text-slate-500 text-[10px] border-b border-orange-500/15">
                    Showing {MAX_RESULTS} of {totalMatches} — type to filter
                  </p>
                )}
                <ul>
                  {results.map((r, index) => (
                    <li key={r.resource_key}>
                      <button
                        type="button"
                        onMouseEnter={() => setHighlightIndex(index)}
                        onClick={() => handleSelect(r)}
                        className={
                          index === highlightIndex
                            ? 'site-dropdown-item site-dropdown-item-active'
                            : 'site-dropdown-item'
                        }
                      >
                        {r.label}
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
