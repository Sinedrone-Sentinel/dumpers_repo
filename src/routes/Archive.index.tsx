import React, { useState, useCallback } from 'react'
import { useSearch, useNavigate } from '@tanstack/react-router'
import ArchiveTreeNav from '../components/archive/ArchiveTreeNav'
import ArchiveWelcome from '../components/archive/ArchiveWelcome'
import MiningSection from '../components/archive/MiningSection'
import ComponentsSection from '../components/archive/ComponentsSection'
import OrdnanceSection from '../components/archive/OrdnanceSection'
import FactionsSection from '../components/archive/FactionsSection'
import GeneralArchiveSection from '../components/archive/GeneralArchiveSection'

export type ArchiveSection = 'welcome' | 'mining' | 'components' | 'ordnance' | 'factions' | 'general'

interface ArchiveSearchParams {
  section?: ArchiveSection
}

const SECTION_TITLES: Record<ArchiveSection, string> = {
  welcome: 'Information Archive',
  mining: 'Mining Guide',
  components: 'Component Database',
  ordnance: 'Ordnance Reference',
  factions: 'Faction Reference',
  general: 'General Archive',
}

export default function ArchivePage() {
  const searchParams = useSearch({ strict: false }) as ArchiveSearchParams
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const currentSection: ArchiveSection = searchParams.section || 'welcome'

  const setSection = useCallback(
    (section: ArchiveSection) => {
      navigate({
        to: '/archive',
        search: section === 'welcome' ? {} : { section },
        replace: true,
      })
    },
    [navigate]
  )

  const sectionTitle = SECTION_TITLES[currentSection]

  const renderSection = () => {
    switch (currentSection) {
      case 'welcome':
        return <ArchiveWelcome onNavigate={setSection} />
      case 'mining':
        return <MiningSection />
      case 'components':
        return <ComponentsSection />
      case 'ordnance':
        return <OrdnanceSection />
      case 'factions':
        return <FactionsSection />
      case 'general':
        return <GeneralArchiveSection />
      default:
        return <ArchiveWelcome onNavigate={setSection} />
    }
  }

  return (
    <div className="site-shell py-6 flex flex-col min-h-[calc(100vh-8rem)]">
      {/* Page header */}
      <header className="mb-6">
        <h1 className="site-page-title">{sectionTitle}</h1>
        <p className="site-page-subtitle">Star Citizen Reference Data</p>
      </header>

      {/* Main layout: sidebar + content */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        {/* Sidebar toggle for mobile */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden fixed bottom-4 left-4 z-30 p-3 bg-orange-600 text-white rounded-full shadow-lg shadow-orange-500/25 hover:bg-orange-500 transition-colors"
          aria-label={sidebarOpen ? 'Hide navigation' : 'Show navigation'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {sidebarOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>

        {/* Tree navigation sidebar - fixed width column */}
        <aside
          className={`
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            fixed lg:static inset-y-0 left-0 z-20 lg:z-auto
            w-64 lg:w-auto
            bg-slate-900/98 lg:bg-transparent
            border-r border-slate-800/80 lg:border-0
            pt-20 lg:pt-0 pb-4 lg:pb-0
            transition-transform lg:transition-none
          `}
        >
          <ArchiveTreeNav currentSection={currentSection} onSelectSection={setSection} />
        </aside>

        {/* Backdrop for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-10 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Main content area - takes remaining space, fixed width from grid */}
        <main className="w-full min-w-0">
          <div className="w-full bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 sm:p-6 min-h-[500px]">
            <div className="w-full">
              {renderSection()}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
