import React from 'react'
import { SITE_COPYRIGHT } from '../config/site'
import { useAuth } from '../contexts/AuthContext'

export default function BannedAccount() {
  const { signOut } = useAuth()

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
            <div className="w-20 h-20 mx-auto bg-red-500/20 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            </div>

            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Account Banned</h2>
              <p className="text-slate-400">
                You have been banned from Dumper's Repo. Your blueprint data has been removed and you cannot access the app.
              </p>
            </div>

            <p className="text-slate-500 text-sm">
              If you believe this was a mistake, contact an officer.
            </p>

            <button
              onClick={signOut}
              className="w-full px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-slate-500 text-sm">{SITE_COPYRIGHT}</p>
        </div>
      </div>
    </div>
  )
}
