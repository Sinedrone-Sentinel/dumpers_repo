import React, { useEffect } from 'react'
import { useRouterState } from '@tanstack/react-router'
import SiteBrandMark from '../SiteBrandMark'
import SiteBrandTitle from '../SiteBrandTitle'
import { SITE_COPYRIGHT } from '../../config/site'
import DfpOptOutFooter from './DfpOptOutFooter'
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
}: AppChromeProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="site-page-bg min-h-screen flex flex-col">
      <header className="site-app-header fixed top-0 inset-x-0 z-50 overflow-visible">
        <div className="site-shell h-14 flex items-center gap-2 sm:gap-3 min-w-0 lg:grid lg:grid-cols-[auto_1fr_auto] lg:items-center lg:gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden lg:flex-none lg:shrink-0">
            <SiteBrandMark size="md" />
            <div className="min-w-0 border-l border-slate-700/70 pl-2 sm:pl-3 overflow-hidden">
              <SiteBrandTitle size="compact" layout="inline" align="left" subtle className="truncate" />
            </div>
          </div>
          <AppNavTabs items={navItems} className="hidden lg:flex justify-center min-w-0 px-2 min-h-9 items-center overflow-x-auto" />
          <div className="flex items-center gap-2 shrink-0 lg:justify-end">
            <AppNotificationBell disabled={isPending} />
            <AppUserMenu
              displayName={displayName}
              profile={profile}
              isPending={isPending}
              isGhostMode={isGhostMode}
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
        <div className="lg:hidden border-t border-slate-800/70 h-11 flex items-center w-full min-w-0">
          <AppNavTabs items={navItems} className="site-shell w-full max-w-full overflow-x-auto min-h-9 items-center" />
        </div>
      </header>

      <div className="site-main-offset flex-1 flex flex-col">{children}</div>

      <footer className="site-footer site-shell mt-8 space-y-1">
        <p>{SITE_COPYRIGHT}</p>
        <DfpOptOutFooter />
      </footer>
    </div>
  )
}
