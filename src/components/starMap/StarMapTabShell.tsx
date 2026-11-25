import { useEffect } from 'react'
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router'
import { isStarMapPath } from '../../lib/starMapHighlight'

/**
 * Shell for the named Star Map tab. No header, sidebar, ticker, or footer.
 * Leaving `/star-map` is sent back, and links that would open another page are dropped.
 */
export default function StarMapTabShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navigate = useNavigate()
  const onMap = isStarMapPath(pathname)

  useEffect(() => {
    document.title = 'Star Map'
  }, [pathname])

  useEffect(() => {
    if (onMap) return
    void navigate({ to: '/star-map', search: {}, replace: true })
  }, [onMap, navigate])

  useEffect(() => {
    const blockLeave = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('#')) return
      let path = href
      try {
        path = new URL(href, window.location.origin).pathname
      } catch {
        // Keep the raw value and block it.
      }
      if (isStarMapPath(path) && anchor.getAttribute('target') !== '_blank' && event.button === 0) return
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('click', blockLeave, true)
    document.addEventListener('auxclick', blockLeave, true)
    return () => {
      document.removeEventListener('click', blockLeave, true)
      document.removeEventListener('auxclick', blockLeave, true)
    }
  }, [])

  return (
    <div className="site-page-bg h-screen w-screen overflow-hidden text-slate-100">
      {onMap ? <Outlet /> : null}
    </div>
  )
}
