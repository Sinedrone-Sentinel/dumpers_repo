import React, { useEffect } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import FeaturePageLayout from '../layout/FeaturePageLayout'
import { DUMPER_APPS_DISPLAY_NAME } from '../../config/bpDumper'
import {
  DUMPER_APP_TABS,
  type DumperAppTabId,
  parseDumperAppTab,
} from '../../config/dumperApps'
import { setAnalyticsSubTool } from '../../lib/analytics'
import BpDumperPanel from './BpDumperPanel'
import RsiPlusPanel from './RsiPlusPanel'
import StarOrgStringsPanel from './StarOrgStringsPanel'

const TAB_CLASS =
  'w-full text-left px-3 py-2.5 text-sm font-medium rounded-lg transition-colors site-btn-shimmer'

export default function DumperAppsPage() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { app?: string }
  const activeTab = parseDumperAppTab(search.app)

  useEffect(() => {
    setAnalyticsSubTool(activeTab.replace(/-/g, '_'))
  }, [activeTab])

  const setTab = (id: DumperAppTabId) => {
    void navigate({
      to: '/dumper-apps',
      search: id === 'bp-dumper' ? {} : { app: id },
      replace: true,
    })
  }

  return (
    <FeaturePageLayout
      title={DUMPER_APPS_DISPLAY_NAME}
      seoIntro="Member downloads for BP Dumper, StarOrg-Strings (StarOrg Codex), and the RSI+ Chrome extension — install links and setup for Dumper's Repo companion apps."
      meta={<span className="text-slate-400">Member tools by Dumper&apos;s Repo and Zedwil</span>}
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
          {activeTab === 'bp-dumper' ? <BpDumperPanel /> : null}
          {activeTab === 'starorg-strings' ? <StarOrgStringsPanel /> : null}
          {activeTab === 'rsi-plus' ? <RsiPlusPanel /> : null}
        </div>
      </div>
    </FeaturePageLayout>
  )
}
