import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useClickOutside } from '../../hooks/useClickOutside'
import type { Profile } from '../../lib/supabase'
import { DUMPER_APPS_DISPLAY_NAME } from '../../config/bpDumper'
import RsiVerifiedBadge from '../RsiVerifiedBadge'
import OfficerToolsModal from '../OfficerToolsModal'

interface AppUserMenuProps {
  displayName: string
  profile: Profile | null
  isPending: boolean
  isOfficerOrAbove: boolean
  isSuperAdmin: boolean
  showSettingsButton: boolean
  showDbActionsButton: boolean
  showAdminPanelButton: boolean
  onOpenSettings: () => void
  onOpenBpDumper: () => void
  onOpenDbActions: () => void
  onOpenDiscord: () => void
  onOpenAdmin: () => void
  onOpenQuestionnairesAdmin?: () => void
  onOpenTickerAdmin?: () => void
  onOpenSupport: () => void
  onSignOut: () => void
}

function MenuSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {children}
    </p>
  )
}

function MenuDivider() {
  return <div className="border-t border-slate-700 my-1" />
}

const menuItemClass =
  'w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-white transition-colors'

export default function AppUserMenu({
  displayName,
  profile,
  isPending,
  isOfficerOrAbove,
  isSuperAdmin,
  showSettingsButton,
  showDbActionsButton,
  showAdminPanelButton,
  onOpenSettings,
  onOpenBpDumper,
  onOpenDbActions,
  onOpenDiscord,
  onOpenAdmin,
  onOpenQuestionnairesAdmin,
  onOpenTickerAdmin,
  onOpenSupport,
  onSignOut,
}: AppUserMenuProps) {
  const [open, setOpen] = useState(false)
  const [showOfficerTools, setShowOfficerTools] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const routerLocation = useRouterState({ select: (s) => s.location })

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  useClickOutside(containerRef, open, close)

  useEffect(() => {
    close()
  }, [routerLocation.pathname, routerLocation.searchStr, close])

  if (isPending) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2 py-1 bg-amber-950/80 border border-amber-500/50 rounded-lg">
          <div className="w-6 h-6 rounded-full bg-amber-600/30 border border-amber-500/50 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span className="text-amber-300 text-xs font-semibold uppercase tracking-wide">Pending</span>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="px-2 py-1 text-xs text-slate-400 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    )
  }

  const roleLabel =
    profile?.role === 'super-admin'
      ? 'Super Admin'
      : profile?.role === 'officer'
        ? 'Officer'
        : 'Member'

  const roleClass =
    profile?.role === 'super-admin'
      ? 'bg-purple-900/50 text-purple-400'
      : profile?.role === 'officer'
        ? 'bg-blue-900/50 text-blue-400'
        : 'bg-green-900/50 text-green-400'

  const showAccount = showSettingsButton
  const showHelp = !isSuperAdmin
  const showOfficer = isOfficerOrAbove
  const showSiteAdmin = isSuperAdmin
  const showPartnership = !!profile?.rsi_handle_verified

  return (
    <>
      <div ref={containerRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 px-2 py-1 border rounded-lg transition-colors shadow-md bg-slate-800/90 border-slate-600 hover:bg-slate-700"
        >
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt={displayName} className="w-6 h-6 rounded-full" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center text-white text-xs">
              {displayName[0]?.toUpperCase()}
            </div>
          )}
          <span className="text-xs hidden sm:inline max-w-[100px] truncate text-white">{displayName}</span>
          <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-[60] max-h-[min(70dvh,24rem)] overflow-y-auto overscroll-contain">
            <div className="p-3 border-b border-slate-700">
              <p className="text-white font-medium truncate flex items-center gap-1.5">
                <span>{displayName}</span>
                {profile?.rsi_handle_verified && <RsiVerifiedBadge size="sm" />}
              </p>
              {profile?.rsi_handle && (
                <p className="text-slate-500 text-xs truncate">({profile.display_name})</p>
              )}
              <p className="text-slate-400 text-sm truncate">{profile?.email}</p>
              <p className="text-xs mt-1">
                <span className={`px-1.5 py-0.5 rounded ${roleClass}`}>{roleLabel}</span>
              </p>
            </div>

            {showAccount && (
              <div className="py-1">
                <MenuSectionLabel>Account</MenuSectionLabel>
                <button
                  type="button"
                  onClick={() => {
                    close()
                    onOpenSettings()
                  }}
                  className={menuItemClass}
                >
                  Settings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close()
                    onOpenBpDumper()
                  }}
                  className={menuItemClass}
                >
                  {DUMPER_APPS_DISPLAY_NAME}
                </button>
                <Link to="/discord-subscribe" onClick={close} className={`block ${menuItemClass}`}>
                  Webhooks
                </Link>
                {showPartnership && (
                  <Link to="/partnership" onClick={close} className={`block ${menuItemClass}`}>
                    Partnership
                  </Link>
                )}
              </div>
            )}

            {showHelp && (
              <>
                <MenuDivider />
                <div className="py-1">
                  <MenuSectionLabel>Help</MenuSectionLabel>
                  <button
                    type="button"
                    onClick={() => {
                      close()
                      onOpenSupport()
                    }}
                    className={menuItemClass}
                  >
                    Support
                  </button>
                </div>
              </>
            )}

            {showOfficer && (
              <>
                <MenuDivider />
                <div className="py-1">
                  <MenuSectionLabel>Officer</MenuSectionLabel>
                  <Link to="/support-dashboard" onClick={close} className={`block ${menuItemClass}`}>
                    Support Dashboard
                  </Link>
                  {showAdminPanelButton && (
                    <button
                      type="button"
                      onClick={() => {
                        close()
                        onOpenAdmin()
                      }}
                      className={menuItemClass}
                    >
                      Admin Panel
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      close()
                      setShowOfficerTools(true)
                    }}
                    className={menuItemClass}
                  >
                    Officer Tools
                  </button>
                </div>
              </>
            )}

            {showSiteAdmin && (
              <>
                <MenuDivider />
                <div className="py-1">
                  <MenuSectionLabel>Site admin</MenuSectionLabel>
                  <Link to="/analytics" onClick={close} className={`block ${menuItemClass}`}>
                    Site Analytics
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      close()
                      onOpenDiscord()
                    }}
                    className={menuItemClass}
                  >
                    Discord
                  </button>
                  {onOpenQuestionnairesAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        close()
                        onOpenQuestionnairesAdmin()
                      }}
                      className={menuItemClass}
                    >
                      Questionnaires
                    </button>
                  )}
                  {onOpenTickerAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        close()
                        onOpenTickerAdmin()
                      }}
                      className={menuItemClass}
                    >
                      Updates Ticker
                    </button>
                  )}
                  {showDbActionsButton && (
                    <button
                      type="button"
                      onClick={() => {
                        close()
                        onOpenDbActions()
                      }}
                      className={menuItemClass}
                    >
                      DB Actions
                    </button>
                  )}
                </div>
              </>
            )}

            <MenuDivider />
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  close()
                  onSignOut()
                }}
                className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-slate-700 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>

      {showOfficerTools && (
        <OfficerToolsModal
          isSuperAdmin={isSuperAdmin}
          onClose={() => setShowOfficerTools(false)}
        />
      )}
    </>
  )
}
