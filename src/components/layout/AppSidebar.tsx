import React, { useState, useEffect, useRef } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import type { AppNavItem, NavGroup } from '../../config/appNav'

interface AppSidebarProps {
  groups: NavGroup[]
  className?: string
}

export default function AppSidebar({ groups, className = '' }: AppSidebarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const sidebarRef = useRef<HTMLDivElement>(null)

  // Close sidebar when route changes (mobile)
  useEffect(() => {
    setIsOpen(false)
  }, [pathname])

  // Close sidebar when clicking outside (mobile)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Close on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false)
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  return (
    <>
      {/* Hamburger button - visible on all screen sizes */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors ${className}`}
        aria-label="Toggle navigation menu"
        aria-expanded={isOpen}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isOpen ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      {/* Backdrop overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel - positioned below header, grows from top-left */}
      <div
        ref={sidebarRef}
        className={`
          fixed top-14 left-4 w-64 max-h-[calc(100vh-4.5rem)] bg-slate-900 border border-slate-700 
          rounded-xl shadow-2xl z-[80] origin-top-left transition-all duration-200 ease-out overflow-hidden
          ${isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0 pointer-events-none'}
        `}
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <span className="text-sm font-semibold text-orange-400 uppercase tracking-wider">Navigation</span>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
            aria-label="Close menu"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation groups */}
        <nav className="p-3 space-y-4 overflow-y-auto max-h-[calc(100vh-8rem)]" aria-label="Main navigation">
          {groups.map((group) => (
            <div key={group.id}>
              <h3 className="px-3 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {group.label}
              </h3>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <SidebarNavItem key={item.id} item={item} pathname={pathname} />
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
    </>
  )
}

interface SidebarNavItemProps {
  item: AppNavItem
  pathname: string
}

function SidebarNavItem({ item, pathname }: SidebarNavItemProps) {
  const isActive = pathname === item.path
  
  return (
    <li>
      <Link
        to={item.path}
        className={`
          flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
          ${isActive
            ? 'bg-orange-600/20 text-orange-200 border border-orange-500/40 shadow-sm shadow-orange-500/10'
            : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 border border-transparent'
          }
        `}
      >
        {item.icon && <NavIcon name={item.icon} className="w-4 h-4 shrink-0" />}
        <span>{item.label}</span>
      </Link>
    </li>
  )
}

interface NavIconProps {
  name: string
  className?: string
}

function NavIcon({ name, className = '' }: NavIconProps) {
  const icons: Record<string, React.ReactNode> = {
    blueprints: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    target: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    resources: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    orders: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    fulfillment: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </svg>
    ),
    archive: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    ),
  }

  return icons[name] || null
}
