import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { filterNoteSuggestions } from '../../lib/inventoryStock'

type Props = {
  value: string
  onChange: (value: string) => void
  suggestions: string[]
  placeholder?: string
  maxLength?: number
  className?: string
  autoFocus?: boolean
  disabled?: boolean
  'aria-label'?: string
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void
}

export default function StockNoteTypeahead({
  value,
  onChange,
  suggestions,
  placeholder = 'Note (optional)',
  maxLength = 64,
  className = 'site-input w-full px-3 py-2 text-sm',
  autoFocus = false,
  disabled = false,
  'aria-label': ariaLabel = 'Stock card note',
  onKeyDown,
}: Props) {
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)

  const matches = useMemo(
    () => filterNoteSuggestions(suggestions, value),
    [suggestions, value],
  )

  useEffect(() => {
    setHighlight(0)
  }, [value, matches.length])

  useEffect(() => {
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const pick = (label: string) => {
    onChange(label.slice(0, maxLength))
    setOpen(false)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      return
    }
    if (open && matches.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        event.stopPropagation()
        setHighlight((i) => Math.min(i + 1, matches.length - 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        setHighlight((i) => Math.max(i - 1, 0))
        return
      }
      if (event.key === 'Enter' && matches[highlight]) {
        event.preventDefault()
        event.stopPropagation()
        pick(matches[highlight])
        return
      }
    }
    onKeyDown?.(event)
  }

  return (
    <div ref={wrapRef} className="relative min-w-0 w-full">
      <input
        type="text"
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open && matches.length > 0}
        aria-controls={listId}
        className={className}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true)
        }}
        onChange={(event) => {
          onChange(event.target.value.slice(0, maxLength))
          if (suggestions.length > 0) setOpen(true)
        }}
        onKeyDown={handleKeyDown}
      />
      {open && matches.length > 0 ? (
        <ul id={listId} role="listbox" className="site-dropdown-list z-30">
          {matches.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                className={
                  index === highlight
                    ? 'site-dropdown-item site-dropdown-item-active'
                    : 'site-dropdown-item'
                }
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(label)}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
