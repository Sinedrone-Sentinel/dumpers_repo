import React from 'react'
import type { Region } from '../lib/missions'
import {
  buildMissionLocationTags,
  MISSION_LOCATION_TAG_STYLES,
} from '../lib/missionLocations'

interface MissionLocationTagsProps {
  regions?: Region[]
  subRegion?: string | null
  system?: string | null
  poolKey?: string | null
  localitySystems?: (string | null)[] | null
  /** Drop specific-place chips (e.g. Monox) and keep system / region chips only. */
  omitSpecificLocations?: boolean
  className?: string
}

export default function MissionLocationTags({
  regions,
  subRegion,
  system,
  poolKey,
  localitySystems,
  omitSpecificLocations = false,
  className = '',
}: MissionLocationTagsProps) {
  const allTags = buildMissionLocationTags({ regions, subRegion, system, poolKey, localitySystems })
  const tags = omitSpecificLocations ? allTags.filter((tag) => tag.kind !== 'location') : allTags

  return (
    <>
      {tags.map((tag) => (
        <span
          key={tag.key}
          className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border ${MISSION_LOCATION_TAG_STYLES[tag.kind]} ${className}`}
        >
          {tag.label}
        </span>
      ))}
    </>
  )
}
