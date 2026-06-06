import React, { useState } from 'react'
import { Outlet } from '@tanstack/react-router'
import { useAuth } from '../contexts/AuthContext'
import Login from './Login'
import PendingApproval from './PendingApproval'
import AdminPanel from './AdminPanel'
import ProfileSettings from './ProfileSettings'

export default function Layout() {
  const { user, profile, loading, signOut, isOfficerOrAbove, displayName } = useAuth()
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showAdminPanel, setShowAdminPanel] = useState(false)
  const [showProfileSettings, setShowProfileSettings] = useState(false)

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-t-2 border-b-2 border-red-500 rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-400 text-lg font-medium">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  if (profile?.role === 'pending') {
    return <PendingApproval />
  }

  return (
    <div className="min-h-screen">
      {/* User Menu - Fixed Top Right */}
      <div className="fixed top-2 right-2 sm:top-4 sm:right-4 z-[60]">
        <button
          onClick={() => setShowUserMenu(!showUserMenu)}
          className="flex items-center gap-1.5 px-2 py-1 bg-slate-800 backdrop-blur border border-slate-600 rounded-lg hover:bg-slate-700 transition-colors shadow-md"
        >
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={displayName}
              className="w-6 h-6 rounded-full"
            />
          ) : (
            <div className="w-6 h-6 rounded-full bg-slate-600 flex items-center justify-center text-white text-xs">
              {displayName[0].toUpperCase()}
            </div>
          )}
          <span className="text-white text-xs hidden sm:inline max-w-[80px] truncate">
            {displayName}
          </span>
          <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showUserMenu && (
          <>
            <div
              className="fixed inset-0 z-[55]"
              onClick={() => setShowUserMenu(false)}
            />
            <div className="absolute right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-[60] overflow-hidden">
              <div className="p-3 border-b border-slate-700">
                <p className="text-white font-medium truncate">{displayName}</p>
                {profile?.rsi_handle && (
                  <p className="text-slate-500 text-xs truncate">({profile.display_name})</p>
                )}
                <p className="text-slate-400 text-sm truncate">{profile?.email}</p>
                <p className="text-xs mt-1">
                  <span className={`px-1.5 py-0.5 rounded ${
                    profile?.role === 'super-admin' 
                      ? 'bg-purple-900/50 text-purple-400'
                      : profile?.role === 'officer'
                        ? 'bg-blue-900/50 text-blue-400'
                        : 'bg-green-900/50 text-green-400'
                  }`}>
                    {profile?.role === 'super-admin' ? 'Super Admin' : 
                     profile?.role === 'officer' ? 'Officer' : 'Member'}
                  </span>
                </p>
              </div>

              <button
                onClick={() => {
                  setShowUserMenu(false)
                  setShowProfileSettings(true)
                }}
                className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Set RSI Handle
              </button>
              
              {isOfficerOrAbove && (
                <button
                  onClick={() => {
                    setShowUserMenu(false)
                    setShowAdminPanel(true)
                  }}
                  className="w-full px-4 py-2 text-left text-slate-300 hover:bg-slate-700 transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Admin Panel
                </button>
              )}
              
              <button
                onClick={() => {
                  setShowUserMenu(false)
                  signOut()
                }}
                className="w-full px-4 py-2 text-left text-red-400 hover:bg-slate-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>

      {/* Admin Panel Modal */}
      {showAdminPanel && <AdminPanel onClose={() => setShowAdminPanel(false)} />}

      {/* Profile Settings Modal */}
      {showProfileSettings && <ProfileSettings onClose={() => setShowProfileSettings(false)} />}

      {/* Main Content */}
      <Outlet />

      {/* Footer */}
      <footer className="mt-12 py-6 text-center text-slate-500 border-t border-slate-800">
        <p>© 2024 Black Star Dumpers - All blueprints subject to game EULA</p>
        <div className="flex justify-center gap-4 mt-2 text-sm">
          <a href="#" className="hover:text-red-400 transition-colors">About</a>
          <span className="text-slate-600">|</span>
          <a href="#" className="hover:text-red-400 transition-colors">Privacy</a>
          <span className="text-slate-600">|</span>
          <a href="#" className="hover:text-red-400 transition-colors">Contact</a>
        </div>
      </footer>
    </div>
  )
}
