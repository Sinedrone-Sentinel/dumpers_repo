import React, { useState } from 'react'
import type { ArchiveSection } from '../../routes/Archive.index'
import { MISSION_LOCATION_TAG_STYLES } from '../../lib/missionLocations'
import { PAGE_GUIDES } from '../../lib/archiveGuide/pageGuides'
import { ORDER_RULES_SECTION, ORDER_LIFECYCLE_SECTION, RATINGS_SECTION, PENDING_REP_SECTION } from '../../lib/archiveGuide/welcomeSections'

interface QuickLink {
  id: string
  label: string
  description: string
  section: ArchiveSection
}

interface ArchiveWelcomeProps {
  onNavigate?: (section: ArchiveSection) => void
}

const QUICK_LINKS: QuickLink[] = [
  {
    id: 'components',
    label: 'Component Database',
    description: 'Browse ship components by type, size, grade, and manufacturer. Click any component to see stats and similar upgrades.',
    section: 'components',
  },
  {
    id: 'ordnance',
    label: 'Ordnance Reference',
    description: 'Compare missiles and torpedoes by size, guidance type, and manufacturer.',
    section: 'ordnance',
  },
  {
    id: 'factions',
    label: 'Faction Reference',
    description: 'Understand reputation systems, standing tiers, and how they affect blueprint rewards.',
    section: 'factions',
  },
  {
    id: 'lore',
    label: 'Resource Lore',
    description: 'In-game flavor text and descriptions for Star Citizen commodities, items, and components.',
    section: 'lore',
  },
  {
    id: 'general',
    label: 'General Archive',
    description: 'External resources, quick tips, and data attribution.',
    section: 'general',
  },
]

function TagSample({
  label,
  className,
}: {
  label: string
  className: string
}) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border ${className}`}
    >
      {label}
    </span>
  )
}

function MissionTagLegend() {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/30 p-4 space-y-4">
      <div>
        <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-2">
          Location tags
        </h5>
        <p className="text-xs text-slate-500 mb-3">
          Missions show where to pull contracts. Hover is not required — everything is visible on the tags.
        </p>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-slate-400 mb-1.5">System-wide (available across the whole system)</p>
            <div className="flex flex-wrap gap-1.5">
              <TagSample label="Pyro" className={MISSION_LOCATION_TAG_STYLES.system} />
              <TagSample label="Stanton" className={MISSION_LOCATION_TAG_STYLES.system} />
              <TagSample label="Nyx" className={MISSION_LOCATION_TAG_STYLES.system} />
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1.5">Region-specific (pull contracts in that sub-area)</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <TagSample label="Pyro A" className={MISSION_LOCATION_TAG_STYLES.region} />
              <TagSample label="Monox" className={MISSION_LOCATION_TAG_STYLES.location} />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Violet = region letter · Green = planets/moons in that region
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-1.5">Another region example</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <TagSample label="Pyro B" className={MISSION_LOCATION_TAG_STYLES.region} />
              <TagSample label="Bloom" className={MISSION_LOCATION_TAG_STYLES.location} />
              <TagSample label="Ignis" className={MISSION_LOCATION_TAG_STYLES.location} />
            </div>
          </div>
        </div>
        <ul className="mt-3 space-y-1 text-[11px] text-slate-500">
          <li>• Pyro A = Monox · Pyro B = Bloom, Ignis · Pyro C = Fairo · Pyro D = Terminus, Vatra</li>
          <li>• Stanton system-wide missions (e.g. BHG Hathor PAF bounties) show only the Stanton tag</li>
        </ul>
      </div>

      <div className="pt-3 border-t border-slate-700/40">
        <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-2">
          Other mission tags
        </h5>
        <div className="flex flex-wrap items-center gap-1.5">
          <TagSample label="Cargo Recovery" className="bg-amber-950/50 text-amber-300 border-amber-500/40" />
          <TagSample label="Security · Jr. Security Contractor (5,000 rep)" className="bg-cyan-950/50 text-cyan-300 border-cyan-500/40" />
          <TagSample label="Standing · Neutral (0 rep)" className="bg-slate-800/60 text-slate-400 border-slate-600/40" />
          <TagSample label="Illegal" className="bg-red-950/50 text-red-400 border-red-500/40" />
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          Amber = contract category · Cyan = rep required (career path prefix when known) · Grey = neutral/no rep gate · Red = unlawful faction
        </p>
      </div>

      <div className="pt-3 border-t border-slate-700/40">
        <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-2">
          Blueprint unlock badge
        </h5>
        <TagSample
          label="Neutral (0 rep)"
          className="text-purple-300 border-purple-500/40 bg-purple-950/30"
        />
        <p className="text-[11px] text-slate-500 mt-2">
          Shown under each tracked blueprint — the lowest rep standing needed to start seeing that blueprint drop from missions.
        </p>
      </div>
    </div>
  )
}

const PAGE_GUIDE_ICONS: Record<string, React.ReactNode> = {
  blueprints: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  targets: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  'targets-live': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  resources: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  'mining-tracker': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
  ),
  orders: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  ),
  fulfillment: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
    </svg>
  ),
  'discord-webhooks': (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  notifications: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  support: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  components: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  ordnance: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  ),
  factions: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  lore: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  general: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  ),
}

/** Lightweight **bold** markers from welcomeSections → React nodes. */
function renderRich(text: string): React.ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="text-slate-300">
        {part}
      </strong>
    ) : (
      part
    ),
  )
}

export default function ArchiveWelcome({ onNavigate }: ArchiveWelcomeProps) {
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null)

  return (
    <div className="space-y-10">
      {/* Hero section */}
      <div className="text-center pb-6 border-b border-slate-800/60">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-600/20 border border-orange-500/30 mb-4">
          <svg className="w-8 h-8 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-white mb-2">Welcome to Dumper's Repo</h2>
        <p className="text-slate-400 max-w-xl mx-auto">
          A community-driven platform for Star Citizen crafting, resource tracking, and fair-value pricing.
        </p>
      </div>

      {/* What is Dumper's Repo */}
      <section id="about" className="space-y-4">
        <h3 className="text-lg font-semibold text-orange-400 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          What is Dumper's Repo?
        </h3>
        <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50 space-y-3">
          <p className="text-sm text-slate-300 leading-relaxed">
            <strong className="text-white">Dumper's Repo</strong> is a comprehensive toolkit for Star Citizen players 
            who want to engage with the game's crafting and economy systems without getting ripped off.
          </p>
          <p className="text-sm text-slate-400 leading-relaxed">
            Whether you're tracking which blueprints you've unlocked, managing your mined resources, 
            coordinating crafting orders with your org, or just trying to figure out what a fair price 
            is for that pile of Quantanium you just refined — Dumper's Repo has you covered.
          </p>
          <p className="text-sm text-slate-400 leading-relaxed">
            The site is designed to be a one-stop shop for crafters, miners, and traders who want 
            transparency and fairness in their in-game economic activities.
          </p>
        </div>
      </section>

      {/* Offline Mode */}
      <section id="offline-mode" className="space-y-4">
        <h3 className="text-lg font-semibold text-orange-400 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          Offline Mode
        </h3>
        <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50 space-y-4">
          <p className="text-sm text-slate-300 leading-relaxed">
            Want to try out the tools before signing up? <strong className="text-white">Offline Mode</strong> lets 
            you explore most features without creating an account.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="p-3 bg-slate-900/50 rounded-lg border border-green-500/20">
              <h4 className="text-sm font-medium text-green-400 mb-2">What Works Offline</h4>
              <ul className="text-xs text-slate-400 space-y-1">
                <li>• Browse all blueprints and archive data</li>
                <li>• Mark blueprints as acquired (local only)</li>
                <li>• Build your Mission Tracker list (local only)</li>
                <li>• Track resources in Resource Tracker (local only)</li>
                <li>• Use the Mining Tracker for RS references</li>
                <li>• Preview Fulfillment — see how many WTB/WTS orders are waiting (sign in to accept)</li>
              </ul>
            </div>
            
            <div className="p-3 bg-slate-900/50 rounded-lg border border-amber-500/20">
              <h4 className="text-sm font-medium text-amber-400 mb-2">Members-Only Features</h4>
              <ul className="text-xs text-slate-400 space-y-1">
                <li>• Custom Orders — post WTB buy requests and WTS sell listings (partial OK by default)</li>
                <li>• Fulfillment — browse, accept full or partial WTS buys, and complete trades</li>
                <li>• BP Dumper + Live Mission Tracker — sync log unlocks and watch active missions</li>
                <li>• Cross-device data sync</li>
              </ul>
            </div>
          </div>

          <div className="p-3 bg-blue-900/20 border border-blue-500/20 rounded-lg">
            <h4 className="text-sm font-medium text-blue-300 mb-1 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Data Migration
            </h4>
            <p className="text-xs text-slate-400">
              Offline progress is stored in your browser using the same IDs as member accounts. 
              Old offline data from before a recent update is cleared automatically when you visit. 
              On your <strong className="text-blue-300">first sign-in</strong> (when the welcome onboarding appears), 
              valid offline data migrates to your account — unmatched or outdated items are skipped, not forced in. 
              If you already have an account, your offline stash stays separate in the browser.
            </p>
          </div>

          <p className="text-xs text-slate-500">
            Offline data is stored in your browser. It persists across sessions but won't sync 
            between devices or browsers until you create an account.
          </p>
        </div>
      </section>

      {/* The DFP Story */}
      <section id="dfp" className="space-y-4">
        <h3 className="text-lg font-semibold text-orange-400 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Why Dumper's Fair-Value Price (DFP)?
        </h3>
        <div className="p-4 bg-gradient-to-br from-slate-800/60 to-slate-900/40 rounded-lg border border-orange-500/20 space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-red-500/20 text-red-400 shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-medium text-red-300">The Problem</h4>
              <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                "Grey market" trading sites are plagued with price gouging. People asking 5 billion aUEC 
                for items that take maybe an hour to acquire yourself. It's predatory, it's frustrating, 
                and CIG/RSI rightfully despises these practices.
              </p>
            </div>
          </div>
          
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-green-500/20 text-green-400 shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-medium text-green-300">The Solution</h4>
              <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                <strong className="text-white">Dumper's Fair-Value Price (DFP)</strong> is a pricing
                system that calculates what resources and crafted items are actually worth based on:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-slate-400">
                <li className="flex items-center gap-2">
                  <span className="text-orange-400">•</span>
                  Time investment required to acquire/craft
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-400">•</span>
                  Resource rarity and availability
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-400">•</span>
                  Quality tier (500-1000 scale, with exponential value curves)
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-orange-400">•</span>
                  Blueprint acquisition difficulty and reputation requirements
                </li>
              </ul>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400 shrink-0">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-medium text-blue-300">The Goal</h4>
              <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                Create a pricing standard the community can rally behind. When everyone uses DFP, 
                buyers know they're getting fair deals, sellers know they're being compensated fairly, 
                and the exploitative grey market loses its power.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Order lifecycle */}
      <section id="order-lifecycle" className="space-y-4">
        <h3 className="text-lg font-semibold text-orange-400 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          {ORDER_LIFECYCLE_SECTION.title}
        </h3>
        <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50 space-y-4">
          <p className="text-sm text-slate-400 leading-relaxed">{renderRich(ORDER_LIFECYCLE_SECTION.intro)}</p>
          <div className="space-y-3">
            {ORDER_LIFECYCLE_SECTION.steps.map((step) => (
              <div key={step.title} className="p-3 bg-blue-900/20 rounded-lg border border-blue-500/20">
                <h4 className="text-sm font-medium text-blue-300 mb-1">{step.title}</h4>
                <p className="text-xs text-slate-400 leading-relaxed">{renderRich(step.body)}</p>
              </div>
            ))}
          </div>
          <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
            <h4 className="text-sm font-medium text-white mb-2">Reminders</h4>
            <ul className="text-xs text-slate-400 space-y-1.5">
              {ORDER_LIFECYCLE_SECTION.reminders.map((item) => (
                <li key={item}>• {renderRich(item)}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Rating System */}
      <section id="ratings" className="space-y-4">
        <h3 className="text-lg font-semibold text-orange-400 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
          Buyer &amp; Fulfiller Ratings
        </h3>
        <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50 space-y-4">
          <p className="text-sm text-slate-400 leading-relaxed">
            Custom Orders and Fulfillment use one <strong className="text-white">reputation rating system</strong> for
            both <strong className="text-amber-300">WTB</strong> (want to buy) and{' '}
            <strong className="text-cyan-300">WTS</strong> (want to sell) listings. There is no separate sell rating —
            the same 1–5 star archive flow and buyer/fulfiller scores apply to both tags.
          </p>

          <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
            <h4 className="text-sm font-medium text-white mb-2">WTB vs WTS — who is the buyer?</h4>
            <ul className="text-xs text-slate-400 space-y-1.5">
              <li>
                • <strong className="text-amber-300">WTB</strong> — you post a buy request; someone fulfills it for you.
                You are the <strong className="text-slate-300">buyer</strong>; they are the seller/fulfiller.
              </li>
              <li>
                • <strong className="text-cyan-300">WTS</strong> — you post a sell listing; someone buys it on Fulfillment
                (full listing or partial lines). You are the <strong className="text-slate-300">seller</strong>; they are the buyer.
              </li>
              <li>
                • Partial WTS purchases are separate child orders — same rating flow as any other deal.
              </li>
              <li>
                • Ratings always land in the same two buckets: <strong className="text-slate-300">buyer rep</strong> and{' '}
                <strong className="text-slate-300">fulfiller rep</strong> (seller side), regardless of tag.
              </li>
            </ul>
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
              <h4 className="text-sm font-medium text-emerald-400 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                As a Buyer
              </h4>
              <ul className="text-xs text-slate-400 space-y-1">
                {RATINGS_SECTION.asBuyer.items.map((item) => (
                  <li key={item}>• {renderRich(item)}</li>
                ))}
              </ul>
            </div>
            
            <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
              <h4 className="text-sm font-medium text-purple-400 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                As a Seller / Fulfiller
              </h4>
              <ul className="text-xs text-slate-400 space-y-1">
                {RATINGS_SECTION.asSeller.items.map((item) => (
                  <li key={item}>• {renderRich(item)}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="p-3 bg-amber-900/20 border border-amber-500/20 rounded-lg">
            <p className="text-xs text-amber-300 flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                <strong>Note:</strong> Both buyers and fulfillers must have a verified RSI Handle to participate 
                in the order system. This ensures accountability and helps prevent scams.
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Pending Rep Limits */}
      <section id="pending-rep" className="space-y-4">
        <h3 className="text-lg font-semibold text-orange-400 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Building Your Reputation
        </h3>
        <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50 space-y-4">
          <p className="text-sm text-slate-400 leading-relaxed">
            New members start with <strong className="text-white">"Pending" reputation</strong> until they complete
            5 successful marketplace transactions (as buyer or seller/fulfiller, on either WTB or WTS). During this
            time, limits apply by <strong className="text-slate-300">role</strong>, not by tag:
          </p>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
              <h4 className="text-sm font-medium text-emerald-400 mb-2">Pending Buyer Limits</h4>
              <ul className="text-xs text-slate-400 space-y-1">
                <li>• Applies when you are the <strong className="text-slate-300">buyer</strong> — WTB posts and WTS purchases (including partial buys)</li>
                <li>• Maximum of 2 active buyer-side orders at a time</li>
                <li>• Total buyer-side value capped at 1,000,000 aUEC</li>
                <li>• Minimum 10,000 aUEC per <strong className="text-amber-300">WTB</strong> post while pending</li>
                <li>• Posting <strong className="text-cyan-300">WTS</strong> listings is not capped by the 2-order / 1M buyer limits</li>
                <li>• Limits lift after 5 completed transactions as a buyer</li>
              </ul>
            </div>
            
            <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
              <h4 className="text-sm font-medium text-purple-400 mb-2">Pending Seller / Fulfiller Limits</h4>
              <ul className="text-xs text-slate-400 space-y-1">
                <li>• Applies when you are the <strong className="text-slate-300">seller</strong> — WTB fulfillments and active WTS sales (each partial child order counts)</li>
                <li>• Can only have 1 active seller-side job at a time</li>
                <li>• Complete or release it before accepting another WTB or WTS handoff</li>
                <li>• Limits lift after 5 completed transactions as a seller/fulfiller</li>
              </ul>
            </div>
          </div>

          <div className="p-3 bg-blue-900/20 border border-blue-500/20 rounded-lg">
            <p className="text-xs text-blue-300 flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                <strong>Important:</strong> {renderRich(PENDING_REP_SECTION.important)}
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Order System Rules */}
      <section id="order-rules" className="space-y-4">
        <h3 className="text-lg font-semibold text-orange-400 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Order System Rules &amp; Expectations
        </h3>
        <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50 space-y-4">
          <p className="text-sm text-slate-400 leading-relaxed">
            The order system is built on <strong className="text-white">trust and fairness</strong>. To protect all members, 
            we enforce the following rules — especially for users still building their reputation.
          </p>

          <div className="space-y-3">
            <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
              <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                What's Expected
              </h4>
              <ul className="text-xs text-slate-400 space-y-1.5">
                {ORDER_RULES_SECTION.expected.items.map((item) => (
                  <li key={item}>• {renderRich(item)}</li>
                ))}
              </ul>
            </div>

            <div className="p-3 bg-slate-900/50 rounded-lg border border-red-500/20">
              <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                <span className="text-red-400">✗</span>
                What's Not Allowed
              </h4>
              <ul className="text-xs text-slate-400 space-y-1.5">
                <li>• Duplicate <strong className="text-amber-300">WTB</strong> posts for the same blueprint while one is active</li>
                <li>• Making artificially small <strong className="text-amber-300">WTB</strong> orders to farm reputation quickly</li>
                <li>• Repeatedly trading with the same person to inflate ratings (WTB or WTS)</li>
                <li>• Using multiple accounts to manipulate the marketplace</li>
                <li>• Abandoning accepted jobs without good reason</li>
                <li>• Refusing to rate completed WTB or WTS transactions</li>
              </ul>
            </div>

            <div className="p-3 bg-slate-900/50 rounded-lg border border-amber-500/20">
              <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                <span className="text-amber-400">⚠</span>
                Pending Rep Requirements
              </h4>
              <ul className="text-xs text-slate-400 space-y-1.5">
                <li>• <strong className="text-slate-300">Minimum WTB value:</strong> 10,000 aUEC per buy post while reputation is pending</li>
                <li>• <strong className="text-slate-300">No duplicate WTB:</strong> Cannot post another buy request for the same blueprint if one is pending or in progress</li>
                <li>• <strong className="text-slate-300">Buyer limits:</strong> Max 2 active buyer-side orders / 1M aUEC (WTB posts + WTS purchases, including partial buys)</li>
                <li>• <strong className="text-slate-300">Seller limits:</strong> Max 1 active seller-side job (WTB fulfillment or WTS sale in progress; each partial sale counts)</li>
              </ul>
            </div>

            <div className="p-3 bg-slate-900/50 rounded-lg border border-blue-500/20">
              <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                <span className="text-blue-400">⏱</span>
                Time Limits
              </h4>
              <ul className="text-xs text-slate-400 space-y-1.5">
                <li>• <strong className="text-slate-300">Seller deadline:</strong> 72 hours to mark ready after accept (WTB craft or WTS handoff), or the deal releases back to the pool</li>
                <li>• <strong className="text-slate-300">Partial WTS cancel:</strong> Cancelling a partial purchase restores quantities to the seller&apos;s listing</li>
                <li>• <strong className="text-slate-300">Buyer pickup:</strong> 72 hours to confirm after ready, or auto-complete (buyer may receive a strike)</li>
                <li>• <strong className="text-slate-300">Rating deadline:</strong> 24 hours after the other party rates, or a 5-star rating is auto-applied on your behalf</li>
                <li>• <strong className="text-slate-300">3 strikes in 30 days</strong> may lead to account restrictions</li>
              </ul>
            </div>
          </div>

          <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
            <h4 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Consequences for Violations
            </h4>
            <ul className="text-xs text-slate-400 space-y-1.5">
              <li>• <strong className="text-slate-300">Reputation reset:</strong> All ratings cleared, returning you to "Pending" status with limits</li>
              <li>• <strong className="text-slate-300">Order history cleared:</strong> Archived orders may be removed along with your reputation</li>
              <li>• <strong className="text-slate-300">Account ban:</strong> Severe or repeated violations may result in permanent removal from the platform</li>
            </ul>
            <p className="text-xs text-red-300/80 mt-2">
              {ORDER_RULES_SECTION.consequences.note}
            </p>
          </div>
        </div>
      </section>

      {/* Best Ordering Practices */}
      <section id="ordering-tips" className="space-y-4">
        <h3 className="text-lg font-semibold text-orange-400 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
          Best Ordering Practices
        </h3>
        <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50 space-y-4">
          <p className="text-sm text-slate-400 leading-relaxed">
            These tips focus on <strong className="text-amber-300">WTB</strong> buy requests (Submit Buy Order). See the
            Custom Orders page guide for WTS partial listings and the order builder.
          </p>
          <p className="text-sm text-slate-400 leading-relaxed">
            For <strong className="text-cyan-300">WTS</strong> sell listings: post only stock you have on hand; partial
            purchase is the default so buyers can cherry-pick lines. Check “Buyers must purchase the full listing” only
            when you need an all-or-nothing sale. Mark ready promptly once a buyer accepts (full or partial).
          </p>
          <p className="text-sm text-slate-400 leading-relaxed">
            For WTB posts, follow these tips to get fulfilled faster and make it easier for sellers to help you.
          </p>

          <div className="space-y-3">
            <div className="p-3 bg-slate-900/50 rounded-lg border border-emerald-500/20">
              <h4 className="text-sm font-medium text-emerald-400 mb-2 flex items-center gap-2">
                <span>✓</span> Use Live Stat Preview
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Expand cart lines in the order builder to set per-slot material qualities. The live DFP total and
                effective stat preview update as you go — match what you actually have or expect to craft with.
              </p>
            </div>

            <div className="p-3 bg-slate-900/50 rounded-lg border border-emerald-500/20">
              <h4 className="text-sm font-medium text-emerald-400 mb-2 flex items-center gap-2">
                <span>✓</span> Separate Easy from Hard
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Create <strong className="text-slate-300">separate orders</strong> for easy items (Q500–Q700) and harder items (Q800–Q1000). 
                Mixing them forces fulfillers to either source rare high-quality materials for everything or skip your order entirely.
                Split them up and get your easy items faster.
              </p>
            </div>

            <div className="p-3 bg-slate-900/50 rounded-lg border border-emerald-500/20">
              <h4 className="text-sm font-medium text-emerald-400 mb-2 flex items-center gap-2">
                <span>✓</span> Check Blueprint Ownership
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Each blueprint card shows how many members own it. If <strong className="text-amber-400">no one owns a blueprint</strong>, 
                your order may sit unfulfilled until someone acquires it. Consider ordering common blueprints separately 
                from rare ones so your easier items don&apos;t get blocked.
              </p>
            </div>

            <div className="p-3 bg-slate-900/50 rounded-lg border border-emerald-500/20">
              <h4 className="text-sm font-medium text-emerald-400 mb-2 flex items-center gap-2">
                <span>✓</span> One Hard Item Per Order
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                For Q800+ or rare blueprints, consider <strong className="text-slate-300">one item per order</strong>. 
                This lets specialized fulfillers pick up what they can craft well, rather than needing someone who 
                happens to have all your specific blueprints and high-quality materials.
              </p>
            </div>

            <div className="p-3 bg-slate-900/50 rounded-lg border border-amber-500/20">
              <h4 className="text-sm font-medium text-amber-400 mb-2 flex items-center gap-2">
                <span>⚠</span> Avoid Mixed-Ownership Orders
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                If your order includes blueprints that some members own and others that <strong className="text-slate-300">no one owns yet</strong>, 
                the entire order is unfulfillable. A fulfiller must own <em>every</em> blueprint in an order to accept it. 
                You&apos;ll see a warning when creating such orders.
              </p>
            </div>
          </div>

          <div className="p-3 bg-blue-900/20 border border-blue-500/20 rounded-lg">
            <p className="text-xs text-blue-300 flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                <strong>Tip:</strong> Smaller, focused orders tend to get picked up faster than large mixed orders. 
                Fulfillers can quickly see if they can help and jump in immediately.
              </span>
            </p>
          </div>
        </div>
      </section>

      {/* Protecting Yourself */}
      <section id="trade-protection" className="space-y-4">
        <h3 className="text-lg font-semibold text-orange-400 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Protecting Yourself in Trades
        </h3>
        <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50 space-y-3">
          <p className="text-sm text-slate-400 leading-relaxed">
            In-game trades happen outside the site. Keep your own records so disputes can be resolved fairly.
          </p>
          <ul className="text-xs text-slate-400 space-y-1.5">
            <li>• Screenshot aUEC transfers before and after handoff</li>
            <li>• Record video of the exchange when possible</li>
            <li>• Note the other party&apos;s RSI Handle, location, and time</li>
            <li>• Keep Spectrum or in-game chat logs</li>
            <li>• If a fulfiller marked ready but you didn&apos;t receive goods, use <strong className="text-slate-300">Report Problem</strong> on the order — do not wait for the 72-hour auto-complete</li>
          </ul>
          <p className="text-xs text-slate-500">
            Evidence is <strong className="text-slate-400">not uploaded on the site</strong>. If support needs proof
            during a dispute, they may ask you to email screenshots or share a cloud storage link (Google Drive, Imgur, etc.).
          </p>
        </div>
      </section>

      {/* How to Use - Page Guide */}
      <section id="page-guides" className="space-y-4">
        <h3 className="text-lg font-semibold text-orange-400 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          How to Use Each Page
        </h3>
        <p className="text-sm text-slate-400">
          Click any section below to learn more about what it does and how it connects to other features.
        </p>
        <div className="space-y-2">
          {PAGE_GUIDES.map((guide) => (
            <div
              key={guide.id}
              className="rounded-lg border border-slate-700/50 overflow-hidden"
            >
              <button
                onClick={() => setExpandedGuide(expandedGuide === guide.id ? null : guide.id)}
                className="w-full flex items-center gap-3 p-3 bg-slate-800/40 hover:bg-slate-800/60 transition-colors text-left"
              >
                <div className="p-2 rounded-lg bg-slate-700/50 text-orange-400 shrink-0">
                  {PAGE_GUIDE_ICONS[guide.id]}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-slate-200">{guide.title}</h4>
                  <p className="text-xs text-slate-500 truncate">{guide.description}</p>
                </div>
                <svg 
                  className={`w-4 h-4 text-slate-400 transition-transform ${expandedGuide === guide.id ? 'rotate-180' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {expandedGuide === guide.id && (
                <div className="p-4 bg-slate-900/40 border-t border-slate-700/50 space-y-3">
                  <ul className="space-y-2">
                    {guide.details.map((detail, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                        <span className="text-orange-400 mt-0.5">•</span>
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                  {guide.id === 'targets' && <MissionTagLegend />}
                  {guide.relatesTo.length > 0 && (
                    <div className="pt-2 border-t border-slate-700/30">
                      <p className="text-xs text-slate-500">
                        <span className="text-slate-400">Related to:</span>{' '}
                        {guide.relatesTo.join(' • ')}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Quick links grid */}
      <section>
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4">
          Archive Sections
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {QUICK_LINKS.map((link) => (
            <QuickLinkCard key={link.id} {...link} onNavigate={onNavigate} />
          ))}
        </div>
      </section>

      {/* Organizations */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          Organizations
        </h3>
        <p className="text-sm text-slate-400">
          Looking for an org to join? Check out the RSI Organization Hub to find a community that fits your playstyle.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <a
            href="https://robertsspaceindustries.com/en/community/orgs"
            target="_blank"
            rel="noopener noreferrer"
            className="group text-left p-4 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:border-orange-500/30 hover:bg-slate-800/60 transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-slate-700/50 text-orange-400 shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h4 className="text-sm font-medium text-slate-200 group-hover:text-orange-300 transition-colors">
                RSI Organization Hub
              </h4>
            </div>
            <p className="text-xs text-slate-500 line-clamp-2">
              Browse all Star Citizen organizations on the official RSI site. Find orgs by archetype, commitment level, and language.
            </p>
            <span className="inline-flex items-center gap-1 mt-2 text-xs text-orange-400/70 group-hover:text-orange-400 transition-colors">
              Visit RSI
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </span>
          </a>

          <a
            href="https://robertsspaceindustries.com/en/orgs/BSTR"
            target="_blank"
            rel="noopener noreferrer"
            className="group text-left p-4 rounded-lg bg-gradient-to-br from-slate-800/60 to-orange-900/20 border border-orange-500/30 hover:border-orange-500/50 hover:from-slate-800/80 hover:to-orange-900/30 transition-all"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-orange-500/20 text-orange-400 shrink-0">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-medium text-slate-200 group-hover:text-orange-300 transition-colors">
                  Black Star [BSTR]
                </h4>
                <span className="text-[10px] text-orange-400/80 uppercase tracking-wide">Site Sponsor</span>
              </div>
            </div>
            <p className="text-xs text-slate-500 line-clamp-2">
              The industrial and defense enterprise sponsoring Dumper's Repo. Focused on extraction, production, and trade across the verse.
            </p>
            <span className="inline-flex items-center gap-1 mt-2 text-xs text-orange-400/70 group-hover:text-orange-400 transition-colors">
              View Org
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </span>
          </a>
        </div>
      </section>
    </div>
  )
}

interface QuickLinkCardProps {
  label: string
  description: string
  section: ArchiveSection
  onNavigate?: (section: ArchiveSection) => void
}

function QuickLinkCard({ label, description, section, onNavigate }: QuickLinkCardProps) {
  const handleClick = () => {
    if (onNavigate) {
      onNavigate(section)
    }
  }

  return (
    <button
      onClick={handleClick}
      className="group text-left p-4 rounded-lg bg-slate-800/40 border border-slate-700/50 hover:border-orange-500/30 hover:bg-slate-800/60 transition-all"
    >
      <h4 className="text-sm font-medium text-slate-200 group-hover:text-orange-300 transition-colors">
        {label}
      </h4>
      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{description}</p>
      <span className="inline-flex items-center gap-1 mt-2 text-xs text-orange-400/70 group-hover:text-orange-400 transition-colors">
        Browse
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </span>
    </button>
  )
}
