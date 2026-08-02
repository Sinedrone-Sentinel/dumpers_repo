import React, { useEffect, useRef, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import SiteBrandTitle from '../SiteBrandTitle'
import { SITE_COPYRIGHT } from '../../config/site'
import DfpOptOutFooter from './DfpOptOutFooter'
import SiteSupportLink from './SiteSupportLink'
import type { NavGroup } from '../../config/appNav'
import type { Profile } from '../../lib/supabase'
import AppSidebar from './AppSidebar'
import AppNotificationBell from './AppNotificationBell'
import RequestServicesControl from './RequestServicesControl'
import AppUserMenu from './AppUserMenu'
import GuestPreviewBanner from './GuestPreviewBanner'
import UpdateAvailableBanner from './UpdateAvailableBanner'
import SignInMenu from '../auth/SignInMenu'
import { useAppUpdateAvailable } from '../../hooks/useAppUpdateAvailable'
import { getLiveGameVersionLabel } from '../../lib/gameBuildVersion'
import SiteTicker from './SiteTicker'
import ServiceRequestAcceptedListener from '../ServiceRequestAcceptedListener'
import {
  buildSiteTickerItems,
  fetchActiveWhatsNewEntries,
  type SiteTickerItem,
  type WhatsNewEntry,
} from '../../lib/whatsNew'
import {
  fetchTickerCategories,
  WHATS_NEW_CHANGED_EVENT,
} from '../../lib/tickerLayout'
import type { PendingQuestionnaire } from '../../lib/questionnaires'

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
  pendingQuestionnaires?: PendingQuestionnaire[]
  onOpenQuestionnaire?: (questionnaireId: string) => void
  onOpenQuestionnairesAdmin?: () => void
  onOpenTickerAdmin?: () => void
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
  pendingQuestionnaires = [],
  onOpenQuestionnaire,
  onOpenQuestionnairesAdmin,
  onOpenTickerAdmin,
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
  const liveGameVersion = getLiveGameVersionLabel()
  const headerRef = useRef<HTMLElement>(null)
  const [whatsNew, setWhatsNew] = useState<WhatsNewEntry[]>([])
  const [tickerItems, setTickerItems] = useState<SiteTickerItem[]>([])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      void Promise.all([fetchTickerCategories(), fetchActiveWhatsNewEntries()]).then(
        ([, rows]) => {
          if (!cancelled) setWhatsNew(rows)
        }
      )
    }
    load()
    const onChanged = () => load()
    window.addEventListener(WHATS_NEW_CHANGED_EVENT, onChanged)
    return () => {
      cancelled = true
      window.removeEventListener(WHATS_NEW_CHANGED_EVENT, onChanged)
    }
  }, [])

  useEffect(() => {
    setTickerItems(buildSiteTickerItems(whatsNew, pendingQuestionnaires))
  }, [whatsNew, pendingQuestionnaires])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

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
  }, [updateAvailable])

  return (
    <div className="site-page-bg min-h-screen flex flex-col site-ticker-offset">
      <header
        ref={headerRef}
        className="fixed top-0 inset-x-0 z-40 flex flex-col overflow-visible"
      >
        {updateAvailable && <UpdateAvailableBanner />}
        <div className="site-app-header">
          <div className="site-shell h-14 flex items-center gap-2 sm:gap-3 min-w-0">
            <AppSidebar groups={navGroups} />
            <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
              <SiteBrandTitle size="compact" layout="inline" align="left" subtle className="truncate" />
              {liveGameVersion ? (
                <span
                  className="shrink-0 max-w-[42vw] sm:max-w-none truncate text-[10px] sm:text-xs font-semibold tabular-nums tracking-tight text-slate-500"
                  title={`Star Citizen LIVE (RSI launcher): ${liveGameVersion}`}
                >
                  {liveGameVersion}
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isGuestPreview ? (
                <>
                  <RequestServicesControl disabled={false} />
                  <SignInMenu />
                </>
              ) : (
                <>
                  <RequestServicesControl disabled={isPending} />
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
                    onOpenTickerAdmin={onOpenTickerAdmin}
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
        <SiteSupportLink className="text-xs" />
        <p className="text-xs text-slate-600">
          Anonymous usage metrics (tool visits and active time) help improve the site.
        </p>
        <DfpOptOutFooter />
      </footer>

      <SiteTicker
        items={tickerItems}
        onOpenQuestionnaire={(id) => onOpenQuestionnaire?.(id)}
      />
      {!isGuestPreview && !isPending ? <ServiceRequestAcceptedListener /> : null}
    </div>
  )
}
