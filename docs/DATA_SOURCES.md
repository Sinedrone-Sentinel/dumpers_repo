# Data Sources

This document describes the structured game data files used by Dumper's Repo and their origins.

## Source: MrKraken's StarStrings

**Repository:** [MrKraken/StarStrings](https://github.com/RealMrKraken/StarStrings-master)

StarStrings is a community-curated localization pack for Star Citizen that adds useful information to in-game text, including blueprint pools, rep requirements, and mission metadata.

### Extracted Data Files

| File | Description | Source File |
|------|-------------|-------------|
| `mining-locations.json` | Ore locations organized by rarity tier | `mining.ini` |
| `component-types.json` | Ship component metadata (type/size/grade/manufacturer) | `components.ini` |
| `ordnance.json` | Missile and torpedo data with guidance types | `ordnance.ini` |
| `contract-blueprints.json` | Blueprint pools per contract with standing requirements | `contracts.ini` |
| `starstrings-global.json` | Standing levels and BP mission counts | `global.ini` |
| `starstrings-extracted.json` | Blueprint unlock standing data | `contracts.ini` + `global.ini` |

### Data Schemas

#### Mining Locations (`mining-locations.json`)
```typescript
{
  rarityTiers: {
    legendary: [{ name: string, locations: string[] }],
    epic: [...],
    rare: [...],
    uncommon: [...],
    common: [...],
    handMineable: [...]
  },
  oreLocations: Record<oreName, { rarity: string, locations: string[] }>,
  locationOres: Record<locationName, { name: string, rarity: string }[]>
}
```

#### Component Types (`component-types.json`)
```typescript
{
  components: [{
    internalId: string,
    displayName: string,
    type: 'Cooler' | 'Power Plant' | 'Quantum Drive' | 'Shield Generator' | ...,
    typeCode: 'COOL' | 'POWR' | 'QDRV' | 'SHLD' | ...,
    manufacturer: string,
    manufacturerCode: string,
    size: number,        // 0-4
    class: 'Military' | 'Civilian' | 'Industrial' | 'Competition' | 'Stealth',
    classCode: 'Mil' | 'Civ' | 'Ind' | 'Cmp' | 'Sth',
    grade: 'A' | 'B' | 'C' | 'D',
    gradeRank: 1-4,
    fullLabel: string    // e.g., "Mil/1/D Tundra"
  }],
  componentsByType: Record<type, ComponentData[]>,
  componentsByManufacturer: Record<manufacturer, ComponentData[]>,
  componentsByClass: Record<class, ComponentData[]>
}
```

#### Ordnance (`ordnance.json`)
```typescript
{
  ordnance: [{
    internalId: string,
    displayName: string,
    guidance: 'Cross-Section' | 'Electromagnetic' | 'Infrared',
    guidanceCode: 'CS' | 'EM' | 'IR',
    size: number,        // 1-12
    isGimbal: boolean,
    isTorpedo: boolean,
    type: 'Missile' | 'Torpedo',
    manufacturer: string
  }],
  ordnanceByGuidance: Record<guidance, OrdnanceItem[]>,
  ordnanceBySize: Record<size, OrdnanceItem[]>
}
```

#### Contract Blueprints (`contract-blueprints.json`)
```typescript
{
  blueprintPools: [{
    contractKey: string,
    blueprints: string[],
    standingTier: 'neutral' | 'friendly' | 'trusted' | 'jr_contractor' | 'sr_contractor' | 'master' | 'unknown'
  }],
  standingTierBlueprints: Record<tier, blueprintName[]>,
  blueprintStandings: Record<blueprintName, { minStanding: string, contracts: string[] }>
}
```

---

## Source: Star Citizen Wiki API

**API:** `https://api.star-citizen.wiki/api/`

Used for fetching real-time game data including blueprints and component metadata.

### Data Files

| File | Description | Endpoint |
|------|-------------|----------|
| `component-metadata.json` | Component wiki metadata | `/api/components` |

---

## Source: scunpacked-data

**Repository:** [StarCitizenWiki/scunpacked-data](https://github.com/StarCitizenWiki/scunpacked-data)

Raw extracted game data from Star Citizen data files.

### Usage

Used by `scripts/enrich-missions-scunpacked.mjs` to cross-reference mission reputation requirements.

---

## Extraction Scripts

Located in `/scripts/`:

| Script | Purpose |
|--------|---------|
| `extract-starstrings-all.mjs` | Master extraction from StarStrings |
| `enrich-missions-scunpacked.mjs` | Cross-reference missions with scunpacked-data |
| `enrich-from-starstrings.mjs` | Enrich blueprint acquisition data |
| `infer-mission-rep.mjs` | Infer missing rep requirements |

---

## Data Update Process

1. **Get latest StarStrings:** Download from MrKraken's repo
2. **Run extraction:** `node scripts/extract-starstrings-all.mjs`
3. **Run enrichment:** `node scripts/enrich-from-starstrings.mjs`
4. **Verify data:** Check generated JSON files
5. **Commit changes:** Push to repo

---

## Type Definitions

All data types are defined in `src/data/index.ts` with helper functions for common queries:

```typescript
import {
  miningLocations,
  componentTypes,
  ordnance,
  contractBlueprints,
  getOreLocations,
  findComponents,
  findOrdnance,
  getBlueprintStanding
} from '@/data'
```

---

## Future Data Sources

Planned integrations:
- **Trade data:** Commodity prices and trade routes
- **Ship specs:** Detailed ship statistics
- **Location data:** POIs, landing zones, stations
