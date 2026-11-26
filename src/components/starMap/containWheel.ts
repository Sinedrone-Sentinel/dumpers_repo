/** True when `el` can still scroll in the wheel's direction. */
function canScroll(el: HTMLElement, deltaY: number): boolean {
  const style = getComputedStyle(el)
  if (!/(auto|scroll)/.test(style.overflowY) || el.scrollHeight <= el.clientHeight) return false
  if (deltaY < 0) return el.scrollTop > 0
  return el.scrollTop + el.clientHeight < el.scrollHeight - 1
}

/**
 * Keep the wheel inside the map. A panel that can still scroll that way
 * scrolls. Everything else, including a panel at its end, leaves the page alone.
 * Returns the cleanup.
 */
export function containWheel(root: HTMLElement): () => void {
  const onWheel = (e: WheelEvent) => {
    let node = e.target instanceof HTMLElement ? e.target : null
    while (node && node !== root) {
      if (canScroll(node, e.deltaY)) return
      node = node.parentElement
    }
    e.preventDefault()
  }
  root.addEventListener('wheel', onWheel, { passive: false })
  return () => root.removeEventListener('wheel', onWheel)
}
