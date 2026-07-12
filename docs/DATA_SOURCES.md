# Data Sources

This document describes the structured game data files used by Dumper's Repo and their origins.

## Primary Source: Star Citizen Game Files (Direct Extraction)

All blueprint, component, mining, ordnance, reputation, and Archive lore data comes from direct extraction of Star Citizen's game files using StarBreaker.

### Extraction Process

1. **Extract DataForge**: Run `.\scripts\extract-game-data.ps1`
   - Step 1: full DCB extract to JSON (`extracted-data/libs/foundry/records/`)
   - Step 2: English localization from `Data.p4k`
   - Step 3: shop socpaks + ShopInventories **only** with `-IncludeShopData` (skipped by default)
   - Quality bands and mission broker data come from the DCB extract — no separate `dcb query` steps

2. **Parse Extracted Data**: Run `node scripts/parse-extracted-data.mjs`
   - Parses extracted JSON files
   - Generates app data files in `src/data/`
   - Reports validation issues if game data structure changed

3. **Validate catalog** (optional): `npm run validate-blueprints`

### Generated Data Files

| File | Description | Source |
|------|-------------|--------|
| `game-blueprint-missions.json` | Mission → blueprint reward mappings | `crafting/blueprintrewards/` |
| `game-blueprints.json` | Blueprint definitions with crafting recipes (**app catalog**) | `crafting/blueprints/` |
| `game-mining.json` | Mineable element stats, **RS base signatures** (`oreSignatures`), mining lasers | `mining/mineableelements/`, `entities/mineable/mineablerock_*`, `entities/scitem/ships/weapons/` |
| `game-mining-locations.json` | Ore/location compendium, `locationAliases` (spawnKey → displayName/guideName), mineable details | Game localization (`*_desc` keys) + compendium + HPP audit |
| `game-mining-spawns.json` | Per-location spawn weights, cluster RS/chance profiles; each location includes `spawnKey`, `displayName`, `guideName` | `harvestable/providerpresets/`, `harvestable/clusteringpresets/`, `mining/rockcompositionpresets/` |
| `game-components.json` | Ship components (coolers, shields, etc.) | `entities/scitem/ships/` |
| `game-ordnance.json` | Missiles and torpedoes (Archive Ordnance tab) | `entities/scitem/ships/weapons/missiles/` |
| `game-fps-weapons.json` | FPS weapon stats | `entities/scitem/weapons/` |
| `game-salvage-modules.json` | Salvage modules | `entities/scitem/ships/` |
| `game-manufacturers.json` | Manufacturer names/codes | Manufacturer records |
| `game-build-version.json` | Extracted game build version (BP Dumper min version) | Extraction metadata |
| `game-reputation.json` | Reputation standings, contracts, mission broker entries | `reputation/standings/`, `missionbroker/`, contract generators |
| `game-quality-bands.json` | Crafting quality quantization + distribution curves | `crafting/qualityquantization/`, `crafting/qualitydistribution/` |
| `game-lore.json` | Resource/item lore for Archive | Game localization (`global.ini`) |
| `dfp-commodity-bases.json` | Q0 commodity/salvage DFP bases (UEX-backed) | `fetch-commodity-dfp-bases.mjs` |
| `component-metadata.json` | Component wiki metadata (DFP engine build input) | Star Citizen Wiki API |
| `_extraction-validation.json` | Validation issues (if any) | Generated |

The app **only** loads blueprint craft data from `game-blueprints.json`. There is no separate `Blueprints.json` or sccrafter sync.

### Data Validation

The parser validates expected data paths exist. If the game data structure changes between patches, the parser will report which paths are missing in `_extraction-validation.json`.

---

## Source: UEX Corp API (Commodity DFP bases)

**API:** [https://uexcorp.space/api/documentation](https://uexcorp.space/api/documentation)

Crowdsourced live commodity prices. Used for Resource Tracker DFP Q0 base prices only:

`npm run fetch-commodity-bases` (monthly refresh recommended).

Shop socpaks and ShopInventories are extracted locally with `.\scripts\extract-game-data.ps1 -IncludeShopData` into `extracted-data/` for a future separate project — not synced to this app.

---

## Source: Star Citizen Wiki API

**API:** `https://api.star-citizen.wiki/api/`

Used for supplementary component metadata during DFP engine builds (`component-metadata.json`). Archive lore comes from game localization, not this API.

---

## Mining RS signatures (game extraction)

Ship-mining scanner base values (3170 for Quantainium, etc.) are parsed from **mineable rock entity definitions**:

- Path: `entities/mineable/mineablerock_{asteroid|surface}{tier}_{ore}.json`
- Field: `SSCSignatureSystemParams` → `radarProperties.baseSignatureParams.signatures[4]`

Stored in `game-mining.json` as `oreSignatures` and copied onto each ore in `game-mining-spawns.json` as `baseSignature`. Cluster RS readings in the UI are `baseSignature × node count`.

Hand-mineable / FPS gems use generic entity templates (often RS 3000/4000) and are not included in the ship RS Tracker reference.

---

## Deprecated / reference-only sources

### seneca0815-rgb/SC_Signature_Scanner (REFERENCE ONLY)

Community OCR overlay with a pre-built lookup table. **Not used by this repo** — signatures are extracted from game files as described above. Useful for cross-checking in-game readings.

### MrKraken/StarStrings (DEPRECATED)

StarStrings has been replaced by direct game file extraction. Legacy scripts were removed from the repo.

---

## Extraction Scripts

Located in `/scripts/`:

| Script | Purpose |
|--------|---------|
| `extract-game-data.ps1` | Extract full DCB + localization from Data.p4k; optional shop data with `-IncludeShopData` |
| `parse-extracted-data.mjs` | Parse extracted JSON into `src/data/game-*.json` (`npm run parse-game-data`) |
| `diff-game-data.mjs` | Patch diff: adds/removes/renames/stat changes vs last commit (`npm run diff-game-data`) |
| `generate-mission-broker-order.mjs` | Regenerate `lib/missionBrokerOrder.mjs` after a patch if mission broker records reorder (one-off `dcb query`) |
| `audit-mining-aliases.mjs` | Verify all spawn keys have member-facing locationAliases |
| `audit-ore-name-consistency.mjs` | Cross-check ore names across mining JSON outputs |
| `audit-alias-tables.mjs` | Report which manual alias/rarity tables are still required |
| `fetch-commodity-dfp-bases.mjs` | Refresh UEX-backed Q0 bases → `dfp-commodity-bases.json` |
| `validate-blueprints.mjs` | Sanity-check `game-blueprints.json` after parse |
| `verify-dfp-spotcheck.mjs` | Spot-check DFP engine output against catalog |
| `audit-blueprint-names.mjs` | Dev utility for catalog name audits |

---

## Data Update Process

When a new Star Citizen patch drops:

1. **Extract:** `.\scripts\extract-game-data.ps1` (wipes and repopulates `extracted-data/`)
2. **Parse:** `npm run parse-game-data` (regenerates all `src/data/game-*.json` from scratch)
3. **Review the patch diff:** `npm run diff-game-data`
   - Compares fresh parse output against the last commit (`--ref <ref>` for another baseline)
   - Reports **ADDED / REMOVED / RENAMED-MOVED / CHANGED** records per file, with field-level stat changes
   - `--full` shows every changed field; `--file game-mining.json` limits scope
4. **Verify removals are real** — CIG moves records between directories more often than it deletes them:
   - Same-id renames are auto-detected and reported as RENAMED/MOVED, not removed
   - For anything still listed as REMOVED, check `src/data/_extraction-validation.json` for
     "Missing expected path" (a moved directory looks like a mass removal), then search the
     new extract: `rg -l -i "<name>" extracted-data/libs/foundry/records`
   - If a whole directory moved, update `EXPECTED_PATHS` in `scripts/parse-extracted-data.mjs`
5. **Audit + validate:** `npm run patch-audit` — full battery: mining aliases, ore names, broad
   locations, blueprint sanity, mission rewards, HPP/alias/coverage cross-checks against the raw
   extract (skipped with a warning if `extracted-data/` is absent), mining math + crew strategy
   verifiers, and the patch diff
   - New CIG misspellings surface here — add corrections to the typo handlers in
     `parse-extracted-data.mjs` (component names) or `src/data/mining-ore-aliases.json` (ores)
6. **Optional DFP commodity bases:** `npm run fetch-commodity-bases` → rebuild DFP engine in `dfp-engine-private`
7. **BP Dumper (only if blueprints changed):** `npm run generate-dumper-mappings && npm run copy-blueprint-lookup`,
   and `npm run sync-min-game-version` if the game major.minor changed
8. **Deploy:** Commit updated `game-*.json` (and DFP bundle if changed), `npm run build`, deploy `dist/`

No DB sync step: all game catalogs (mining guide, ordnance, components, blueprints) are bundled
from the parsed `game-*.json` at build time — deploying the site updates everything at once.

If Step 2 reports validation issues in `_extraction-validation.json`, the game data structure may have changed.

### Mining location aliases (`locationAliases`)

Internal HPP spawn keys (e.g. `Stanton1b`, `Lagrange F`) are mapped to member-facing names during parse:

| Field | Purpose |
|-------|---------|
| `spawnKey` | Stable lookup id from HPP record (matches `locationName` in spawn profiles) |
| `displayName` | Member-facing label (`Aberdeen`, `ARC-L1`, `Pyro I–II Lagrange belts`) |
| `guideName` / `guideNames` | Compendium / starmap names for guide chip resolution |
| `source` | `localization_desc`, `spawn_code_table`, `verified_overlay`, or `hpp_path_audit` |

`guideToSpawnKeys` is the reverse map (compendium name → spawn keys) for guide location resolution at runtime via `src/lib/miningLocationNames.ts`.

Built in `scripts/lib/miningLocationAliases.mjs` during `parseMiningLocations()`. Lagrange belt templates and Pyro cluster fields use a verified overlay when game files lack explicit parent-body labels.

---

## Removed Legacy Pipelines

These were removed from the repo and must not be reintroduced:

| Legacy source | Was replaced by |
|---------------|-----------------|
| sccrafter.com `Blueprints.json` + `sync-blueprints` | `game-blueprints.json` from game extraction |
| MrKraken StarStrings + `sync-starstrings` | `parse-extracted-data.mjs` + bundled `game-*.json` |
| Supabase `game_*` mirror tables + `sync-game-data-to-db.mjs` | Bundled `game-*.json` at build time (mirrors dropped in migration 118) |
| Separate `blueprint-acquisition.json` | `rewardMissions` on entries in `game-blueprints.json` |

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
