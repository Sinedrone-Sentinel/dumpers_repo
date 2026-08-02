import React, { useCallback, useEffect } from 'react'
import { useSearch, useNavigate } from '@tanstack/react-router'
import { setAnalyticsSubTool } from '../lib/analytics'
import ArchiveWelcome from '../components/archive/ArchiveWelcome'
import ComponentsSection from '../components/archive/ComponentsSection'
import OrdnanceSection from '../components/archive/OrdnanceSection'
import FactionsSection from '../components/archive/FactionsSection'
import GeneralArchiveSection from '../components/archive/GeneralArchiveSection'
import ResourceLoreSection from '../components/archive/ResourceLoreSection'

export type ArchiveSection = 'welcome' | 'components' | 'ordnance' | 'factions' | 'lore' | 'general'

interface ArchiveSearchParams {
  section?: ArchiveSection
}

const SECTION_TITLES: Record<ArchiveSection, string> = {
  welcome: 'Information Archive',
  components: 'Component Database',
  ordnance: 'Ordnance Reference',
  factions: 'Faction Reference',
  lore: 'Resource Lore',
  general: 'General Archive',
}

export default function ArchivePage() {
  const searchParams = useSearch({ strict: false }) as ArchiveSearchParams
  const navigate = useNavigate()

  const currentSection: ArchiveSection = searchParams.section || 'welcome'

  useEffect(() => {
    setAnalyticsSubTool(currentSection)
  }, [currentSection])

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

  // Scroll to anchor after content renders
  useEffect(() => {
    const hash = window.location.hash
    if (hash) {
      // Small delay to ensure content has rendered
      const timer = setTimeout(() => {
        const element = document.querySelector(hash)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [currentSection])

  const sectionTitle = SECTION_TITLES[currentSection]

  const renderSection = () => {
    switch (currentSection) {
      case 'welcome':
        return <ArchiveWelcome onNavigate={setSection} />
      case 'components':
        return <ComponentsSection />
      case 'ordnance':
        return <OrdnanceSection />
      case 'factions':
        return <FactionsSection />
      case 'lore':
        return <ResourceLoreSection />
      case 'general':
        return <GeneralArchiveSection />
      default:
        return <ArchiveWelcome onNavigate={setSection} />
    }
  }

  return (
    <div className="site-shell py-6 min-h-[calc(100vh-8rem)]">
      {/* Page header */}
      <header className="mb-6">
        <h1 className="site-page-title">{sectionTitle}</h1>
        <p className="site-page-subtitle">Star Citizen guides, components &amp; lore</p>
        <p data-seo="tool-intro" className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">
          Star Citizen information archive — member how-tos, faction standings, ship component
          database, ordnance reference, and resource lore that pairs with Dumper&apos;s Repo
          blueprint, mining, and mission tools.
        </p>
      </header>

      {/* Content */}
      <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 sm:p-6 min-h-[500px]">
        {renderSection()}
      </div>
    </div>
  )
}
