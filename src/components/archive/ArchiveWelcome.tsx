import React, { useState } from 'react'
import type { ArchiveSection } from '../../routes/Archive.index'

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
    id: 'mining',
    label: 'Mining Guide',
    description: 'Find ore locations by rarity tier, discover which moons and asteroids yield the best resources.',
    section: 'mining',
  },
  {
    id: 'components',
    label: 'Component Database',
    description: 'Browse ship components by type, size, grade, and manufacturer. Click any component to see shop prices and similar upgrades.',
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
    id: 'general',
    label: 'General Archive',
    description: 'External resources, quick tips, and data attribution.',
    section: 'general',
  },
]

const PAGE_GUIDES = [
  {
    id: 'blueprints',
    title: 'Blueprints',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    description: 'The main hub for browsing all available crafting blueprints in Star Citizen.',
    details: [
      'Browse and filter blueprints by type, manufacturer, and availability',
      'See what reputation level is required to unlock each blueprint',
      'Mark blueprints as "acquired" to track your collection progress',
      'View the resources and components required to craft each item',
      'Click any blueprint to see detailed crafting requirements and DFP values',
      'Offline Mode: acquired marks save locally until you sign in',
    ],
    relatesTo: ['Mission Tracker', 'Resource Tracker'],
  },
  {
    id: 'targets',
    title: 'Mission Tracker',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    description: 'Your personal wishlist of blueprints you\'re working towards unlocking.',
    details: [
      'Track blueprints from the main Blueprints page',
      'See which faction contracts will reward your tracked blueprints',
      'Track your progress toward the required reputation levels',
      'Prioritize which factions to grind based on your goals',
      'Remove blueprints once you\'ve acquired them',
      'Offline Mode: list saves locally until you sign in (then migrates automatically)',
    ],
    relatesTo: ['Blueprints', 'Factions'],
  },
  {
    id: 'resources',
    title: 'Resource Tracker',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    description: 'Track your personal inventory of mined and refined resources.',
    details: [
      'Log quantities and quality levels of resources you\'ve collected',
      'Quality ranges from 500 (base) to 1000 (perfect) — higher quality = exponentially higher value',
      'DFP automatically calculates fair market values for your resources',
      'See your total inventory value at a glance',
      'Perfect for tracking what you have available for crafting or trading',
      'Offline Mode: inventory saves locally until you sign in (then migrates automatically)',
    ],
    relatesTo: ['Blueprints', 'Mining Guide', 'Mining Tracker'],
  },
  {
    id: 'mining-tracker',
    title: 'Mining Tracker',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
    description: 'In-game cluster RS reference for ores you are hunting.',
    details: [
      'Add ores from the Mining Guide or search by name on the tracker page',
      'Choose how many RS multiples to display (2–10×, defaults to 3×)',
      'Compare scanner readings in-game: cluster RS = node count × base RS',
      'Search by ore name to quickly add to your list (minimum 2 characters)',
      'Logged-in users sync to their account; Offline Mode saves locally',
    ],
    relatesTo: ['Mining Guide', 'Resource Tracker'],
  },
  {
    id: 'shops',
    title: 'Shops',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    description: 'Browse in-game shop inventories and prices across the Stanton system.',
    details: [
      'Filter by system, location, and shop to browse inventories',
      'See effective prices including shop margins and offsets',
      'Find where specific components are sold — or discover items are loot-only',
      'View buy/sell/rent transaction types for each item',
      'Accessible in Offline Mode — reference data only, no account required',
      'Click component names in the Archive to jump directly to their shop listings',
    ],
    relatesTo: ['Components', 'Mining Guide'],
  },
  {
    id: 'orders',
    title: 'Custom Orders',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    description: 'Create and manage custom crafting orders for players.',
    details: [
      'Specify exactly what resources and quantities you need',
      'Set quality requirements for each resource',
      'DFP automatically calculates fair pricing for the order',
      'Track order status from creation to fulfillment',
      'Rate fulfillers when orders are completed (affects their reputation)',
      'Requires a verified RSI Handle to create orders',
      'New members: limited to 2 orders / 1M aUEC until 5 completed orders',
      '72 hours to confirm pickup after fulfiller marks ready; use Report Problem if goods were not delivered',
    ],
    relatesTo: ['Resource Tracker', 'Fulfillment'],
  },
  {
    id: 'fulfillment',
    title: 'Fulfillment',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </svg>
    ),
    description: 'View and fulfill pending custom orders from other players.',
    details: [
      'Browse orders that need resources you can provide',
      'Claim orders to indicate you\'re working on them',
      'Mark partial or complete fulfillment as you deliver',
      'Earn aUEC at fair DFP rates for your contributions',
      'Build your fulfiller reputation through ratings from buyers',
      'Requires a verified RSI Handle to fulfill orders',
      'New members: can only work on 1 order at a time until 5 completed',
      '72 hours to mark ready after accepting or the order releases back to the pool',
      'Verify you have materials before accepting 800+ quality blueprint orders',
    ],
    relatesTo: ['Custom Orders', 'Resource Tracker'],
  },
  {
    id: 'settings',
    title: 'Settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    description: 'Manage your profile, privacy, and account from your avatar menu.',
    details: [
      'Set or update your RSI Handle for verification and orders',
      'Enable Ghost Mode to hide from member lists while keeping personal blueprint and resource tracking',
      'Ghost Mode keeps blueprints, Mission Tracker, Resource Tracker, and the Archive — orders and fulfillment stay hidden',
      'Turn Ghost Mode off anytime from Privacy settings',
    ],
    relatesTo: ['Blueprints', 'Mission Tracker', 'Resource Tracker'],
  },
  {
    id: 'support',
    title: 'Support',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    description: 'Report issues or get help from site staff.',
    details: [
      'Access Support from your user menu (click your avatar)',
      'Report bugs or technical issues with the site',
      'Report inappropriate behavior from other members',
      'Get help with RSI Handle verification issues',
      'View the status of your open tickets and respond to staff questions',
      'All ticket data is deleted after resolution for your privacy',
    ],
    relatesTo: ['Settings', 'Blueprints'],
  },
]

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
      <section className="space-y-4">
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
      <section className="space-y-4">
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
                <li>• Preview pending fulfillment orders</li>
              </ul>
            </div>
            
            <div className="p-3 bg-slate-900/50 rounded-lg border border-amber-500/20">
              <h4 className="text-sm font-medium text-amber-400 mb-2">Members-Only Features</h4>
              <ul className="text-xs text-slate-400 space-y-1">
                <li>• Create custom crafting orders</li>
                <li>• Accept and fulfill orders for aUEC</li>
                <li>• View member directory / browse collections</li>
                <li>• Site Total resource aggregation</li>
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
              When you decide to sign in, <strong className="text-blue-300">all your offline data migrates automatically</strong>. 
              Your acquired blueprints, tracked missions, resource inventory, and mission checklist preferences 
              transfer to your account — nothing is lost.
            </p>
          </div>

          <p className="text-xs text-slate-500">
            Offline data is stored in your browser. It persists across sessions but won't sync 
            between devices or browsers until you create an account.
          </p>
        </div>
      </section>

      {/* The DFP Story */}
      <section className="space-y-4">
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
                <strong className="text-white">Dumper's Fair-Value Price (DFP)</strong> is an algorithmic pricing 
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

      {/* Rating System */}
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-orange-400 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
          Buyer &amp; Fulfiller Ratings
        </h3>
        <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50 space-y-4">
          <p className="text-sm text-slate-400 leading-relaxed">
            The Custom Orders and Fulfillment system includes a <strong className="text-white">reputation rating system</strong> to 
            help build trust between buyers and fulfillers.
          </p>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
              <h4 className="text-sm font-medium text-emerald-400 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
                As a Buyer
              </h4>
              <ul className="text-xs text-slate-400 space-y-1">
                <li>• Create orders specifying what you need</li>
                <li>• Rate fulfillers after delivery (1-5 stars)</li>
                <li>• Your ratings help others choose reliable fulfillers</li>
              </ul>
            </div>
            
            <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
              <h4 className="text-sm font-medium text-purple-400 mb-2 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
                As a Fulfiller
              </h4>
              <ul className="text-xs text-slate-400 space-y-1">
                <li>• Claim and complete orders to build reputation</li>
                <li>• Your average rating is visible to buyers</li>
                <li>• Higher ratings = more trust from the community</li>
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
      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-orange-400 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Building Your Reputation
        </h3>
        <div className="p-4 bg-slate-800/40 rounded-lg border border-slate-700/50 space-y-4">
          <p className="text-sm text-slate-400 leading-relaxed">
            New members start with <strong className="text-white">"Pending" reputation</strong> until they complete 
            5 successful orders (as either buyer or fulfiller). During this time, there are some limits to help 
            protect the community:
          </p>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
              <h4 className="text-sm font-medium text-emerald-400 mb-2">Pending Buyer Limits</h4>
              <ul className="text-xs text-slate-400 space-y-1">
                <li>• Maximum of 2 active orders at a time</li>
                <li>• Total order value capped at 1,000,000 aUEC</li>
                <li>• Limits are lifted after 5 completed orders</li>
              </ul>
            </div>
            
            <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
              <h4 className="text-sm font-medium text-purple-400 mb-2">Pending Fulfiller Limits</h4>
              <ul className="text-xs text-slate-400 space-y-1">
                <li>• Can only accept 1 order at a time</li>
                <li>• Complete it before accepting another</li>
                <li>• Limits are lifted after 5 completed fulfillments</li>
              </ul>
            </div>
          </div>

          <div className="p-3 bg-blue-900/20 border border-blue-500/20 rounded-lg">
            <p className="text-xs text-blue-300 flex items-start gap-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>
                <strong>Important:</strong> Everyone must rate their completed orders before creating or 
                accepting new ones. This keeps the rating system fair and encourages timely feedback.
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
                <li>• Create orders for items/resources you genuinely need</li>
                <li>• Complete transactions in good faith</li>
                <li>• Rate orders promptly after completion</li>
                <li>• Communicate clearly with your buyer/fulfiller</li>
                <li>• Use your verified RSI Handle for all in-game trades</li>
              </ul>
            </div>

            <div className="p-3 bg-slate-900/50 rounded-lg border border-red-500/20">
              <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                <span className="text-red-400">✗</span>
                What's Not Allowed
              </h4>
              <ul className="text-xs text-slate-400 space-y-1.5">
                <li>• Creating duplicate orders for the same item while one is being fulfilled</li>
                <li>• Making artificially small orders to farm reputation quickly</li>
                <li>• Repeatedly trading with the same person to inflate ratings</li>
                <li>• Using multiple accounts to manipulate the order system</li>
                <li>• Cancelling orders without good reason to waste fulfillers' time</li>
                <li>• Refusing to rate completed orders</li>
              </ul>
            </div>

            <div className="p-3 bg-slate-900/50 rounded-lg border border-amber-500/20">
              <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                <span className="text-amber-400">⚠</span>
                Pending Rep Requirements
              </h4>
              <ul className="text-xs text-slate-400 space-y-1.5">
                <li>• <strong className="text-slate-300">Minimum order value:</strong> 10,000 aUEC per order</li>
                <li>• <strong className="text-slate-300">No duplicate orders:</strong> Cannot create another order for the same blueprint if one is pending or being fulfilled</li>
                <li>• <strong className="text-slate-300">Order limits:</strong> Max 2 active orders / 1M aUEC total as buyer, 1 order at a time as fulfiller</li>
              </ul>
            </div>

            <div className="p-3 bg-slate-900/50 rounded-lg border border-blue-500/20">
              <h4 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                <span className="text-blue-400">⏱</span>
                Time Limits
              </h4>
              <ul className="text-xs text-slate-400 space-y-1.5">
                <li>• <strong className="text-slate-300">Fulfiller deadline:</strong> 72 hours to mark an accepted order ready, or it releases back to the pool</li>
                <li>• <strong className="text-slate-300">Buyer pickup:</strong> 72 hours to confirm pickup after ready, or the order auto-completes (buyer may receive a strike)</li>
                <li>• <strong className="text-slate-300">Rating deadline:</strong> 24 hours after the other party rates, or a 5-star rating is auto-applied on your behalf</li>
                <li>• <strong className="text-slate-300">3 strikes in 30 days</strong> triggers an automatic report to officers</li>
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
              Suspicious activity is automatically detected and reported to site staff for review.
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
            Evidence is <strong className="text-slate-400">not uploaded on the site</strong>. If officers need proof,
            they may ask you to email screenshots or share a cloud storage link (Google Drive, Imgur, etc.).
          </p>
        </div>
      </section>

      {/* How to Use - Page Guide */}
      <section className="space-y-4">
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
                  {guide.icon}
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

      {/* Data source info */}
      <section className="p-4 bg-slate-800/30 rounded-lg border border-slate-700/50">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="text-sm font-medium text-slate-300">Data Sources</h4>
            <p className="text-xs text-slate-500 mt-1">
              Information is sourced from MrKraken's StarStrings community data, the Star Citizen Wiki API,
              and scunpacked game files. Data is synchronized periodically to stay current with game updates.
            </p>
          </div>
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
