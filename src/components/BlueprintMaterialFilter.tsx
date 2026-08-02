import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { ExtractedBlueprintResource } from '../lib/blueprintResources'

interface BlueprintMaterialFilterProps {
  materials: ExtractedBlueprintResource[]
  selectedMaterial: string | null
  onSelect: (label: string) => void
  onClear: () => void
}

export default function BlueprintMaterialFilter({
  materials,
  selectedMaterial,
  onSelect,
  onClear,
}: BlueprintMaterialFilterProps) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setQuery(selectedMaterial ?? '')
  }, [selectedMaterial])

  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return materials
    return materials.filter(
      (m) =>
        m.label.toLowerCase().includes(q) || m.resourceKey.toLowerCase().includes(q)
    )
  }, [materials, query])

  useEffect(() => {
    setHighlightIndex(0)
  }, [query, options.length])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery(selectedMaterial ?? '')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [selectedMaterial])

  const handleSelect = (label: string) => {
    onSelect(label)
    setQuery(label)
    setOpen(false)
  }

  const handleClear = () => {
    onClear()
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  const handleInputChange = (value: string) => {
    setQuery(value)
    setOpen(true)
  }

  const handleBlur = () => {
    window.setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setQuery(selectedMaterial ?? '')
      }
    }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery(selectedMaterial ?? '')
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlightIndex((i) => Math.min(i + 1, Math.max(0, options.length - 1)))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => Math.max(i - 1, 0))
      return
    }
    if (e.key === 'Enter' && open && options.length > 0) {
      e.preventDefault()
      handleSelect(options[highlightIndex]?.label ?? options[0].label)
    }
  }

  const hasSelection = Boolean(selectedMaterial)

  return (
    <div ref={containerRef} className="relative shrink-0 w-full sm:w-auto sm:min-w-[11rem] sm:max-w-[15rem]">
      <div
        className={`flex items-stretch rounded-md border transition-all site-btn-shimmer ${
          hasSelection
            ? 'site-filter-selected-cyan border-cyan-500/45'
            : 'site-filter-idle'
        }`}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="Material…"
          aria-label="Filter by crafting material"
          aria-expanded={open}
          aria-autocomplete="list"
          className={`min-w-0 flex-1 px-2.5 py-1 sm:py-1.5 text-xs sm:text-sm bg-transparent outline-none placeholder:text-slate-500 ${
            hasSelection ? 'text-cyan-100' : 'text-slate-200'
          }`}
          autoComplete="off"
        />
        {hasSelection ? (
          <button
            type="button"
            onClick={handleClear}
            className="px-2 text-cyan-300/80 hover:text-cyan-100 border-l border-cyan-500/30"
            aria-label="Clear material filter"
          >
            ×
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            setOpen((prev) => !prev)
            inputRef.current?.focus()
          }}
          className={`px-2 border-l ${
            hasSelection
              ? 'border-cyan-500/30 text-cyan-300 hover:text-cyan-100'
              : 'border-orange-500/15 text-slate-400 hover:text-slate-200'
          }`}
          aria-label={open ? 'Close material list' : 'Show all materials'}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="site-dropdown-list z-30 max-h-60">
          {options.length === 0 ? (
            <p className="site-hint px-3 py-2 !mt-0">
              {query.trim() ? `No material matches "${query.trim()}"` : 'No materials found'}
            </p>
          ) : (
            <ul>
              {options.map((material, index) => (
                <li key={material.resourceKey}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => handleSelect(material.label)}
                    className={`site-dropdown-item text-xs sm:text-sm !py-1.5 ${
                      material.label === selectedMaterial
                        ? 'site-dropdown-item-active text-cyan-100'
                        : index === highlightIndex
                          ? 'site-dropdown-item-active'
                          : ''
                    }`}
                  >
                    {material.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
