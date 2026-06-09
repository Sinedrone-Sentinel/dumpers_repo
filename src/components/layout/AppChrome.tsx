import React, { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import SiteBrandMark from '../SiteBrandMark'
import SiteBrandTitle from '../SiteBrandTitle'
import { DFP_OPT_OUT_NOTICE, SITE_COPYRIGHT } from '../../config/site'
import type { AppNavItem } from '../../config/appNav'
import type { Profile } from '../../lib/supabase'
import AppNavTabs from './AppNavTabs'
import AppNotificationBell from './AppNotificationBell'
import AppUserMenu from './AppUserMenu'

interface AppChromeProps {
  children: React.ReactNode
  navItems: AppNavItem[]
  displayName: string
  profile: Profile | null
  isPending: boolean
  isGhostMode: boolean
  showSettingsButton: boolean
  showDbActionsButton: boolean
  showAdminPanelButton: boolean
  onOpenSettings: () => void
  onOpenDbActions: () => void
  onOpenAdmin: () => void
  onSignOut: () => void
  dfpDisplayEnabled?: boolean
}

export default function AppChrome({
  children,
  navItems,
  displayName,
  profile,
  isPending,
  isGhostMode,
  showSettingsButton,
  showDbActionsButton,
  showAdminPanelButton,
  onOpenSettings,
  onOpenDbActions,
  onOpenAdmin,
  onSignOut,
  dfpDisplayEnabled = true,
}: AppChromeProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="site-page-bg min-h-screen flex flex-col">
      <header className="site-app-header fixed top-0 inset-x-0 z-50 overflow-visible">
        <div className="site-shell h-14 flex items-center gap-3 min-w-0">
          <SiteBrandMark size="md" />
          <div className="hidden sm:block border-l border-slate-700/70 pl-3 min-w-0">
            <SiteBrandTitle size="compact" layout="inline" align="left" subtle />
          </div>
          <AppNavTabs items={navItems} className="hidden lg:flex flex-1 justify-center px-2 min-h-9 items-center" />
          <div className="ml-auto flex items-center gap-2 shrink-0 min-w-0">
            <AppNotificationBell disabled={isPending} />
            <AppUserMenu
              displayName={displayName}
              profile={profile}
              isPending={isPending}
              isGhostMode={isGhostMode}
              navItems={navItems}
              showSettingsButton={showSettingsButton}
              showDbActionsButton={showDbActionsButton}
              showAdminPanelButton={showAdminPanelButton}
              onOpenSettings={onOpenSettings}
              onOpenDbActions={onOpenDbActions}
              onOpenAdmin={onOpenAdmin}
              onSignOut={onSignOut}
            />
          </div>
        </div>
        <div className="lg:hidden border-t border-slate-800/70 h-11 flex items-center">
          <AppNavTabs items={navItems} className="site-shell overflow-x-auto min-h-9 items-center" />
        </div>
      </header>

      <div className="site-main-offset flex-1 flex flex-col">{children}</div>

      <footer className="site-footer site-shell mt-8 space-y-1">
        <p>{SITE_COPYRIGHT}</p>
        {!dfpDisplayEnabled && (
          <p className="text-xs text-slate-500">{DFP_OPT_OUT_NOTICE}</p>
        )}
      </footer>
    </div>
  )
}
