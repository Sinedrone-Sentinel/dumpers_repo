import React from 'react'
import type { DepositType, LocationSpawnProfile } from './miningClusterProfiles'
import {
  depositTypeLabel,
  depositTypeUpper,
  getDepositTypes,
  getGuideLocationProfiles,
  getLocationProfile,
  getLocationProfilesForOre,
  getOverallProfile,
  getOverallSpawnTag,
  getTrackerProfile,
  getTrackerProfileMissingMessage,
  getTrackerSubtitle,
  isLocationTrackerEntry,
} from './miningClusterProfiles'
import type { MiningTrackerEntry } from './localGuestCache'
import {
  isBroadGuideLocation,
  formatOverallBestAtTooltip,
  formatOverallCompendiumDetail,
} from './miningLocationAliases'
import { formatRsReading } from './miningSignatures'
import {
  hasShipRsSignature,
  isHandMineableOre,
  rsTrackerUnmappedDetail,
} from './handMineables'
import { formatHandMineableHabitatAtSite } from './handMineableHabitats'
import {
  formatHudResistancePercent,
  formatMineableInstability,
  getMineableElementStats,
} from './mineableElementStats'
function pct(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(digits)}%`
}

function compositionSummary(parts: LocationSpawnProfile['compositionParts'] | undefined): string {
  if (!parts?.length) return 'Composition data unavailable'
  return parts
    .slice(0, 3)
    .map((p) => `${p.elementName} ${p.minPercentage}–${p.maxPercentage}%`)
    .join(', ')
}

function clusterPreview(rows: Array<{ nodes: number; chancePercent: number }> | undefined): string {
  if (!rows?.length) return 'Solo only'
  return rows.map((r) => `${pct(r.chancePercent, 0)} (${r.nodes}×)`).join(' / ')
}

function handMineableHabitatLine(oreName: string, locationName?: string): React.ReactNode | null {
  if (!locationName) return null
  const label = formatHandMineableHabitatAtSite(oreName, locationName)
  if (!label) return null
  return <div className="text-slate-400">{label}</div>
}

export function oreMineableStatsTooltipBlock(oreName: string): React.ReactNode | null {
  const stats = getMineableElementStats(oreName)
  if (!stats) return null
  return (
    <div className="text-slate-400">
      Instability {formatMineableInstability(stats.instability)} · Resistance{' '}
      {formatHudResistancePercent(stats.resistance)}
    </div>
  )
}

export function trackerCardTooltip(entry: MiningTrackerEntry): React.ReactNode {
  const display = getTrackerProfile(entry)
  const locProfiles = getLocationProfilesForOre(entry.oreName).filter(
    (l) => l.depositType === entry.depositType
  )
  const refProfile =
    entry.profileMode === 'location' && entry.locationName
      ? getLocationProfile(entry.oreName, entry.locationName, entry.depositType)
      : locProfiles.sort((a, b) => b.effectiveSpawnPercent - a.effectiveSpawnPercent)[0]

  const missingMessage = getTrackerProfileMissingMessage(entry)

  return (
    <div className="space-y-2">
      <div className="font-semibold text-orange-300">
        {entry.oreName} · {depositTypeUpper(entry.depositType)}
      </div>
      {isLocationTrackerEntry(entry) && entry.locationName ? (
        <div className="text-orange-200/90">Cluster profile for {entry.locationName}</div>
      ) : null}
      <div className="text-slate-400">{getTrackerSubtitle(entry)}</div>
      {missingMessage ? <div className="text-amber-400/90">{missingMessage}</div> : null}
      {refProfile && (
        <>
          <div>
            Spawn ~{pct(refProfile.effectiveSpawnPercent)} · max {refProfile.maxNodes}× cluster
          </div>
          <div className="text-slate-400">
            Pool {refProfile.relativeSpawnWeight} · group {pct(refProfile.groupSpawnPercent, 1)}
          </div>
          <div>Cluster: {clusterPreview(refProfile.clusterRows)}</div>
          <div className="text-slate-400">Composition: {compositionSummary(refProfile.compositionParts)}</div>
        </>
      )}
      {!isLocationTrackerEntry(entry) && (() => {
        const overall = getOverallProfile(entry.oreName, entry.depositType)
        const bestAtNote = formatOverallCompendiumDetail(overall?.bestLocation)
        return bestAtNote ? (
          <div className="text-slate-400">{bestAtNote}</div>
        ) : null
      })()}
      {display && (
        <div className="text-slate-400 pt-1 border-t border-slate-700/50">
          Base RS {formatRsReading(display.baseRs)}
        </div>
      )}
      {oreMineableStatsTooltipBlock(entry.oreName)}
    </div>
  )
}

export function trackerChanceTooltip(
  entry: MiningTrackerEntry,
  nodes: number,
  rs: number,
  chancePercent: number
): React.ReactNode {
  return (
    <div className="space-y-1">
      <div className="font-semibold text-orange-300">
        {nodes}× cluster · RS {formatRsReading(rs)}
      </div>
      <div>{pct(chancePercent)} of clustered deposits</div>
      {chancePercent >= 20 && nodes === 2 && (
        <div className="text-slate-400 text-[11px]">
          Remaining solo rocks have no chance row — compare base RS only.
        </div>
      )}
    </div>
  )
}

export function guideOreTitleTooltip(oreName: string): React.ReactNode {
  const types = getDepositTypes(oreName)
  const surfaceCount = getLocationProfilesForOre(oreName).filter((l) => l.depositType === 'surface').length
  const asteroidCount = getLocationProfilesForOre(oreName).filter((l) => l.depositType === 'asteroid').length
  const handMineable = isHandMineableOre(oreName)

  return (
    <div className="space-y-1">
      <div className="font-semibold text-orange-300">{oreName}</div>
      {handMineable ? (
        <div className="text-slate-400">Hand-mineable — cave vs surface availability varies by planet</div>
      ) : (
        <>
          <div>
            Deposit types: {types.map(depositTypeLabel).join(' · ') || 'Unknown'}
          </div>
          <div className="text-slate-400">
            {surfaceCount} surface · {asteroidCount} asteroid mapped locations
          </div>
        </>
      )}
      {oreMineableStatsTooltipBlock(oreName)}
      {!handMineable && (
        <div className="text-slate-400 text-[11px]">Use Track Surface / Track Asteroid for RS Tracker cards.</div>
      )}
    </div>
  )
}

export function guideLocationChipTooltip(
  oreName: string,
  guideLocationName: string,
  depositType: DepositType
): React.ReactNode {
  if (isHandMineableOre(oreName) || !hasShipRsSignature(oreName)) {
    return (
      <div className="space-y-1">
        <div className="font-semibold text-orange-300">{oreName}</div>
        <div className="text-slate-400">{guideLocationName}</div>
        <div className="text-slate-400">{rsTrackerUnmappedDetail(oreName)}</div>
        {handMineableHabitatLine(oreName, guideLocationName)}
        {oreMineableStatsTooltipBlock(oreName)}
      </div>
    )
  }

  if (isBroadGuideLocation(guideLocationName)) {
    const overall = getOverallProfile(oreName, depositType)
    if (!overall) {
      return (
        <div className="space-y-1">
          <div className="font-semibold">{guideLocationName}</div>
          <div className="text-slate-400">Broad compendium entry — uses overall spawn profile.</div>
          {oreMineableStatsTooltipBlock(oreName)}
        </div>
      )
    }
    return (
      <div className="space-y-1">
        <div className="font-semibold text-orange-300">Overall · {depositTypeLabel(depositType)}</div>
        <div className="text-slate-400">{guideLocationName}</div>
        {formatOverallBestAtTooltip(overall.bestLocation, overall.bestLocationDisplayName) && (
          <div className="text-slate-400">
            {formatOverallBestAtTooltip(overall.bestLocation, overall.bestLocationDisplayName)}
          </div>
        )}
        <div>Cluster: {clusterPreview(overall.clusterRows)}</div>
        <div className="text-slate-400 text-[11px]">
          Same data as Track Surface/Asteroid (overall) on the RS Tracker.
        </div>
        {oreMineableStatsTooltipBlock(oreName)}
      </div>
    )
  }

  const profile = getLocationProfile(oreName, guideLocationName, depositType)
  if (!profile) {
    return (
      <div className="space-y-1">
        <div className="font-semibold">{guideLocationName}</div>
        <div className="text-slate-400">Broad spawn — no detailed spawn profile for this compendium entry.</div>
        {oreMineableStatsTooltipBlock(oreName)}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="font-semibold text-orange-300">
        {depositTypeLabel(depositType)} · {profile.system} System
      </div>
      <div>
        Spawn ~{pct(profile.effectiveSpawnPercent)} · max {profile.maxNodes}× cluster
      </div>
      <div className="text-slate-400">
        Pool {profile.relativeSpawnWeight} · group {pct(profile.groupSpawnPercent, 1)}
      </div>
      <div>Cluster: {clusterPreview(profile.clusterRows)}</div>
      <div className="text-slate-400">Composition: {compositionSummary(profile.compositionParts)}</div>
      {oreMineableStatsTooltipBlock(oreName)}
    </div>
  )
}

export function guideOreModalLocationTooltip(
  oreName: string,
  guideLocationName: string,
  depositType: DepositType
): React.ReactNode {
  const profile = getLocationProfile(oreName, guideLocationName, depositType)
  if (!profile) {
    return guideLocationChipTooltip(oreName, guideLocationName, depositType)
  }

  return (
    <div className="space-y-2">
      {guideLocationChipTooltip(oreName, guideLocationName, depositType)}
      {profile.compositionParts?.length ? (
        <ul className="text-slate-400 space-y-0.5">
          {profile.compositionParts.map((part) => (
            <li key={part.elementName}>
              {part.elementName}: {part.minPercentage}–{part.maxPercentage}% (Q×{part.qualityScale})
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function guideLocationOreTooltip(
  oreName: string,
  locationName: string
): React.ReactNode {
  if (isHandMineableOre(oreName) || !hasShipRsSignature(oreName)) {
    return (
      <div className="space-y-1">
        <div className="font-semibold text-orange-300">{oreName}</div>
        <div className="text-slate-400">{locationName}</div>
        <div>{rsTrackerUnmappedDetail(oreName)}</div>
        {handMineableHabitatLine(oreName, locationName)}
        {oreMineableStatsTooltipBlock(oreName)}
      </div>
    )
  }

  const depositTypes = getDepositTypes(oreName)
  if (isBroadGuideLocation(locationName)) {
    const lines = depositTypes.flatMap((depositType) => {
      const overall = getOverallProfile(oreName, depositType)
      if (!overall) return []
      const tag = getOverallSpawnTag(oreName, depositType)
      const compendiumDetail = formatOverallCompendiumDetail(overall.bestLocation)
      return [
        `${depositTypeLabel(depositType)}: ${tag.label}${compendiumDetail ? ` — ${compendiumDetail}` : ''}`,
      ]
    })
    return (
      <div className="space-y-1">
        <div className="font-semibold text-orange-300">{oreName}</div>
        <div className="text-slate-400">{locationName}</div>
        <div>Uses overall spawn profile (not site-specific).</div>
        {lines.length > 0 && (
          <div className="text-slate-400 space-y-0.5">
            {lines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        )}
        {oreMineableStatsTooltipBlock(oreName)}
      </div>
    )
  }

  const profiles = getGuideLocationProfiles(oreName, locationName)
  const profile = profiles[0]
  if (!profile) {
    return (
      <div>
        <div className="font-semibold">{oreName}</div>
        <div className="text-slate-400">No spawn profile mapped for this location.</div>
      </div>
    )
  }

  const overall = getOverallProfile(oreName, profile.depositType)

  return (
    <div className="space-y-1">
      <div className="font-semibold text-orange-300">{oreName}</div>
      <div>{depositTypeLabel(profile.depositType)} at {locationName}</div>
      <div>Spawn ~{pct(profile.effectiveSpawnPercent)}</div>
      <div className="text-slate-400">
        Base RS {formatRsReading(profile.clusterRows[0]?.rs ? profile.clusterRows[0].rs / profile.clusterRows[0].nodes : overall?.clusterRows[0]?.rs ? overall.clusterRows[0].rs / overall.clusterRows[0].nodes : 0)}
      </div>
      <div>Cluster: {clusterPreview(profile.clusterRows)}</div>
      {oreMineableStatsTooltipBlock(oreName)}
    </div>
  )
}

export function trackButtonTooltip(
  oreName: string,
  depositType: DepositType,
  profileMode: 'overall' | 'location',
  locationName?: string
): React.ReactNode {
  return (
    <div className="space-y-1">
      <div className="font-semibold text-orange-300">
        Track {depositTypeLabel(depositType)}
      </div>
      <div>
        Adds {depositTypeLabel(depositType).toLowerCase()} profile to RS Tracker for {oreName}.
      </div>
      {profileMode === 'location' && locationName ? (
        <div className="text-slate-400">Uses spawn/cluster data for {locationName}.</div>
      ) : (
        <div className="text-slate-400">Uses best overall cluster chances for this deposit type.</div>
      )}
    </div>
  )
}

export const SELECTED_LOADOUT_TOOLTIP =
  'Open Smart Cracker to change your loadout. Your selection is saved to your member account.'

export const SMART_CRACKER_BUTTON_TOOLTIP = (
  <div className="space-y-1.5 text-xs leading-snug">
    <p className="font-medium text-slate-200">Loadout planner &amp; crack advisor</p>
    <ul className="list-disc pl-4 space-y-0.5 text-slate-400">
      <li>Pick ship and loadout (synced across devices)</li>
      <li>Configure mining heads, modules, and crafted stats</li>
      <li>Compare laser power vs the rock in the calculator</li>
      <li>Breakability check and minimum-throttle warnings</li>
      <li>Mole head plan — solo vs crew turrets</li>
      <li>Gadget suggestions when a rock is tough to crack</li>
    </ul>
  </div>
)

export const CREW_HEAD_PLAN_BUTTON_TOOLTIP = (
  <div className="space-y-1.5 text-xs leading-snug">
    <p className="font-medium text-slate-200">Crew Head Plan (CHP)</p>
    <ul className="list-disc pl-4 space-y-0.5 text-slate-400">
      <li>Mole multi-turret throttle plan for the rock in your calculator</li>
      <li>Requires <strong className="text-slate-300">Crew</strong> checked, scanner{' '}
        <strong className="text-slate-300">mass</strong> and{' '}
        <strong className="text-slate-300">resistance</strong>, plus a saved{' '}
        <strong className="text-slate-300">Mole</strong> loadout</li>
      <li>Opens the crew head plan from Smart Cracker — throttle assignments only</li>
    </ul>
  </div>
)

export const SOLO_HEAD_PLAN_BUTTON_TOOLTIP = (
  <div className="space-y-1.5 text-xs leading-snug">
    <p className="font-medium text-slate-200">Solo Head Plan (SHP)</p>
    <ul className="list-disc pl-4 space-y-0.5 text-slate-400">
      <li>
        <strong className="text-slate-300">Mole:</strong> which head to run on the rock in your calculator
        (when mass/resistance are set), plus your solo garage spread
      </li>
      <li>
        <strong className="text-slate-300">Other ships:</strong> per-head module and head swap
        suggestions for your selected loadout
      </li>
      <li>Full loadout stats stay in Smart Cracker — this modal is suggestions only</li>
      <li>Uncheck <strong className="text-slate-300">Crew</strong> on Mole, or use any non-Mole loadout</li>
    </ul>
  </div>
)
