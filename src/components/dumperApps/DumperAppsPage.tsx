import React, { useEffect, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import FeaturePageLayout from '../layout/FeaturePageLayout'
import OAuthSignInButtons from '../auth/OAuthSignInButtons'
import { DUMPER_APPS_DISPLAY_NAME } from '../../config/bpDumper'
import {
  DUMPER_APP_TABS,
  type DumperAppTabId,
  parseDumperAppTab,
} from '../../config/dumperApps'
import { useAuth } from '../../contexts/AuthContext'
import { setAnalyticsSubTool } from '../../lib/analytics'
import { getGuestFeatureCopy, GUEST_MEMBERSHIP_PITCH } from '../../lib/guestFeatureCopy'
import BpDumperPanel from './BpDumperPanel'
import RsiPlusPanel from './RsiPlusPanel'
import StarOrgStringsPanel from './StarOrgStringsPanel'

const TAB_CLASS =
  'w-full text-left px-3 py-2.5 text-sm font-medium rounded-lg transition-colors site-btn-shimmer'

function BpDumperLockPanel({ isPending }: { isPending: boolean }) {
  const { oauthReturnError } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const copy = getGuestFeatureCopy('dumper_apps')

  useEffect(() => {
    if (oauthReturnError) setError(oauthReturnError)
  }, [oauthReturnError])

  return (
    <div className="max-w-2xl space-y-5">
      <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 px-4 py-3">
        <p className="text-sm font-semibold text-amber-100">
          {isPending ? 'Approval needed for BP Dumper' : 'Sign in for BP Dumper'}
        </p>
        <p className="mt-1 text-sm text-amber-200/90">
          {isPending
            ? 'Your account is signed in but still pending officer approval. StarOrg-Strings and RSI+ stay open on the other tabs.'
            : 'Downloads and your personal API key need a free member account. StarOrg-Strings and RSI+ stay open on the other tabs without signing in.'}
        </p>
      </div>

      <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-4">
        <h3 className="text-sm font-semibold text-emerald-300 mb-1">{GUEST_MEMBERSHIP_PITCH.headline}</h3>
        <p className="text-sm text-emerald-200/90 mb-3">{GUEST_MEMBERSHIP_PITCH.subhead}</p>
        <ul className="text-sm text-emerald-200/80 space-y-1.5">
          {GUEST_MEMBERSHIP_PITCH.bullets.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-emerald-400 shrink-0">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-sm text-slate-300 leading-relaxed">{copy.description}</p>

      <div className="site-surface rounded-xl p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-orange-400">
          Included with your free member account
        </h3>
        <ul className="space-y-2 text-sm text-slate-400">
          {copy.details.map((detail) => (
            <li key={detail} className="flex gap-2">
              <span className="shrink-0 text-orange-500">•</span>
              <span>{detail}</span>
            </li>
          ))}
        </ul>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-500/50 bg-red-900/50 p-3 text-sm text-red-400" role="alert">
          {error}
        </div>
      ) : null}

      {!isPending ? (
        <OAuthSignInButtons layout="row" onError={setError} />
      ) : null}
    </div>
  )
}

export default function DumperAppsPage() {
  const navigate = useNavigate()
  const { user, isApproved, isGuestPreview, isPending } = useAuth()
  const search = useSearch({ strict: false }) as { app?: string }
  const requestedTab = parseDumperAppTab(search.app)
  const canUseBpDumper = Boolean(user && isApproved && !isGuestPreview)
  const hasExplicitApp = typeof search.app === 'string' && search.app.trim().length > 0

  // Guests / non-approved: default away from locked BP tab unless they asked for it.
  const activeTab: DumperAppTabId =
    !canUseBpDumper && !hasExplicitApp && requestedTab === 'bp-dumper'
      ? 'starorg-strings'
      : requestedTab

  useEffect(() => {
    if (canUseBpDumper) return
    if (hasExplicitApp) return
    if (requestedTab !== 'bp-dumper') return
    void navigate({
      to: '/dumper-apps',
      search: { app: 'starorg-strings' },
      replace: true,
    })
  }, [canUseBpDumper, hasExplicitApp, requestedTab, navigate])

  useEffect(() => {
    setAnalyticsSubTool(activeTab.replace(/-/g, '_'))
  }, [activeTab])

  const setTab = (id: DumperAppTabId) => {
    // Guests must keep ?app=bp-dumper so the lock panel is not redirected away.
    const search =
      id === 'bp-dumper'
        ? canUseBpDumper
          ? {}
          : { app: 'bp-dumper' }
        : { app: id }
    void navigate({
      to: '/dumper-apps',
      search,
      replace: true,
    })
  }

  return (
    <FeaturePageLayout
      title={DUMPER_APPS_DISPLAY_NAME}
      seoIntro="BP Dumper, StarOrg-Strings (StarOrg Codex), and the RSI+ Chrome extension — StarOrg and RSI+ are open in Offline Mode; BP Dumper needs a free member account."
      meta={
        <span className="text-slate-400">
          Companion tools by Dumper&apos;s Repo and StarOrg — BP Dumper needs sign-in
        </span>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[14rem_1fr] min-w-0">
        <nav
          className="site-surface p-2 flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-visible"
          aria-label="Dumper Apps"
        >
          {DUMPER_APP_TABS.map((tab) => {
            const selected = tab.id === activeTab
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTab(tab.id)}
                className={`${TAB_CLASS} ${
                  selected ? 'site-filter-selected-orange' : 'site-filter-idle'
                }`}
                aria-current={selected ? 'page' : undefined}
              >
                <span className="lg:hidden">{tab.shortLabel}</span>
                <span className="hidden lg:inline">{tab.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="min-w-0 site-surface p-4 sm:p-5">
          {activeTab === 'bp-dumper' ? (
            canUseBpDumper ? <BpDumperPanel /> : <BpDumperLockPanel isPending={Boolean(user && isPending)} />
          ) : null}
          {activeTab === 'starorg-strings' ? <StarOrgStringsPanel /> : null}
          {activeTab === 'rsi-plus' ? <RsiPlusPanel /> : null}
        </div>
      </div>
    </FeaturePageLayout>
  )
}
