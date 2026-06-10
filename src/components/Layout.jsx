import React, { useState, useEffect } from 'react'
import { Outlet } from '@tanstack/react-router'
import { useAuth } from '../contexts/AuthContext'
import { getVisibleNavGroups } from '../config/appNav'
import { supabase } from '../lib/supabase'
import Login from './Login'
import BannedAccount from './BannedAccount'
import AdminPanel from './AdminPanel'
import ProfileSettings from './ProfileSettings'
import DbActionsModal from './DbActionsModal'
import WelcomeModal from './WelcomeModal'
import AppChrome from './layout/AppChrome'

export default function Layout() {
  const {
    user,
    profile,
    loading,
    isBanned,
    isPending,
    isGhostMode,
    signOut,
    displayName,
    canAccess,
    visibilityContext,
    canUseFeature,
    isSuperAdmin,
  } = useAuth()
  const navGroups = getVisibleNavGroups(visibilityContext, canAccess)
  const showAdminPanelButton = canUseFeature('admin_panel')
  const showSettingsButton = canUseFeature('settings')
  const showDbActionsButton = isSuperAdmin
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [showProfileSettings, setShowProfileSettings] = useState(false)
  const [showDbActions, setShowDbActions] = useState(false)
  const [showWelcomeModal, setShowWelcomeModal] = useState(false)
  const [welcomeChecked, setWelcomeChecked] = useState(false)

  // Check if welcome modal should be shown (super-admin only for now)
  useEffect(() => {
    if (!user || !isSuperAdmin || welcomeChecked) return

    const checkWelcome = async () => {
      try {
        const { data } = await supabase.rpc('get_welcome_modal_status')
        if (data) {
          // Show if: always_show is true OR hasn't seen it yet
          const shouldShow = data.always_show || !data.has_seen
          setShowWelcomeModal(shouldShow)
        }
      } catch {
        // If RPC doesn't exist yet (migration not run), skip
      }
      setWelcomeChecked(true)
    }

    checkWelcome()
  }, [user, isSuperAdmin, welcomeChecked])

  if (loading) {
    return (
      <div className="site-page-bg min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-t-2 border-b-2 border-orange-500 rounded-full animate-spin mx-auto" />
          <p className="text-slate-400 text-lg font-medium">Loading...</p>
        </div>
      </div>
    )
  }

  if (isBanned) {
    return <BannedAccount />
  }

  if (!user) {
    return <Login />
  }

  return (
    <>
      <AppChrome
        navGroups={navGroups}
        displayName={displayName}
        profile={profile}
        isPending={isPending}
        isGhostMode={isGhostMode}
        showSettingsButton={showSettingsButton}
        showDbActionsButton={showDbActionsButton}
        showAdminPanelButton={showAdminPanelButton}
        onOpenSettings={() => setShowProfileSettings(true)}
        onOpenDbActions={() => setShowDbActions(true)}
        onOpenAdmin={() => setShowAdminPanel(true)}
        onSignOut={signOut}
      >
        <Outlet />
      </AppChrome>

      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} />}
      {showProfileSettings && <ProfileSettings onClose={() => setShowProfileSettings(false)} />}
      {showDbActions && <DbActionsModal onClose={() => setShowDbActions(false)} />}
      {showWelcomeModal && (
        <WelcomeModal
          onClose={() => setShowWelcomeModal(false)}
          onOpenSettings={() => setShowProfileSettings(true)}
        />
      )}
    </>
  )
}
