import React from 'react'
import { useAuth } from '../contexts/AuthContext'

export default function PendingApproval() {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 
            className="text-4xl md:text-5xl font-black tracking-wider uppercase mb-4"
            style={{ 
              fontFamily: "'Orbitron', sans-serif",
              background: 'linear-gradient(135deg, #ef4444 0%, #f97316 25%, #eab308 50%, #f97316 75%, #ef4444 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Dumper's Repo
          </h1>
        </div>

        <div className="bg-slate-900/80 border border-slate-700 rounded-2xl p-8 shadow-2xl">
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto bg-amber-500/20 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Awaiting Approval</h2>
              <p className="text-slate-400">
                Your account is pending approval from an officer.
              </p>
            </div>

            {profile && (
              <div className="bg-slate-800/50 rounded-xl p-4 text-left">
                <p className="text-slate-500 text-sm mb-1">Signed in as</p>
                <p className="text-white font-medium">{profile.display_name || profile.email}</p>
                <p className="text-slate-400 text-sm">{profile.email}</p>
              </div>
            )}

            <p className="text-slate-500 text-sm">
              An officer will review your request and grant access. This usually happens within 24 hours.
            </p>

            <button
              onClick={signOut}
              className="w-full px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
