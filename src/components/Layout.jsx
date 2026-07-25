import React, { useState, useEffect, useCallback } from 'react'
import { Outlet } from '@tanstack/react-router'
import { useAuth } from '../contexts/AuthContext'
import { BpDumperModalProvider, useBpDumperModal } from '../contexts/BpDumperModalContext'
import { UiOverlayProvider } from '../contexts/UiOverlayContext'
import { getVisibleNavGroups } from '../config/appNav'
import { supabase } from '../lib/supabase'
import {
  declineQuestionnaire,
  listPendingQuestionnaires,
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
import MarketplaceBottomStack from './marketplace/MarketplaceBottomStack'
import AppChrome from './layout/AppChrome'
import AnalyticsTracker from './AnalyticsTracker'
import AppBootstrapScreen from './bootstrap/AppBootstrapScreen'

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
  fillQuestionnaireId,
  setFillQuestionnaireId,
  guestPending,
  refreshPendingQuestionnaires,
}) {
  const { openBpDumperModal } = useBpDumperModal()

  const handleDeclineGuest = async () => {
    if (!guestPending?.id) return
    const result = await declineQuestionnaire(guestPending.id, true)
    if (!result.error) {
      setFillQuestionnaireId(null)
      void refreshPendingQuestionnaires()
    }
  }

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
        guestQuestionnaireBanner={
          isGuestPreview && guestPending
            ? { title: guestPending.title }
            : null
        }
        onOpenGuestQuestionnaire={() => {
          if (guestPending?.id) setFillQuestionnaireId(guestPending.id)
        }}
        onDeclineGuestQuestionnaire={() => void handleDeclineGuest()}
        onOpenQuestionnaire={(id) => setFillQuestionnaireId(id)}
        onOpenQuestionnairesAdmin={
          isSuperAdmin ? () => setShowQuestionnairesAdmin(true) : undefined
        }
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
        <WelcomeModal onClose={() => setShowWelcomeModal(false)} />
      )}
      {!isGuestPreview && isSuperAdmin && showQuestionnairesAdmin && (
        <QuestionnairesAdminModal onClose={() => setShowQuestionnairesAdmin(false)} />
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
  const [fillQuestionnaireId, setFillQuestionnaireId] = useState(null)
  const [guestPending, setGuestPending] = useState(null)
  const [welcomeChecked, setWelcomeChecked] = useState(false)

  const refreshPendingQuestionnaires = useCallback(async () => {
    if (!isGuestPreview && !user) {
      setGuestPending(null)
      return
    }
    const result = await listPendingQuestionnaires(Boolean(isGuestPreview))
    if (result.error) {
      setGuestPending(null)
      return
    }
    setGuestPending(isGuestPreview ? result.data[0] ?? null : null)
  }, [isGuestPreview, user])

  useEffect(() => {
    void refreshPendingQuestionnaires()
  }, [refreshPendingQuestionnaires])

  useEffect(() => {
    if (!user || !isApproved || isGuestPreview || welcomeChecked) return

    const checkWelcome = async () => {
      try {
        const { data } = await supabase.rpc('get_welcome_modal_status')
        if (data) {
          const shouldShow = data.always_show || !data.has_seen
          setShowWelcomeModal(shouldShow)
        }
      } catch {
        // If RPC doesn't exist yet (migration not run), skip
      }
      setWelcomeChecked(true)
    }

    void checkWelcome()
  }, [user, isApproved, isGuestPreview, welcomeChecked])

  if (loading) {
    return <AppBootstrapScreen steps={bootstrapSteps} />
  }

  if (isBanned) {
    return <BannedAccount />
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
          fillQuestionnaireId={fillQuestionnaireId}
          setFillQuestionnaireId={setFillQuestionnaireId}
          guestPending={guestPending}
          refreshPendingQuestionnaires={refreshPendingQuestionnaires}
        />
      </BpDumperModalProvider>
    </UiOverlayProvider>
  )
}
