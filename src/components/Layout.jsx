import React, { useState, useEffect, useCallback } from 'react'
import { Outlet, useRouterState } from '@tanstack/react-router'
import { useAuth } from '../contexts/AuthContext'
import { BpDumperModalProvider, useBpDumperModal } from '../contexts/BpDumperModalContext'
import { UiOverlayProvider } from '../contexts/UiOverlayContext'
import { getVisibleNavGroups } from '../config/appNav'
import { supabase } from '../lib/supabase'
import {
  listPendingQuestionnaires,
  QUESTIONNAIRES_CHANGED_EVENT,
} from '../lib/questionnaires'
import PublicSeoLanding from './seo/PublicSeoLanding'
import SeoHead from './seo/SeoHead'
import BannedAccount from './BannedAccount'
import AdminPanel from './AdminPanel'
import ProfileSettings from './ProfileSettings'
import DbActionsModal from './DbActionsModal'
import DiscordSettingsModal from './DiscordSettingsModal'
import WelcomeModal from './WelcomeModal'
import SupportTicketsModal from './SupportTicketsModal'
import QuestionnairesAdminModal from './questionnaires/QuestionnairesAdminModal'
import QuestionnaireModal from './questionnaires/QuestionnaireModal'
import TickerAdminModal from './layout/TickerAdminModal'
import MarketplaceBottomStack from './marketplace/MarketplaceBottomStack'
import AppChrome from './layout/AppChrome'
import AnalyticsTracker from './AnalyticsTracker'
import AppBootstrapScreen from './bootstrap/AppBootstrapScreen'

/** Signed-out visitors may open these without Offline Mode (crawlable SEO surfaces). */
function isPublicSeoPath(pathname) {
  const bare = (pathname || '/').split('?')[0].split('#')[0] || '/'
  const normalized = bare.length > 1 && bare.endsWith('/') ? bare.slice(0, -1) : bare
  return (
    normalized === '/blueprints' ||
    normalized.startsWith('/blueprints/') ||
    normalized === '/privacy'
  )
}

/** Temporary theme gallery — always reachable without auth / Offline Mode. */
function isThemePreviewPath(pathname) {
  const bare = (pathname || '/').split('?')[0].split('#')[0] || '/'
  const normalized = bare.length > 1 && bare.endsWith('/') ? bare.slice(0, -1) : bare
  return normalized === '/theme-preview'
}

function LayoutContent({
  navGroups,
  displayName,
  profile,
  isPending,
  isGuestPreview,
  isApproved,
  isOfficerOrAbove,
  isSuperAdmin,
  showSettingsButton,
  showDbActionsButton,
  showAdminPanelButton,
  signOut,
  exitGuestPreview,
  showAdminPanel,
  setShowAdminPanel,
  showProfileSettings,
  setShowProfileSettings,
  showDbActions,
  setShowDbActions,
  showDiscordSettings,
  setShowDiscordSettings,
  showSupportModal,
  setShowSupportModal,
  showWelcomeModal,
  setShowWelcomeModal,
  showQuestionnairesAdmin,
  setShowQuestionnairesAdmin,
  showTickerAdmin,
  setShowTickerAdmin,
  fillQuestionnaireId,
  setFillQuestionnaireId,
  pendingQuestionnaires,
  refreshPendingQuestionnaires,
}) {
  const { openBpDumperModal } = useBpDumperModal()

  return (
    <>
      <AnalyticsTracker />
      <AppChrome
        navGroups={navGroups}
        displayName={displayName}
        profile={profile}
        isPending={isPending}
        isGuestPreview={isGuestPreview}
        isOfficerOrAbove={isOfficerOrAbove}
        isSuperAdmin={isSuperAdmin}
        showSettingsButton={showSettingsButton}
        showDbActionsButton={showDbActionsButton}
        showAdminPanelButton={showAdminPanelButton}
        pendingQuestionnaires={pendingQuestionnaires}
        onOpenQuestionnaire={(id) => setFillQuestionnaireId(id)}
        onOpenQuestionnairesAdmin={
          isSuperAdmin ? () => setShowQuestionnairesAdmin(true) : undefined
        }
        onOpenTickerAdmin={isSuperAdmin ? () => setShowTickerAdmin(true) : undefined}
        onOpenSettings={() => setShowProfileSettings(true)}
        onOpenBpDumper={openBpDumperModal}
        onOpenDbActions={() => setShowDbActions(true)}
        onOpenDiscord={() => setShowDiscordSettings(true)}
        onOpenAdmin={() => setShowAdminPanel(true)}
        onOpenSupport={() => setShowSupportModal(true)}
        onSignOut={signOut}
        onExitGuestPreview={exitGuestPreview}
      >
        <Outlet />
      </AppChrome>

      {!isGuestPreview && showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} />}
      {!isGuestPreview && showProfileSettings && (
        <ProfileSettings onClose={() => setShowProfileSettings(false)} />
      )}
      {!isGuestPreview && showDbActions && <DbActionsModal onClose={() => setShowDbActions(false)} />}
      {!isGuestPreview && showDiscordSettings && (
        <DiscordSettingsModal onClose={() => setShowDiscordSettings(false)} />
      )}
      {!isGuestPreview && showSupportModal && (
        <SupportTicketsModal onClose={() => setShowSupportModal(false)} />
      )}
      {!isGuestPreview && showWelcomeModal && (
        <WelcomeModal onComplete={() => setShowWelcomeModal(false)} />
      )}
      {!isGuestPreview && isSuperAdmin && showQuestionnairesAdmin && (
        <QuestionnairesAdminModal onClose={() => setShowQuestionnairesAdmin(false)} />
      )}
      {!isGuestPreview && isSuperAdmin && showTickerAdmin && (
        <TickerAdminModal onClose={() => setShowTickerAdmin(false)} />
      )}
      {fillQuestionnaireId && (
        <QuestionnaireModal
          questionnaireId={fillQuestionnaireId}
          isGuest={isGuestPreview}
          onClose={() => setFillQuestionnaireId(null)}
          onResolved={() => {
            void refreshPendingQuestionnaires()
          }}
        />
      )}

      {isApproved && !isGuestPreview && (
        <MarketplaceBottomStack onOpenSettings={() => setShowProfileSettings(true)} />
      )}
    </>
  )
}

export default function Layout() {
  const {
    user,
    profile,
    loading,
    bootstrapSteps,
    isBanned,
    isPending,
    isApproved,
    isOfficerOrAbove,
    signOut,
    displayName,
    canAccess,
    visibilityContext,
    canUseFeature,
    isSuperAdmin,
    isGuestPreview,
    enterGuestPreview,
    exitGuestPreview,
  } = useAuth()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const navGroups = getVisibleNavGroups(visibilityContext, canAccess)
  const showAdminPanelButton = canUseFeature('admin_panel')
  const showSettingsButton = canUseFeature('settings')
  const showDbActionsButton = isSuperAdmin
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [showProfileSettings, setShowProfileSettings] = useState(false)
  const [showDbActions, setShowDbActions] = useState(false)
  const [showDiscordSettings, setShowDiscordSettings] = useState(false)
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)
  const [showSupportModal, setShowSupportModal] = useState(false)
  const [showQuestionnairesAdmin, setShowQuestionnairesAdmin] = useState(false)
  const [showTickerAdmin, setShowTickerAdmin] = useState(false)
  const [fillQuestionnaireId, setFillQuestionnaireId] = useState(null)
  const [pendingQuestionnaires, setPendingQuestionnaires] = useState([])
  /** unknown | required | done — required blocks member UI until welcome is finished */
  const [onboardingState, setOnboardingState] = useState('done')

  const refreshPendingQuestionnaires = useCallback(async () => {
    if (!isGuestPreview && !user) {
      setPendingQuestionnaires([])
      return
    }
    const result = await listPendingQuestionnaires(Boolean(isGuestPreview))
    if (result.error) {
      setPendingQuestionnaires([])
      return
    }
    // Active / non-dismissed only — RPC excludes declined & submitted
    setPendingQuestionnaires(result.data ?? [])
  }, [isGuestPreview, user])

  useEffect(() => {
    void refreshPendingQuestionnaires()
  }, [refreshPendingQuestionnaires])

  useEffect(() => {
    const onChanged = () => {
      void refreshPendingQuestionnaires()
    }
    window.addEventListener(QUESTIONNAIRES_CHANGED_EVENT, onChanged)
    return () => window.removeEventListener(QUESTIONNAIRES_CHANGED_EVENT, onChanged)
  }, [refreshPendingQuestionnaires])

  // SEO / deep links: /?q=Name must open Offline Mode instead of the marketing landing.
  useEffect(() => {
    if (loading || user || isGuestPreview) return
    if (pathname !== '/') return
    try {
      const q = new URLSearchParams(window.location.search).get('q')
      if (q && q.trim()) enterGuestPreview()
    } catch {
      /* ignore */
    }
  }, [loading, user, isGuestPreview, pathname, enterGuestPreview])

  useEffect(() => {
    if (!user || !isApproved || isGuestPreview) {
      setOnboardingState('done')
      setShowWelcomeModal(false)
      return
    }

    let cancelled = false
    setOnboardingState('unknown')

    const checkWelcome = async () => {
      try {
        const { data, error } = await supabase.rpc('get_welcome_modal_status')
        if (cancelled) return
        if (error || !data) {
          // Fail closed — do not let members into the app without a known welcome status
          setOnboardingState('required')
          setShowWelcomeModal(false)
          return
        }
        if (!data.has_seen) {
          setOnboardingState('required')
          setShowWelcomeModal(false)
          return
        }
        setOnboardingState('done')
        // Super-admin testing toggle: overlay only, does not re-lock the site
        setShowWelcomeModal(Boolean(data.always_show))
      } catch {
        if (!cancelled) {
          setOnboardingState('required')
          setShowWelcomeModal(false)
        }
      }
    }

    void checkWelcome()
    return () => {
      cancelled = true
    }
  }, [user, isApproved, isGuestPreview])

  if (loading) {
    return <AppBootstrapScreen steps={bootstrapSteps} />
  }

  if (isBanned) {
    return <BannedAccount />
  }

  // Approved members must finish welcome before any member shell (including SEO catalog).
  if (user && isApproved && !isGuestPreview && onboardingState === 'unknown') {
    return <AppBootstrapScreen steps={bootstrapSteps} />
  }

  if (user && isApproved && !isGuestPreview && onboardingState === 'required') {
    return (
      <UiOverlayProvider>
        <SeoHead />
        <div className="site-page-bg min-h-screen text-slate-100">
          <WelcomeModal
            onComplete={() => {
              setOnboardingState('done')
              setShowWelcomeModal(false)
            }}
          />
        </div>
      </UiOverlayProvider>
    )
  }

  // Public crawlable catalog — standalone shell for everyone (no app sidebar).
  if (isPublicSeoPath(pathname)) {
    return (
      <>
        <SeoHead />
        <AnalyticsTracker />
        <Outlet />
      </>
    )
  }

  // Theme token gallery — no auth gate (dev review before commit).
  if (isThemePreviewPath(pathname)) {
    return (
      <UiOverlayProvider>
        <SeoHead />
        <div className="site-page-bg min-h-screen text-slate-100">
          <Outlet />
        </div>
      </UiOverlayProvider>
    )
  }

  if (!user && !isGuestPreview) {
    return (
      <>
        <SeoHead />
        <PublicSeoLanding onBrowseOffline={enterGuestPreview} />
      </>
    )
  }

  return (
    <UiOverlayProvider>
      <SeoHead />
      <BpDumperModalProvider>
        <LayoutContent
          navGroups={navGroups}
          displayName={displayName}
          profile={profile}
          isPending={isPending}
          isGuestPreview={isGuestPreview}
          isApproved={isApproved}
          isOfficerOrAbove={isOfficerOrAbove}
          isSuperAdmin={isSuperAdmin}
          showSettingsButton={showSettingsButton}
          showDbActionsButton={showDbActionsButton}
          showAdminPanelButton={showAdminPanelButton}
          signOut={signOut}
          exitGuestPreview={exitGuestPreview}
          showAdminPanel={showAdminPanel}
          setShowAdminPanel={setShowAdminPanel}
          showProfileSettings={showProfileSettings}
          setShowProfileSettings={setShowProfileSettings}
          showDbActions={showDbActions}
          setShowDbActions={setShowDbActions}
          showDiscordSettings={showDiscordSettings}
          setShowDiscordSettings={setShowDiscordSettings}
          showSupportModal={showSupportModal}
          setShowSupportModal={setShowSupportModal}
          showWelcomeModal={showWelcomeModal}
          setShowWelcomeModal={setShowWelcomeModal}
          showQuestionnairesAdmin={showQuestionnairesAdmin}
          setShowQuestionnairesAdmin={setShowQuestionnairesAdmin}
          showTickerAdmin={showTickerAdmin}
          setShowTickerAdmin={setShowTickerAdmin}
          fillQuestionnaireId={fillQuestionnaireId}
          setFillQuestionnaireId={setFillQuestionnaireId}
          pendingQuestionnaires={pendingQuestionnaires}
          refreshPendingQuestionnaires={refreshPendingQuestionnaires}
        />
      </BpDumperModalProvider>
    </UiOverlayProvider>
  )
}
