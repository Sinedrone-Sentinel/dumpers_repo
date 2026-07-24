import React, { useEffect, useRef } from 'react'
import { useRouterState } from '@tanstack/react-router'
import SiteBrandTitle from '../SiteBrandTitle'
import { SITE_COPYRIGHT } from '../../config/site'
import DfpOptOutFooter from './DfpOptOutFooter'
import type { NavGroup } from '../../config/appNav'
import type { Profile } from '../../lib/supabase'
import AppSidebar from './AppSidebar'
import AppNotificationBell from './AppNotificationBell'
import AppUserMenu from './AppUserMenu'
import GuestPreviewBanner from './GuestPreviewBanner'
import UpdateAvailableBanner from './UpdateAvailableBanner'
import QuestionnaireAvailableBanner from './QuestionnaireAvailableBanner'
import SignInMenu from '../auth/SignInMenu'
import { useAppUpdateAvailable } from '../../hooks/useAppUpdateAvailable'

interface AppChromeProps {
  children: React.ReactNode
  navGroups: NavGroup[]
  displayName: string
  profile: Profile | null
  isPending: boolean
  isGuestPreview: boolean
  isOfficerOrAbove: boolean
  isSuperAdmin: boolean
  showSettingsButton: boolean
  showDbActionsButton: boolean
  showAdminPanelButton: boolean
  guestQuestionnaireBanner?: { title: string } | null
  onOpenGuestQuestionnaire?: () => void
  onDeclineGuestQuestionnaire?: () => void
  onOpenQuestionnaire?: (questionnaireId: string) => void
  onOpenQuestionnairesAdmin?: () => void
  onOpenSettings: () => void
  onOpenBpDumper: () => void
  onOpenDbActions: () => void
  onOpenDiscord: () => void
  onOpenAdmin: () => void
  onOpenSupport: () => void
  onSignOut: () => void
  onExitGuestPreview: () => void
}

export default function AppChrome({
  children,
  navGroups,
  displayName,
  profile,
  isPending,
  isGuestPreview,
  isOfficerOrAbove,
  isSuperAdmin,
  showSettingsButton,
  showDbActionsButton,
  showAdminPanelButton,
  guestQuestionnaireBanner = null,
  onOpenGuestQuestionnaire,
  onDeclineGuestQuestionnaire,
  onOpenQuestionnaire,
  onOpenQuestionnairesAdmin,
  onOpenSettings,
  onOpenBpDumper,
  onOpenDbActions,
  onOpenDiscord,
  onOpenAdmin,
  onOpenSupport,
  onSignOut,
  onExitGuestPreview: _onExitGuestPreview,
}: AppChromeProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const updateAvailable = useAppUpdateAvailable()
  const headerRef = useRef<HTMLElement>(null)
  const showGuestQuestionnaireBanner = Boolean(
    isGuestPreview && guestQuestionnaireBanner && onOpenGuestQuestionnaire && onDeclineGuestQuestionnaire
  )

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  // Keep content / sticky offsets in sync with the fixed header stack height
  // (nav row + optional update banner).
  useEffect(() => {
    const el = headerRef.current
    if (!el) return

    const syncHeight = () => {
      const height = el.getBoundingClientRect().height
      document.documentElement.style.setProperty('--site-header-height', `${height}px`)
    }

    syncHeight()
    const observer = new ResizeObserver(syncHeight)
    observer.observe(el)
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty('--site-header-height')
    }
  }, [updateAvailable, showGuestQuestionnaireBanner])

  return (
    <div className="site-page-bg min-h-screen flex flex-col">
      <header
        ref={headerRef}
        className="fixed top-0 inset-x-0 z-40 flex flex-col overflow-visible"
      >
        {updateAvailable && <UpdateAvailableBanner />}
        {showGuestQuestionnaireBanner && guestQuestionnaireBanner && (
          <QuestionnaireAvailableBanner
            title={guestQuestionnaireBanner.title}
            onOpen={() => onOpenGuestQuestionnaire?.()}
            onDecline={() => onDeclineGuestQuestionnaire?.()}
          />
        )}
        <div className="site-app-header">
          <div className="site-shell h-14 flex items-center gap-2 sm:gap-3 min-w-0">
            <AppSidebar groups={navGroups} />
            <div className="flex items-center min-w-0 flex-1 overflow-hidden">
              <SiteBrandTitle size="compact" layout="inline" align="left" subtle className="truncate" />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isGuestPreview ? (
                <SignInMenu />
              ) : (
                <>
                  <AppNotificationBell
                    disabled={isPending}
                    onOpenQuestionnaire={onOpenQuestionnaire}
                  />
                  <AppUserMenu
                    displayName={displayName}
                    profile={profile}
                    isPending={isPending}
                    isOfficerOrAbove={isOfficerOrAbove}
                    isSuperAdmin={isSuperAdmin}
                    showSettingsButton={showSettingsButton}
                    showDbActionsButton={showDbActionsButton}
                    showAdminPanelButton={showAdminPanelButton}
                    onOpenSettings={onOpenSettings}
                    onOpenBpDumper={onOpenBpDumper}
                    onOpenDbActions={onOpenDbActions}
                    onOpenDiscord={onOpenDiscord}
                    onOpenAdmin={onOpenAdmin}
                    onOpenQuestionnairesAdmin={onOpenQuestionnairesAdmin}
                    onOpenSupport={onOpenSupport}
                    onSignOut={onSignOut}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="site-header-offset flex-1 flex flex-col">
        {isGuestPreview && <GuestPreviewBanner />}
        {children}
      </div>

      <footer className="site-footer site-shell mt-8 space-y-1">
        <p>{SITE_COPYRIGHT}</p>
        <p className="text-xs text-slate-600">
          Anonymous usage metrics (tool visits and active time) help improve the site.
        </p>
        <DfpOptOutFooter />
      </footer>
    </div>
  )
}
