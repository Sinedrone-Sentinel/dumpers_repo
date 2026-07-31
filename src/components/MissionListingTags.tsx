import React from 'react'
import type { MissionLocality, MissionPrereq, MissionRepEffect } from '../lib/blueprintMissionRewards'
import type { MissionFrequency } from '../lib/missionFrequency'
import {
  formatMissionHowMany,
  formatMissionHowOften,
  formatMissionSolo,
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

/** Muted yellow/brown — board refresh / offer cadence ("Time"). */
const TIME_TAG_CLASS =
  'text-[10px] px-1.5 py-0.5 bg-yellow-950/45 text-yellow-200/75 border border-yellow-700/40 rounded'
/** Same family for offer-count caps on the frequency row. */
const COUNT_TAG_CLASS =
  'text-[10px] px-1.5 py-0.5 bg-yellow-950/45 text-yellow-200/75 border border-yellow-700/40 rounded'
const SOLO_TAG_CLASS =
  'text-[10px] px-1.5 py-0.5 bg-red-950/50 text-red-400 border border-red-500/50 rounded font-medium'

/**
 * overview — at-a-glance lists/modals: locality flag + Solo; no location chips; no time/count.
 * detail — Browse/tracker breakdowns: location chips + time/count + Solo; no locality flag.
 */
export type MissionTagLayout = 'overview' | 'detail'

/**
 * Site-wide mission tag order:
 * Row 1: [Verified/Unverified] [Contract Type] [location] [career path] [standing tier] [aUEC] [Rep Points]
 *         then optional: [Prerequisite] [pool roll / BP drop]
 * Row 2 (detail): [how many] [how often] [Solo]
 * Row 2 (overview): [Solo] only
 */
export interface MissionListingTagsProps {
  /** overview = flag + Solo; detail = location chips + time/count + Solo */
  layout?: MissionTagLayout
  isLawful?: boolean
  /** Always show Verified/Unverified when true (Browse). Tracker historically hid Verified. */
  showVerifiedBadge?: boolean
  category?: string | null
  regions?: Region[]
  subRegion?: string | null
  system?: string | null
  poolKey?: string | null
  locality?: MissionLocality | null
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
  layout = 'detail',
  isLawful = true,
  showVerifiedBadge = true,
  category,
  regions = [],
  subRegion,
  system,
  poolKey,
  locality,
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
  const isOverview = layout === 'overview'
  const careerLabel = repCareerLabel?.trim() || null
  const standingLabel =
    formatStandingRange(minStanding, maxStanding) ||
    formatStandingRequirement(minStandingName ?? null, minReputation ?? null)
  const aUecText = formatAuecReward(aUecMin, aUecMax)
  const poolRollText = formatPoolRoll(poolRollChance)
  const dropText = formatBlueprintDropChance(dropChance)
  const howManyText = isOverview ? null : formatMissionHowMany(frequency)
  const howOftenText = isOverview ? null : formatMissionHowOften(frequency)
  const soloText = formatMissionSolo(frequency)
  const showFrequencyRow = Boolean(howManyText || howOftenText || soloText)
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

        {/* 3. Location — overview: flag only; detail: location chips only */}
        {isOverview ? (
          <MissionLocalityTag locality={locality} />
        ) : (
          <MissionLocationTags
            regions={regions}
            subRegion={subRegion}
            system={system}
            poolKey={poolKey}
            localitySystems={locality?.systems}
          />
        )}

        {/* 4. Career path (mobiGlas rep track — e.g. Standing, Security, Bounty Hunting) */}
        {careerLabel ? (
          <span className="text-[10px] px-1.5 py-0.5 bg-indigo-950/50 text-indigo-300 border border-indigo-500/40 rounded">
            {careerLabel}
          </span>
        ) : null}

        {/* 5. Standing tier gate */}
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

        {/* 6. aUEC */}
        {aUecText ? <span className="text-[10px] text-yellow-400/90">{aUecText}</span> : null}

        {/* 7. Rep Points */}
        {hasRepEffects ? (
          <MissionRepEffectTags
            repEffects={repEffects}
            repPoints={repPoints}
            missionFaction={missionFaction}
          />
        ) : fallbackRepText ? (
          <span className="text-[10px] text-emerald-400/90">{fallbackRepText}</span>
        ) : null}

        {/* Extras */}
        <MissionPrereqTag prereqMissions={prereqMissions} missionTitle={missionTitle} />
        {poolRollText ? <span className="text-[10px] text-amber-400/80">{poolRollText}</span> : null}
        {dropText ? <span className="text-[10px] text-amber-400/80">{dropText}</span> : null}
      </div>

      {showFrequencyRow ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {howManyText ? <span className={COUNT_TAG_CLASS}>{howManyText}</span> : null}
          {howOftenText ? <span className={TIME_TAG_CLASS}>{howOftenText}</span> : null}
          {soloText ? <span className={SOLO_TAG_CLASS}>{soloText}</span> : null}
        </div>
      ) : null}
    </div>
  )
}
