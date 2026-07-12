# Dumper's Repo

**Buy. Craft. Sell.** — Blueprint tracking, mining tools, resource coordination, and a member marketplace for Star Citizen.

**Reference deployment:** [dumpers-repo.com](https://www.dumpers-repo.com) (Black Star, operated by Michael Linzenmeyer / RSI `Sinedrone_Sentinel`). Other hosts running this codebase are separate franchise instances.

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
- [Franchise policy](#franchise-policy)
- [Disclaimer](#disclaimer)

---

## What is Dumper's Repo?

A static React SPA backed by Supabase. Members browse a game-data-driven blueprint catalog, track missions and resources, run mining reference tools, and trade through a DFP-priced marketplace. Officers approve sign-ups and handle support; super-admins manage game-data refreshes, Discord delivery, and site-wide settings.

Member-facing how-tos live in the in-app **Info Archive** (`/archive`) and the printable offline guide at [`public/archive-guide.html`](public/archive-guide.html) (regenerated on each production build).

---

## Site map

| Route | Page | Access |
|-------|------|--------|
| `/` | Blueprints | Offline + members |
| `/targets` | Mission Tracker | Offline + members |
| `/targets/live` | Live Mission Tracker | Members (BP Dumper watch mode) |
| `/resources` | Resource Tracker | Offline + members |
| `/mining-tracker` | Mining Tracker | Offline + members |
| `/orders` | Custom Orders | Approved members |
| `/fulfillment` | Fulfillment | Approved members (offline: pending count only) |
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
- Add blueprints to a session **order draft** (continues on Custom Orders) or **target list** (Mission Tracker)
- Optional **Display** setting: group FPS weapon and armor variants into expandable family cards (off by default)
- **BP Dumper** syncs acquired marks from `Game.log` automatically

### Mission Tracker (`/targets`)

- **My Tracker** — personal wishlist of blueprints you are grinding toward
- **Browse Missions** — pick a faction, browse mission pools with location/rep/category tags and X/X progress per location
- Investigation, collection, and bounty mission families (including Hathor PAF sites) with color-coded tag legend
- Header shortcuts: **BP Dumper** (setup + API key) and **Live Tracker** (`/targets/live`)
- Dismissible callout explains the BP Dumper + Live Tracker workflow

### Live Mission Tracker (`/targets/live`)

- Real-time columns: **active in-game missions** (left) and **pool blueprints still to acquire** (right)
- Requires **BP Dumper** in watch mode with your personal API key
- **Session status bar**: connected in the PU, quit to menu, game closed, crash recovery window (one hour), reconnected
- Uses Supabase Realtime on `dumper_active_missions`; clears when watch mode stops

### Resource Tracker (`/resources`)

- Log personal stock by resource and **quality band** (SCU); optional per-row notes
- **Cards** view (edit quantities) and **List** view (read-only overview)
- Mined/refined ore uses bands Q500–Q1000; salvage and trade goods use fixed **Purchased (Q0)** tiers
- **Site Total** rollup (officers and super-admins only) — org-wide inventory aggregate
- Super-admins can sync the resource catalog from game data via **DB Actions**

### Mining Tracker (`/mining-tracker`)

Three tabs — **RS Tracker**, **Mining Guide**, and **Ledgers** (RSI-verified).

**RS Tracker**

- Reference grid of base RS signatures and cluster spawn odds; track up to two cards per ore (Surface / Asteroid) plus optional per-site location cards
- Click a tracked card to load ore, location, and expected composition into the **Rock Calculator** sidebar
- **Rock Calculator** — enter HUD mass, resistance, instability, SCU, and material %; inert auto-fills; Q bands per row for ledger export; DFP shown at purchased (Q0)
- **Smart Cracker** — automated crack advisor using the rock in your calculator: breakability warnings, throttle/head suggestions (solo or Mole crew), gadget recommendations; saved loadouts per ship (sign-in; RSI verification not required)

**Mining Guide**

- **By Ore** — rarity filters, location chips, spawn/cluster/composition tooltips
- **By Location** — all ores at each mineable site; Overall summaries for broad regions

**Ledgers** (RSI-verified members)

- Crew payout books: mining runs, shares, deductibles, partial payments, JSON export/import, access sharing, in-app payout notifications
- Lifetime **site totals** for closed crew ledgers

Game mining data is bundled with the site (see [Game data](#game-data)).

### Custom Orders (`/orders`)

Single **New Order** builder for both listing types:

- **WTB** (Submit Buy Order) — request crafted items or supplied resources at DFP
- **WTS** (Submit Sell Order) — offer stock on hand; **partial purchases** allowed by default, or require full-listing purchase
- WTS list-price sliders: ±20% per line (partial) or ±10% on order total (full listing); 0% = DFP base
- Expand cart lines to set per-slot material qualities; live DFP total and stat preview
- Tabs: pending, active, completed, archive — edit/delete while pending; confirm pickup; **Archive & rate** after completion
- Requires **verified RSI Handle**; pending-member buyer/seller limits apply

### Fulfillment (`/fulfillment`)

- Filter **All / WTB / WTS**
- Accept WTB to craft for buyers; buy WTS full listings or partial line quantities
- Each partial WTS purchase spawns a full child order (same handoff, deadlines, ratings)
- Seller actions on-card: start handoff, mark ready, cancel/release
- **Reputation badges** show buyer rep, fulfiller/seller rep, and average delivery time (after 5 completed trades)
- Offline users see pending-order **count only** — sign in to browse or accept

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
- **Marketplace activity** (opt-in) — new/changed listings from other members; coalesced digests for post/cancel bursts
- **Support** — staff replies and resolved tickets
- Per-event URLs; no self-echo on your own posts
- Super-admins configure org-wide Discord queue, coalesce window, and manual drain from the **Discord** admin modal

### Support

- Members file tickets from the avatar menu (bugs, behavior reports, RSI verification help)
- Officers use **Support Dashboard** (`/support-dashboard`) — respond, escalate, rate resolution
- Ticket data is deleted after resolution

### Settings (avatar menu)

**All approved members**

- RSI Handle entry and validation against robertsspaceindustries.com
- **Connected Accounts** — link Google and Discord (auto-merge when emails match)
- **Deduct inventory on craft complete** — optional WTB fulfillment material deduct from Resource Tracker
- **Group FPS blueprint variants** — Blueprints page display preference
- **My Data** — wipe acquired blueprints or tracked resources
- Delete account (blocked while active orders exist)

**Super-admin only (same Settings modal)**

- Toggle **DFP display** site-wide (required opt-out footer when disabled)
- **Auto-approve** new sign-ups
- **Welcome modal** always-show (testing)
- Upload **org logo** (`ORG_LOGO.png` in Supabase Storage) — franchise branding, not git

### Administration

| Tool | Who | Purpose |
|------|-----|---------|
| **Admin Panel** | Officers + super-admins | Approve `pending` users, promote/demote roles, ban/unban |
| **Support Dashboard** | Officers + super-admins | Ticket queue |
| **Site Analytics** (`/analytics`) | Super-admins | Visitors, tool-time, guest vs signed-in split, geo |
| **DB Actions** | Super-admins | Game data extract/parse/deploy; wipe all personal inventory; revoke RSI verification; reset buyer/fulfiller rep |
| **Discord** (modal) | Super-admins | Official webhook, queue status, coalesce minutes, manual send |

---

## Authentication & roles

| Role | Capabilities |
|------|----------------|
| **Offline** | Browse core tools + Archive; local storage; Fulfillment count teaser |
| **pending** | Signed in, awaiting officer approval; no marketplace or notifications |
| **member** | Full marketplace, BP Dumper, mining ledgers (with RSI verification), Discord webhooks |
| **officer** | Admin Panel, Support Dashboard, Site Total on Resource Tracker |
| **super-admin** | DB Actions, Analytics, Discord admin, site settings, org logo |

**Sign-in:** Google or Discord OAuth. Enable **Manual Linking** in Supabase Auth settings so members can connect both providers from Settings.

**RSI Handle verification** is required to post or accept Custom Orders, register personal Discord webhooks, and use Mining Ledgers. Validated via the `validate-rsi-handle` Edge Function.

---

## Offline Mode

Works without an account in the browser:

- Blueprints (acquired marks), Mission Tracker, Resource Tracker, Mining Tracker (RS + Guide), Archive, Fulfillment pending-count teaser

Requires a free member account:

- Custom Orders, Fulfillment browse/accept, BP Dumper + Live Tracker, Mining Ledgers, member directory / collection counts, cross-device sync

On **first sign-in** (welcome onboarding), valid offline data migrates to the account. Stale offline IDs from before an update are cleared automatically.

---

## BP Dumper (desktop)

Companion desktop app for blueprint farming — watches Star Citizen `Game.log` for blueprint unlocks and mission/session events.

| Item | Detail |
|------|--------|
| **Downloads** | GitHub releases — **`DumperApps-Setup-X.Y.Z.exe`** (Windows, recommended); portable zip for advanced users |
| **Member setup** | Run installer → Start Menu **Dumper Apps** → paste API key |
| **Source** | [`scripts/bp-dumper-go/`](scripts/bp-dumper-go/), [`scripts/bp-dumper-py/`](scripts/bp-dumper-py/) |
| **Releases** | [`scripts/bp-dumper/README.md`](scripts/bp-dumper/README.md) — semantic-release on `feat(dumper)` / `fix(dumper)` commits |
| **API key** | Per-user key in the BP Dumper modal (Settings / Mission Tracker); sent as `Authorization: Bearer dr_…` |
| **Webhook** | `log-watcher-webhook` Edge Function — blueprint acquire, mission sync, watch ping, game status |
| **Min game version** | Baked into each dumper build from `src/data/game-build-version.json` after parse |

**Watch mode** feeds: acquired blueprint sync, Live Mission Tracker, session status bar, and BP Dumper success notifications.

---

## Dumper's Fair-Value Price (DFP)

**Dumper's Fair-Value Price (DFP)** is **proprietary** to Michael Linzenmeyer. Production franchises must load the official engine from `https://www.dumpers-repo.com` (`dfp-engine.js` + `dfp-version.json`). Do not tamper with or replace the engine.

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
   Apply migrations in numeric order through **`114_cleanup_legacy_db_objects.sql`**
2. Edge Functions — deploy all functions listed in `SUPABASE_SETUP.md` (including `log-watcher-webhook --no-verify-jwt`)
3. Enable **pg_cron** + **pg_net** if using automated Discord queue drain (migrations 065–068)
4. Promote your first super-admin (SQL in `SUPABASE_SETUP.md`)
5. Local dev: `npm run dev` → `http://localhost:5173`
6. Production build: `npm run build` → `dist/` (also writes `dist/version.json` and regenerates `public/archive-guide.html`)

### Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Public anon key (frontend only) |
| `VITE_BUILD_ID` | CI only | Cache busting (set to `GITHUB_SHA` in deploy workflow) |
| `VITE_DFP_ENGINE_BASE_URL` | Dev only | Override DFP host — **not for production franchises** |

Never commit `service_role` keys. Edge Functions receive `SUPABASE_SERVICE_ROLE_KEY` automatically in Supabase.

### CI/CD

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| [ci.yml](.github/workflows/ci.yml) | PRs to `main` | Lint + build (no deploy) |
| [deploy.yml](.github/workflows/deploy.yml) | Push to `main` | Build + GitHub Pages deploy (reference instance) |
| [release-dumper.yml](.github/workflows/release-dumper.yml) | Dumper source changes on `main` | semantic-release version + tag |
| [build-releases.yml](.github/workflows/build-releases.yml) | `v*` tags | Upload BP Dumper executables to GitHub Release |

### npm scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build + version stamp + archive guide |
| `npm run lint` | ESLint on `src/` |
| `npm run generate-archive-guide` | Regenerate `public/archive-guide.html` |
| `npm run validate-blueprints` | Catalog validation after parse |
| `npm run audit-hpp-mining-locations` | HPP spawn location audit |
| `npm run audit-mining-aliases` | Mining alias consistency |
| `npm run audit-ore-name-consistency` | Ore name cross-check |
| `npm run fetch-commodity-bases` | Refresh UEX Q0 commodity DFP bases |
| `npm run sync-min-game-version` | Bake game major.minor into BP Dumper sources |
| `npm run release:dumper` | Manual semantic-release for BP Dumper |

Additional one-off audits live in `scripts/` (e.g. `audit-ore-location-coverage.mjs`, `audit-blueprint-mission-rewards.mjs`).

### Game data

Primary source: Star Citizen game files via StarBreaker. See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

```powershell
.\scripts\extract-game-data.ps1
npm run parse-game-data       # regenerate src/data/game-*.json from scratch
npm run diff-game-data        # patch report: adds / removes / renames / stat changes vs last commit
npm run patch-audit           # mining aliases + ore names + blueprint sanity + diff
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
| `game-reputation.json` | Faction standings and mission brokers |
| `game-quality-bands.json` | Crafting quality curves |
| `game-lore.json` | Archive resource/item lore |
| `dfp-commodity-bases.json` | UEX-backed Q0 bases |
| `blueprint-name-lookup.json` | BP Dumper / webhook Game.log name resolution (canonical; copies at build/deploy) |

Super-admins can run extract → parse → deploy from **DB Actions** without a local toolchain on every machine.

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

Host `dist/` on any static provider with SPA fallback (`index.html` for unknown paths). GitHub Actions deploys the reference instance to GitHub Pages only.

Franchise hosts: see [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) for Cloudflare, nginx, S3, secrets, and org logo upload.

---

## Documentation

| Doc | Audience | Topic |
|-----|----------|-------|
| [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) | Hosts | Migrations, Edge Functions, OAuth, BP Dumper API |
| [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md) | Hosts | Deploy `dist/`, branding, env secrets |
| [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) | Maintainers | Game extraction paths and generated JSON |
| [scripts/bp-dumper/README.md](scripts/bp-dumper/README.md) | Maintainers | BP Dumper release process |
| [LICENSE](LICENSE) | Hosts | Franchise terms |
| [TRADEMARK.md](TRADEMARK.md) | Hosts | Brand usage |

Internal/historical notes also exist under `docs/` (Discord migration notes, stack revert playbook).

---

## Franchise policy

Dumper's Repo is owned and licensed by **Michael Linzenmeyer** (RSI: Sinedrone_Sentinel). You may run a **free** franchise for your org under [LICENSE](LICENSE):

- Keep the **Dumper's Repo** header
- **Do not charge** members to use the app
- **Do not tamper with** DFP
- Ship unmodified [LICENSE](LICENSE) and [TRADEMARK.md](TRADEMARK.md)

See [TRADEMARK.md](TRADEMARK.md) for brand rules.

---

## Disclaimer

Not affiliated with Cloud Imperium Games. Star Citizen is a trademark of Cloud Imperium Games.
