import React from 'react'
import type { MissionLocality, MissionPrereq, MissionRepEffect } from '../lib/blueprintMissionRewards'
import type { MissionFrequency } from '../lib/missionFrequency'
import {
  formatMissionHowMany,
  formatMissionHowOften,
  hasMissionFrequencyTags,
} from '../lib/missionFrequency'
import type { Region } from '../lib/missions'
import {
  formatBlueprintDropChance,
  formatStandingRange,
  formatStandingRequirement,
} from '../lib/missionAcquisition'
import MissionLocationTags from './MissionLocationTags'
import MissionLocalityTag from './MissionLocalityTag'
import MissionPrereqTag from './MissionPrereqInfo'
import MissionRepEffectTags from './MissionRepEffectTags'

/**
 * Site-wide mission tag order:
 * Row 1: [Verified/Unverified] [Contract Type] [system/location] [career path] [aUEC] [Rep Points]
 *         then optional: [Prerequisite] [pool roll / BP drop]
 * Row 2: [how many] [how often] — only when game files provide the value
 */
export interface MissionListingTagsProps {
  isLawful?: boolean
  /** Always show Verified/Unverified when true (Browse). Tracker historically hid Verified. */
  showVerifiedBadge?: boolean
  category?: string | null
  regions?: Region[]
  subRegion?: string | null
  system?: string | null
  poolKey?: string | null
  locality?: MissionLocality | null
  /**
   * Compact locality “flag” (e.g. near Terminus). Useful in overview lists;
   * hide on full breakdowns that already show the individual location chips.
   */
  showLocalityTag?: boolean
  /** Browse-style standing window (min–max). */
  minStanding?: { name: string; minReputation: number } | null
  maxStanding?: { name: string; minReputation: number } | null
  /** Tracker-style single standing gate. */
  minStandingName?: string | null
  minReputation?: number | null
  showRepUnknown?: boolean
  repCareerLabel?: string | null
  aUecMin?: number | null
  aUecMax?: number | null
  repEffects?: MissionRepEffect[] | null
  repPoints?: number | null
  repMin?: number | null
  repMax?: number | null
  missionFaction?: string | null
  missionTitle?: string
  prereqMissions?: MissionPrereq[] | null
  /** Contract-level partial pool roll (Browse). */
  poolRollChance?: number | null
  /** Per-blueprint drop chance when listing under a BP (Tracker). */
  dropChance?: number | null
  frequency?: MissionFrequency | null
  className?: string
}

function formatAuecReward(aUecMin?: number | null, aUecMax?: number | null): string | null {
  const min = aUecMin ?? 0
  const max = aUecMax ?? 0
  if (min <= 0 && max <= 0) return null
  if (min === max || max === 0) return `${min.toLocaleString()} aUEC`
  return `${min.toLocaleString()}–${max.toLocaleString()} aUEC`
}

function formatPoolRoll(chance?: number | null): string | null {
  if (chance == null || chance >= 1) return null
  return `${Math.round(chance * 100)}% pool roll`
}

export default function MissionListingTags({
  isLawful = true,
  showVerifiedBadge = true,
  category,
  regions = [],
  subRegion,
  system,
  poolKey,
  locality,
  showLocalityTag = true,
  minStanding,
  maxStanding,
  minStandingName,
  minReputation,
  showRepUnknown = false,
  repCareerLabel,
  aUecMin,
  aUecMax,
  repEffects,
  repPoints,
  repMin,
  repMax,
  missionFaction,
  missionTitle,
  prereqMissions,
  poolRollChance,
  dropChance,
  frequency,
  className = 'flex flex-col gap-1',
}: MissionListingTagsProps) {
  const standingFromRange = formatStandingRange(minStanding, maxStanding, repCareerLabel)
  const standingFromGate = formatStandingRequirement(
    minStandingName ?? null,
    minReputation ?? null,
    repCareerLabel
  )
  const standingLabel = standingFromRange || standingFromGate
  const aUecText = formatAuecReward(aUecMin, aUecMax)
  const poolRollText = formatPoolRoll(poolRollChance)
  const dropText = formatBlueprintDropChance(dropChance)
  const howManyText = formatMissionHowMany(frequency)
  const howOftenText = formatMissionHowOften(frequency)
  const showFrequencyRow = hasMissionFrequencyTags(frequency)
  const hasRepEffects = Boolean(repEffects?.length || (repPoints != null && repPoints !== 0))
  const fallbackRepText =
    !hasRepEffects && (repMin != null || repMax != null)
      ? (() => {
          if (repMin != null && repMax != null && repMin !== repMax) {
            return `+${repMin.toLocaleString()}–${repMax.toLocaleString()} rep`
          }
          const value = repMin ?? repMax
          return value != null ? `+${value.toLocaleString()} rep` : null
        })()
      : null

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        {/* 1. Verified / Unverified */}
        {(!isLawful || showVerifiedBadge) && (
          <span
            className={`text-[10px] px-1.5 py-0.5 border rounded ${
              isLawful
                ? 'bg-green-950/50 text-green-300 border-green-500/40'
                : 'bg-red-950/50 text-red-400 border-red-500/40'
            }`}
          >
            {isLawful ? 'Verified' : 'Unverified'}
          </span>
        )}

        {/* 2. Contract Type (mobiGlas MissionType) */}
        {category ? (
          <span className="text-[10px] px-1.5 py-0.5 bg-amber-950/50 text-amber-300 border border-amber-500/40 rounded">
            {category}
          </span>
        ) : null}

        {/* 3. System / location */}
        <MissionLocationTags
          regions={regions}
          subRegion={subRegion}
          system={system}
          poolKey={poolKey}
          localitySystems={locality?.systems}
        />
        {showLocalityTag ? <MissionLocalityTag locality={locality} /> : null}

        {/* 4. Career path (standing gate) */}
        {standingLabel ? (
          <span
            className={`text-[10px] px-1.5 py-0.5 border rounded ${
              minReputation === 0 || minStanding?.minReputation === 0
                ? 'bg-slate-800/60 text-slate-400 border-slate-600/40'
                : 'bg-cyan-950/50 text-cyan-300 border-cyan-500/40'
            }`}
          >
            {standingLabel}
          </span>
        ) : showRepUnknown ? (
          <span className="text-[10px] px-1.5 py-0.5 bg-slate-800/60 text-slate-500 border border-slate-600/40 rounded">
            Rep unknown
          </span>
        ) : null}

        {/* 5. aUEC */}
        {aUecText ? <span className="text-[10px] text-yellow-400/90">{aUecText}</span> : null}

        {/* 6. Rep Points */}
        {hasRepEffects ? (
          <MissionRepEffectTags
            repEffects={repEffects}
            repPoints={repPoints}
            missionFaction={missionFaction}
          />
        ) : fallbackRepText ? (
          <span className="text-[10px] text-emerald-400/90">{fallbackRepText}</span>
        ) : null}

        {/* Extras (not in the core order, but already used site-wide) */}
        <MissionPrereqTag prereqMissions={prereqMissions} missionTitle={missionTitle} />
        {poolRollText ? <span className="text-[10px] text-amber-400/80">{poolRollText}</span> : null}
        {dropText ? <span className="text-[10px] text-amber-400/80">{dropText}</span> : null}
      </div>

      {/* Frequency: how many + how often only — skip missing fields */}
      {showFrequencyRow ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {howManyText ? (
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-800/60 text-slate-300 border border-slate-500/40 rounded">
              {howManyText}
            </span>
          ) : null}
          {howOftenText ? (
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-800/60 text-slate-300 border border-slate-500/40 rounded">
              {howOftenText}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
