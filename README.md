# Dumper's Repo

**Buy. Craft. Sell.** — Blueprint tracking, mining tools, resource coordination, and a member marketplace for Star Citizen.

**Official site:** [dumpers-repo.com](https://www.dumpers-repo.com) (Black Star, operated by Michael Linzenmeyer / RSI `Sinedrone_Sentinel`). This is the only authorized public deployment — see [LICENSE](LICENSE).

## Contents

- [What is Dumper's Repo?](#what-is-dumpers-repo)
- [Site map](#site-map)
- [Features](#features)
- [Authentication & roles](#authentication--roles)
- [Offline Mode](#offline-mode)
- [BP Dumper](#bp-dumper-desktop)
- [Dumper's Fair-Value Price (DFP)](#dumpers-fair-value-price-dfp)
- [For developers](#for-developers)
- [Documentation](#documentation)
- [Ownership](#ownership)
- [Disclaimer](#disclaimer)

---

## What is Dumper's Repo?

A static React SPA backed by Supabase. Members browse a game-data-driven blueprint catalog, track missions and resources, run mining reference tools, and trade through a DFP-priced marketplace. Officers approve sign-ups and handle support; super-admins manage game-data refreshes, Discord delivery, and site-wide settings.

Member-facing how-tos live in the in-app **Info Archive** (`/archive`) and the printable offline guide at [`public/archive-guide.html`](public/archive-guide.html) (regenerated on each production build).

---

## Site map

| Route | Page | Access |
|-------|------|--------|
| `/` (signed out) | Public SEO landing | Everyone — Sign in or Browse tools offline |
| `/` (offline / signed in) | Blueprints | Offline + members |
| `/wikelo` | Wikelo | Offline + members |
| `/targets` | Mission Tracker | Offline + members |
| `/targets/live` | Live Mission Tracker | Members (BP Dumper watch mode) |
| `/resources` | Resource Tracker | Offline + members |
| `/mining-tracker` | Mining Tracker | Offline + members |
| `/commodity-lookup` | Commodity Lookup | Offline + members |
| `/orders` | My Listings | Approved members |
| `/bazaar` | The Bazaar | Approved members (offline: open-listing count only) |
| `/archive` | Info Archive | Offline + members |
| `/discord-subscribe` | Discord Webhooks | Signed-in members |
| `/support-dashboard` | Support Dashboard | Officers + super-admins |
| `/analytics` | Site Analytics | Super-admins |
| `/guest-locked` | Feature preview gate | Offline users (locked features) |

Avatar menu (signed-in): **Settings**, **BP Dumper**, **Webhooks**, **Support**, **Sign out**. Officers also get **Admin Panel**; super-admins get **DB Actions** and **Discord** (queue/admin webhooks).

---

## Features

### Blueprints (`/`)

- Browse the full crafting catalog with search, category, material, and acquisition filters (filters persist per account in the browser)
- Mark blueprints **acquired**; starter defaults may reappear on refresh until marked
- **Member collection directory** on each card — see which org members own a blueprint (respects privacy flags in the database)
- Blueprint detail modal: crafting materials, components, stats, **Dumper's Fair-Value Price (DFP)** at selectable quality bands
- **Missions** on each blueprint lists every contract that rewards it and opens Mission Tracker browse
- Add blueprints to a session **order draft** (continues on My Listings) or **target list** (Mission Tracker)
- Optional **Display** setting: group FPS weapon and armor variants into expandable family cards (off by default)
- **BP Dumper** syncs acquired marks from `Game.log` automatically

### Wikelo (`/wikelo`)

- All **Wikelo Emporium barter trades** parsed from game contract data (`game-wikelo-trades.json`)
- Category filter tags: Ships, Ground Vehicles, Armor, Weapons, Gear, Favors
- Cards show hand-in costs, rewards, Wikelo rep gained, customer-rank gates, and intro-mission requirements
- **DFP** prices each trade from the fair value of its hand-in items; game-bound vehicle rewards show **N/A**
- **Mission** button jumps to the Wikelo Emporium faction in Mission Tracker browse

### Mission Tracker (`/targets`)

- **My Tracker** — personal wishlist of blueprints you are grinding toward
- **Browse Missions** — pick a faction, browse mission pools with location/rep/category tags and X/X progress per location
- **System filter** — narrow Browse Missions to Stanton / Pyro / Nyx (faction cards + mission lists follow the filter); every blueprint-reward contract stays visible even after all its blueprints are collected
- **Rep effect tags** — completion gains plus any cross-faction losses per mission (from game contract data)
- **🔒 Prerequisite chips** — gated contracts link to the intro/starter missions that unlock them
- **📍 Locality tags** — where you must be for a contract to appear (game `MissionLocality` gates)
- Investigation, collection, and bounty mission families (including Hathor PAF sites) with color-coded tag legend
- Header shortcuts: **BP Dumper** (setup + API key) and **Live Tracker** (`/targets/live`)
- Dismissible callout explains the BP Dumper + Live Tracker workflow

### Live Mission Tracker (`/targets/live`)

- Real-time columns: **active in-game missions** (left) and **pool blueprints still to acquire** (right)
- Requires **BP Dumper** in watch mode with your personal API key
- **Session status bar**: connected in the PU, quit to menu, game closed, crash recovery window (one hour), reconnected
- Uses Supabase Realtime on `dumper_active_missions`; clears when watch mode stops

### Resource Tracker (`/resources`)

- Log personal stock by resource and **quality band** (SCU); optional per-row notes (e.g. hangar / ship location)
- **Cards** view (edit quantities) and **List** view (read-only overview)
- Location filter chips appear automatically from stock notes (case/punctuation-insensitive; refresh when cards change)
- Mined/refined ore uses bands Q500–Q1000; salvage and trade goods use fixed **Purchased (Q0)** tiers
- **Can Craft** tab lists acquired blueprints you can make from tracked stock (with optional *Close, no Cigar*); note chips plus **ALL** scope craftability and Craft deductions to one location; ready recipes get a **Craft** button in the blueprint modal that deducts materials at the quality tiers you pick (only owned tiers shown), with a short anti-double-click cooldown
- **Site Total** rollup (officers and super-admins only) — org-wide inventory aggregate
- Resource catalog ships with the site from parsed game data — no manual sync

### Mining Tracker (`/mining-tracker`)

Three tabs — **RS Tracker**, **Mining Guide**, and **Ledgers** (RSI-verified).

**RS Tracker**

- Reference grid of base RS signatures and cluster spawn odds; track up to two cards per ore (Surface / Asteroid) plus optional per-site location cards
- Click a tracked card to load ore, location, and expected composition into the **Rock Calculator** sidebar
- **Rock Calculator** — enter HUD mass, resistance, instability, SCU, and material %; pick up to two mining gadgets (they modify the rock's base stats before head/module math); inert auto-fills; Q bands per row for ledger export; DFP shown at purchased (Q0)
- **Smart Cracker** — automated crack advisor using the rock in your calculator: breakability warnings, throttle/head suggestions (solo or Mole crew), gadget recommendations; saved loadouts per ship sync across devices when signed in (RSI verification not required)

**Mining Guide**

- **By Ore** — rarity filters, location chips, spawn/cluster/composition tooltips
- **By Location** — all ores at each mineable site; Overall summaries for broad regions
- **All Sites / Surface / Asteroid** deposit-type filter for both views (asteroid sites dodge planetary weather for solo Mole crews)
- 📍 **Find-it-in-game hints** on belt/cluster tooltips, plus a grouped **QT markers & stations** panel when you click a location (PYAM stations per Lagrange point, RAB/RMB cluster bases per Pyro region, BRK breakers) — all parsed from game files
- Negligible odds show as **trace spawn (<0.01%)** — dimmed and sorted last instead of a misleading "0.00%"

**Ledgers** (RSI-verified members)

- Crew payout books: mining runs, shares, deductibles, partial payments, JSON export/import, access sharing, in-app payout notifications
- Lifetime **site totals** for closed crew ledgers

Game mining data is bundled with the site (see [Game data](#game-data)).

A blue **UEX** chip on tracked ore cards, the ore detail popup, and ledger rows opens the Commodity Lookup popup for that ore (see below).

### Commodity Lookup (`/commodity-lookup`)

Find every terminal where you can **sell** or **buy** a commodity, with **UEX per-SCU prices** and SCU box (container) sizes — **Powered by [UEX](https://uexcorp.space)**.

- Search/filter commodities by kind; pick one to see **Sell to** (turn ore into aUEC) and **Buy from** terminals grouped by star system
- Full location breadcrumb down to planet-side kiosks (e.g. ArcCorp Mining Area 045), plus **Refinery** badge, **per-SCU price**, and box sizes per terminal
- System filter and collapsible Stanton/Pyro/Nyx sections in the UEX popup; covers all three systems
- The same lookup is available as a **UEX** chip popup on Mining Tracker (ore cards, ore detail, ledger rows) and Resource Tracker (cards + list)
- Data is baked from the UEX API by `npm run fetch-shop-data` (see [npm scripts](#npm-scripts)); the chip auto-hides for non-commodity items

### My Listings (`/orders`)

Each member keeps at most **one open WTB listing** and **one open WTS listing** — posting new items appends lines to the matching listing:

- **Add to my WTB listing** — request crafted items or supplied resources at DFP
- **Add to my WTS listing** — offer stock on hand; every listing is **always partially shoppable**
- **Pure DFP pricing** — no price sliders or adjustments; line totals must equal DFP
- Expand cart lines to set per-slot material qualities; live DFP total and stat preview
- **My open listings** panel: edit line quantities, remove lines, or close a listing inline
- Tabs: active, completed, archive track **child transactions**; confirm pickup; **Archive & rate** after completion
- Requires **verified RSI Handle**; pending-member buyer/seller limits apply per transaction (open listings don't count)

### The Bazaar (`/bazaar`)

- Two tabs: **Fulfillment** (WTB listings) and **Store** (WTS listings)
- Item-level **search** plus **minimum quality-band filter**; Fulfillment tab adds min buyer rep and "only listings with my blueprints" filters
- Pick exact lines and quantities to buy or fulfill — fulfillers only need blueprints for the lines they claim
- Every checkout/claim spawns a full child transaction (same handoff, deadlines, ratings)
- Seller actions on-card: start handoff, mark ready, cancel/release (items restore to the listing)
- **Reputation badges** show buyer rep, fulfiller/seller rep, and average delivery time (after 5 completed trades)
- Offline users see open-listing **count only** — sign in to browse or trade

### Marketplace ads & purchase toasts

- Optional bottom-corner **listing ads** rotate active WTS/WTB listings from other members (opens the listing on click)
- Optional **purchase toasts** announce completed marketplace deals in real time
- Site-wide toggles are super-admin controlled (off by default); members can opt out individually in Settings

### Info Archive (`/archive`)

| Section | Content |
|---------|---------|
| **Overview** | Site guide, Offline Mode, DFP story, ratings, order lifecycle, tips |
| **Components** | Ship coolers, power plants, shields, quantum drives — filter by size/grade |
| **Ordnance** | Missiles and torpedoes by size and guidance type |
| **Factions** | Reputation tiers and blueprint unlock thresholds |
| **Resource Lore** | In-game flavor text from `global.ini` extraction |
| **General Info** | Community links, data attribution, mining/trading tips |

The production build regenerates [`public/archive-guide.html`](public/archive-guide.html) for Save-as-PDF offline reading (`npm run generate-archive-guide`).

### Notifications

- Header bell with unread count; categories include BP Dumper, WTB/WTS, Support, Mining Ledger, and more
- Dismiss (**Clear**) deletes the row — no read-history archive
- Unavailable while account is `pending`

### Discord Webhooks (`/discord-subscribe`)

- **My activity** — your deals moving forward (requires verified RSI Handle)
- **Marketplace activity** (opt-in) — new/changed listings from other members; coalesced digests for post/cancel bursts, and listing edits post one held, diff-only "Listing Updated" (only the changed lines, never a full re-dump)
- **Support** — staff replies and resolved tickets
- Per-event URLs; no self-echo on your own posts
- Super-admins configure org-wide Discord queue, coalesce window, and manual drain from the **Discord** admin modal

### Support

- Members file tickets from the avatar menu (bugs, behavior reports, RSI verification help)
- Officers use **Support Dashboard** (`/support-dashboard`) — respond, escalate, rate resolution
- Ticket data is deleted after resolution

### Settings (avatar menu)

**All approved members**

- RSI Handle verification via temporary public-bio challenge code (robertsspaceindustries.com citizen page)
- **Connected Accounts** — link Google and Discord (auto-merge when emails match)
- **Deduct inventory on craft complete** — optional WTB fulfillment material deduct from Resource Tracker
- **Group FPS blueprint variants** — Blueprints page display preference
- **Marketplace ads / purchase toasts** — personal opt-out toggles (shown when the site has them enabled)
- **My Data** — wipe acquired blueprints or tracked resources
- Delete account (blocked while active orders exist)

**Super-admin only (same Settings modal)**

- Toggle **DFP display** site-wide (required opt-out footer when disabled)
- Enable **marketplace ads** (WTS/WTB) and **purchase toasts** site-wide
- **Auto-approve** new sign-ups
- **Welcome modal** always-show (testing)
- Upload **org logo** (`ORG_LOGO.png` in Supabase Storage) — community branding for card flips, not git

### Administration

| Tool | Who | Purpose |
|------|-----|---------|
| **Admin Panel** | Officers + super-admins | Approve `pending` users, promote/demote roles, ban/unban |
| **Support Dashboard** | Officers + super-admins | Ticket queue |
| **Site Analytics** (`/analytics`) | Super-admins | Visitors, tool-time, guest vs signed-in split, geo |
| **DB Actions** | Super-admins | Game-data update runbook reference; wipe all personal inventory; revoke RSI verification; reset buyer/fulfiller rep |
| **Discord** (modal) | Super-admins | Official webhook, queue status, coalesce minutes, manual send |

---

## Authentication & roles

| Role | Capabilities |
|------|----------------|
| **Offline** | Browse core tools + Archive; local storage; Bazaar listing-count teaser |
| **pending** | Signed in, awaiting officer approval; no marketplace or notifications |
| **member** | Full marketplace, BP Dumper, mining ledgers (with RSI verification), Discord webhooks |
| **officer** | Admin Panel, Support Dashboard, Site Total on Resource Tracker |
| **super-admin** | DB Actions, Analytics, Discord admin, site settings, org logo |

**Sign-in:** Google or Discord OAuth. Enable **Manual Linking** in Supabase Auth settings so members can connect both providers from Settings.

**RSI Handle verification** is required to post listings or trade on the Bazaar, register personal Discord webhooks, and use Mining Ledgers. Members get a short-lived code (`issue_rsi_verify_challenge`), paste it into their public RSI Bio, then the `validate-rsi-handle` Edge Function confirms it.

---

## Offline Mode

Signed-out visitors land on the public home page first. Choose **Browse tools offline** (or **Continue in Offline Mode**) to use tools in the browser without an account:

- Blueprints (acquired marks), Mission Tracker, Resource Tracker, Mining Tracker (RS + Guide), Archive, Bazaar listing-count teaser

Requires a free member account:

- My Listings, The Bazaar (shop/fulfill), BP Dumper + Live Tracker, Mining Ledgers, member directory / collection counts, cross-device sync

On **first sign-in** (welcome onboarding), valid offline data migrates to the account. Stale offline IDs from before an update are cleared automatically.

---

## BP Dumper (desktop)

Companion desktop app for blueprint farming — watches Star Citizen `Game.log` for blueprint unlocks and mission/session events.

| Item | Detail |
|------|--------|
| **Downloads** | GitHub releases — **`DumperApps.exe`** (single-file Windows exe, DR logo icon) |
| **Member setup** | Run portable exe → paste API key when prompted |
| **Source** | [`scripts/bp-dumper-py/`](scripts/bp-dumper-py/), [`scripts/installer/`](scripts/installer/) |
| **Releases** | [`scripts/bp-dumper/README.md`](scripts/bp-dumper/README.md) — semantic-release on `feat(dumper)` / `fix(dumper)` commits |
| **API key** | Per-user key in the BP Dumper modal (Settings / Mission Tracker); sent as `Authorization: Bearer dr_…` |
| **Webhook** | `log-watcher-webhook` Edge Function — blueprint acquire, mission sync, watch ping, game status |
| **Min game version** | Baked into each dumper build from `src/data/game-build-version.json` after parse |

**Watch mode** feeds: acquired blueprint sync, Live Mission Tracker, session status bar, and BP Dumper success notifications.

---

## Dumper's Fair-Value Price (DFP)

**Dumper's Fair-Value Price (DFP)** is **proprietary** to Michael Linzenmeyer. Production loads the official engine from `https://www.dumpers-repo.com` (`dfp-engine.js` + `dfp-version.json`). Do not tamper with, rehost, or replace the engine.

- Built from the private **dfp-engine-private** repository; this repo ships the pre-built bundle in `public/`
- Commodity/salvage Q0 bases refreshed via UEX Corp API (`npm run fetch-commodity-bases`)
- Super-admins may disable DFP display in Settings; the required opt-out footer appears on every page

---

## For developers

### Tech stack

React 19 · Vite 8 · TanStack Router / Query · Tailwind CSS 4 · Supabase (Auth, Postgres, RLS, Realtime, Edge Functions)

### Prerequisites

- Node **22+**, npm **11+** (see [`.nvmrc`](.nvmrc))
- Supabase project for auth and data
- Star Citizen `Data.p4k` + [StarBreaker](https://github.com/spectrumgt/StarBreaker) for game-data extraction (local, gitignored)

### Quick start

```bash
git clone <repo-url>
cd dumpers-repo
npm install
cp .env.example .env   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

1. Database — [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)  
   Apply migrations in numeric order through **`128_discord_market_webhook_url_dedupe.sql`**
2. Edge Functions — deploy all functions listed in `SUPABASE_SETUP.md` (including `log-watcher-webhook --no-verify-jwt`)
3. Enable **pg_cron** + **pg_net** if using automated Discord queue drain (migrations 065–068)
4. Promote your first super-admin (SQL in `SUPABASE_SETUP.md`)
5. Local dev: `npm run dev` → `http://localhost:5173`
6. Production build: `npm run build` → `dist/` (injects SEO meta, prerenders public routes for crawlers, writes `sitemap.xml` + `version.json`, regenerates `public/archive-guide.html`). First-time Playwright setup: `npx playwright install chromium`

### Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Public anon key (frontend only) |
| `VITE_BUILD_ID` | CI only | Build id baked into the client; compared to `version.json` so stale tabs show a refresh banner (set to `GITHUB_SHA` in deploy) |
| `VITE_DFP_ENGINE_BASE_URL` | Dev only | Override DFP host — **not for production** |

Never commit `service_role` keys. Edge Functions receive `SUPABASE_SERVICE_ROLE_KEY` automatically in Supabase.

### CI/CD

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| [ci.yml](.github/workflows/ci.yml) | PRs to `main` | Lint + build (no deploy) |
| [deploy.yml](.github/workflows/deploy.yml) | Push to `main` | Build + GitHub Pages deploy (official site) |
| [release-dumper.yml](.github/workflows/release-dumper.yml) | Dumper source changes on `main` | semantic-release version + tag |
| [build-releases.yml](.github/workflows/build-releases.yml) | `v*` tags | Upload Windows portable exe to GitHub Release |

### npm scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build + SEO prerender/sitemap + version stamp + archive guide |
| `npm run prerender-seo` | Re-prerender public routes into `dist/` (after `vite build`) |
| `npm run generate-sitemap` | Write `dist/sitemap.xml` |
| `npm run lint` | ESLint on `src/` |
| `npm run generate-archive-guide` | Regenerate `public/archive-guide.html` |
| `npm run validate-blueprints` | Catalog validation after parse |
| `npm run audit-hpp-mining-locations` | HPP spawn location audit |
| `npm run audit-mining-aliases` | Mining alias consistency |
| `npm run audit-ore-name-consistency` | Ore name cross-check |
| `npm run fetch-commodity-bases` | Refresh UEX Q0 commodity DFP bases |
| `npm run fetch-shop-data` | Refresh UEX commodity buy/sell locations for Commodity Lookup (`src/data/shop-commodity-index.json`) |
| `npm run verify-dfp-premiums` | Fail if DFP bundle/premiums are stale vs `game-blueprints.json` |
| `npm run sync-min-game-version` | Bake game major.minor into BP Dumper sources |
| `npm run release:dumper` | Manual semantic-release for BP Dumper |

Additional one-off audits live in `scripts/` (e.g. `audit-ore-location-coverage.mjs`, `audit-blueprint-mission-rewards.mjs`).

### Game data

Primary source: Star Citizen game files via StarBreaker. See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

```powershell
.\scripts\extract-game-data.ps1
npm run parse-game-data       # regenerate src/data/game-*.json from scratch (+ What's New → Supabase)
npm run push-whats-new        # retry pending What's New ingest if parse could not reach DB
npm run diff-game-data        # patch report: adds / removes / renames / stat changes vs last commit
npm run patch-audit           # full audit battery: data consistency + math verifiers + diff
# After parse (when blueprints changed): npm run build in sibling dfp-engine-private, then commit public/dfp-engine.js + dfp-version.json
npm run sync-min-game-version # optional: update dumper min game version in source
```

All game catalogs (mining guide, ordnance, components, blueprints) are bundled from the parsed `game-*.json` at build time — no Supabase sync step on patch day.

Full patch-day runbook (including how to verify removals vs CIG moving records around): [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md#data-update-process).

**Generated app files** (`src/data/`):

| File | Contents |
|------|----------|
| `game-blueprints.json` | Blueprint catalog + crafting recipes |
| `game-blueprint-missions.json` | Mission → blueprint reward mappings |
| `game-mining.json` | Ore stats, RS base signatures, mining lasers |
| `game-mining-locations.json` | Ore/location compendium + aliases |
| `game-mining-spawns.json` | Per-site spawn weights and cluster profiles |
| `game-components.json` | Ship components |
| `game-ordnance.json` | Missiles and torpedoes (Archive Ordnance tab) |
| `game-fps-weapons.json` | FPS weapon stats |
| `game-salvage-modules.json` | Salvage modules |
| `game-manufacturers.json` | Manufacturer names/codes |
| `game-build-version.json` | Extracted build (`version` for BP Dumper min; `launcherVersion` for header, e.g. `4.9.0-live.…`) |
| `game-reputation.json` | Faction standings and mission brokers |
| `game-quality-bands.json` | Crafting quality curves |
| `game-lore.json` | Archive resource/item lore |
| `dfp-commodity-bases.json` | UEX-backed Q0 bases |
| `shop-commodity-index.json` | UEX-backed commodity buy/sell locations, per-SCU prices, and box sizes (Commodity Lookup) |
| `blueprint-name-lookup.json` | BP Dumper / webhook Game.log name resolution (canonical; copies at build/deploy) |

What's New ticker digests are **not** bundled JSON — parse appends `extracted-data/whats-new-pending.jsonl`, pushes via `ingest_whats_new_entries` (deduped by `issue_key` + `version`), then wipes the file. Rows expire after 7 days (`cleanup_expired_whats_new` daily cron). Apply migration `129_whats_new_ticker.sql`.

The **DB Actions** modal shows super-admins the extract → parse → deploy runbook for reference; the steps themselves run locally in a terminal on a machine with the game files and this repo.

### Repository layout

```
src/           React app (routes, components, hooks, lib, data)
public/        Static assets, DFP bundle, archive-guide.html
scripts/       Extraction, parsing, audits, BP Dumper sources
supabase/      SQL migrations + Edge Functions
docs/          Setup and data-source guides
dist/          Production build output (gitignored in dev; CI artifact)
```

### Hosting

Host `dist/` with SPA fallback (`index.html` for unknown paths). GitHub Actions deploys the official site to GitHub Pages. Operator deploy notes: [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

---

## Documentation

| Doc | Audience | Topic |
|-----|----------|-------|
| [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) | Maintainers | Migrations, Edge Functions, OAuth, BP Dumper API |
| [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) | Maintainers | Deploy `dist/`, branding, env secrets |
| [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) | Maintainers | Game extraction paths and generated JSON |
| [scripts/bp-dumper/README.md](scripts/bp-dumper/README.md) | Maintainers | BP Dumper release process |
| [LICENSE](LICENSE) | Everyone | Proprietary terms — official site only |
| [TRADEMARK.md](TRADEMARK.md) | Everyone | Brand usage |

Internal/historical notes also exist under `docs/` (Discord migration notes, stack revert playbook).

---

## Ownership

Dumper's Repo is owned by **Michael Linzenmeyer** (RSI: Sinedrone_Sentinel). The only authorized public deployment is [dumpers-repo.com](https://www.dumpers-repo.com). See [LICENSE](LICENSE) and [TRADEMARK.md](TRADEMARK.md).

---

## Disclaimer

Not affiliated with Cloud Imperium Games. Star Citizen is a trademark of Cloud Imperium Games.
