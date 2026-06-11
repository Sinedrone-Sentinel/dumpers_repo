import { useEffect, type RefObject } from 'react'

export function useClickOutside(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!enabled) return

    function handlePointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [enabled, onClose, ref])
}
