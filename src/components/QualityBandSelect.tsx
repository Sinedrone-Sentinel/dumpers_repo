import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

export interface QualityBandSelectOption {
  value: number
  label: string
  /** Text colour class for the option row (band tier colour). */
  className?: string
  /** Shown on the right of the open list only — never in the closed box. */
  stockLabel?: string
}

interface QualityBandSelectProps {
  value: number
  options: QualityBandSelectOption[]
  onChange: (value: number) => void
  ariaLabel: string
  className?: string
}

const LIST_MAX_HEIGHT = 224
const LIST_GAP = 4

export default function QualityBandSelect({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
}: QualityBandSelectProps) {
  const listId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [listStyle, setListStyle] = useState<CSSProperties>({})

  const selectedIndex = options.findIndex((opt) => opt.value === value)
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined

  const close = useCallback(() => setOpen(false), [])

  const openList = useCallback(() => {
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0)
    setOpen(true)
  }, [selectedIndex])

  const choose = useCallback(
    (index: number) => {
      const opt = options[index]
      if (opt) onChange(opt.value)
      setOpen(false)
      buttonRef.current?.focus()
    },
    [options, onChange]
  )

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - LIST_GAP
    const spaceAbove = rect.top - LIST_GAP
    const wanted = Math.min(LIST_MAX_HEIGHT, options.length * 40)
    const openUp = spaceBelow < wanted && spaceAbove > spaceBelow
    setListStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 80,
      margin: 0,
      maxHeight: Math.max(96, Math.min(LIST_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow)),
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + LIST_GAP }
        : { top: rect.bottom + LIST_GAP }),
    })
  }, [open, options.length])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (buttonRef.current?.contains(target) || listRef.current?.contains(target)) return
      close()
    }
    const onScroll = (e: Event) => {
      if (listRef.current?.contains(e.target as Node)) return
      close()
    }
    document.addEventListener('mousedown', onPointerDown)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, close])

  useEffect(() => {
    const list = listRef.current
    if (!open || activeIndex < 0 || !list) return
    const item = list.children[activeIndex] as HTMLElement | undefined
    if (!item) return
    // scrollIntoView would also scroll the page/modal, which closes the list.
    if (item.offsetTop < list.scrollTop) {
      list.scrollTop = item.offsetTop
    } else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight
    }
  }, [open, activeIndex, listStyle])

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openList()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((i) => Math.min(options.length - 1, i + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((i) => Math.max(0, i - 1))
        break
      case 'Home':
        e.preventDefault()
        setActiveIndex(0)
        break
      case 'End':
        e.preventDefault()
        setActiveIndex(options.length - 1)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        choose(activeIndex)
        break
      case 'Escape':
        e.preventDefault()
        close()
        break
      case 'Tab':
        close()
        break
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
        className={`site-input flex items-center justify-between gap-2 text-left cursor-pointer ${className}`}
      >
        <span className="truncate">{selected?.label ?? ''}</span>
        <svg
          className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            className="site-dropdown-list overscroll-contain"
            style={listStyle}
          >
            {options.map((opt, idx) => (
              <li
                key={opt.value}
                id={`${listId}-${idx}`}
                role="option"
                aria-selected={idx === selectedIndex}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActiveIndex(idx)}
                onClick={() => choose(idx)}
                className={`site-dropdown-item flex items-center justify-between gap-3 font-mono cursor-pointer ${
                  idx === activeIndex ? 'site-dropdown-item-active' : ''
                }`}
              >
                <span className={`truncate ${opt.className ?? ''}`}>{opt.label}</span>
                {opt.stockLabel ? (
                  <span className="shrink-0 text-slate-400">{opt.stockLabel}</span>
                ) : null}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </>
  )
}
