import React, { useState, useEffect, useRef } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import type { AppNavItem, NavGroup } from '../../config/appNav'

interface AppSidebarProps {
  groups: NavGroup[]
  className?: string
}

export default function AppSidebar({ groups, className = '' }: AppSidebarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [userCollapsed, setUserCollapsed] = useState<Set<string>>(new Set())
  const routerState = useRouterState({ select: (s) => s.location })
  const pathname = routerState.pathname
  const search = routerState.searchStr
  const sidebarRef = useRef<HTMLDivElement>(null)

  const toggleExpanded = (id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        setUserCollapsed(uc => new Set(uc).add(id))
      } else {
        next.add(id)
        setUserCollapsed(uc => {
          const newSet = new Set(uc)
          newSet.delete(id)
          return newSet
        })
      }
      return next
    })
  }

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

  // Lock body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
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

      {/* Sidebar panel - slides in from left, positioned below header */}
      <div
        ref={sidebarRef}
        className={`
          fixed top-14 left-0 w-64 max-h-[calc(100vh-4.5rem)] bg-slate-900 border border-slate-700 
          rounded-r-xl shadow-2xl z-[80] transition-transform duration-200 ease-out overflow-hidden
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
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
        <nav 
          className="p-3 space-y-4 overflow-y-auto max-h-[calc(100vh-8rem)]" 
          style={{ overscrollBehavior: 'contain' }}
          aria-label="Main navigation"
        >
          {groups.map((group) => (
            <div key={group.id}>
              <h3 className="px-3 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                {group.label}
              </h3>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <SidebarNavItem 
                    key={item.id} 
                    item={item} 
                    pathname={pathname}
                    search={search}
                    isExpanded={expandedItems.has(item.id)}
                    isUserCollapsed={userCollapsed.has(item.id)}
                    onToggleExpand={() => toggleExpanded(item.id)}
                  />
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
  search: string
  isExpanded: boolean
  isUserCollapsed: boolean
  onToggleExpand: () => void
}

function SidebarNavItem({ item, pathname, search, isExpanded, isUserCollapsed, onToggleExpand }: SidebarNavItemProps) {
  const hasChildren = item.children && item.children.length > 0
  const fullPath = pathname + search
  
  const isChildActive = hasChildren && item.children!.some(child => {
    if (child.path.includes('?')) {
      return fullPath === child.path || fullPath.startsWith(child.path)
    }
    return pathname === child.path && !search
  })
  
  const isActive = hasChildren 
    ? (pathname === '/archive' && !search.includes('section='))
    : pathname === item.path
  
  // Auto-expand if child is active, but respect user's explicit collapse
  const showExpanded = isUserCollapsed ? false : (isExpanded || isChildActive)

  if (hasChildren) {
    return (
      <li>
        <button
          onClick={onToggleExpand}
          className={`
            w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
            ${isChildActive
              ? 'bg-slate-800/40 text-slate-200'
              : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }
          `}
        >
          {item.icon && <NavIcon name={item.icon} className="w-4 h-4 shrink-0" />}
          <span className="flex-1 text-left">{item.label}</span>
          <svg 
            className={`w-4 h-4 transition-transform ${showExpanded ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {showExpanded && (
          <ul className="mt-1 ml-4 pl-3 border-l border-slate-700 space-y-0.5">
            {item.children!.map(child => (
              <ChildNavItem key={child.id} item={child} pathname={pathname} search={search} />
            ))}
          </ul>
        )}
      </li>
    )
  }
  
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

interface ChildNavItemProps {
  item: AppNavItem
  pathname: string
  search: string
}

function ChildNavItem({ item, pathname, search }: ChildNavItemProps) {
  const fullPath = pathname + search
  const isActive = item.path.includes('?') 
    ? fullPath === item.path || fullPath.startsWith(item.path)
    : pathname === item.path && !search.includes('section=')
  
  return (
    <li>
      <Link
        to={item.path}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all
          ${isActive
            ? 'bg-orange-600/20 text-orange-200 border border-orange-500/40'
            : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 border border-transparent'
          }
        `}
      >
        {item.icon && <NavIcon name={item.icon} className="w-3.5 h-3.5 shrink-0 opacity-70" />}
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
    home: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
    mining: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
    components: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    ordnance: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    factions: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    info: (
      <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  }

  return icons[name] || null
}
