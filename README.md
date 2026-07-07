# Dumper's Repo

**Buy. Craft. Sell.** — Blueprint tracking, mining tools, resource coordination, and a member marketplace for Star Citizen orgs.

**Reference deployment:** [dumpers-repo.com](https://www.dumpers-repo.com) (Black Star, operated by Michael Linzenmeyer / RSI `Sinedrone_Sentinel`). Other hosts running this codebase are separate franchise instances.

## Features

### Core tools

- **Blueprints** — Crafting catalog, acquired tracking, member collection directory, mission acquisition paths per blueprint
- **Mission Tracker** — Personal target blueprint list; browse faction mission pools with location/rep tags; mission checklist
- **Live Mission Tracker** (`/targets/live`) — Real-time in-game missions and remaining pool blueprints while **BP Dumper** watches your `Game.log` (session status bar: PU connected, menu quit, crash recovery)
- **Resource Tracker** — Per-member stock by quality band (SCU), notes, **Site Total** rollup, super-admin catalog sync
- **Mining Tracker** — RS signature reference, **Mining Guide** (by ore / by location), **Rock Calculator** (cSCU from composition), optional **Mining Ledgers** for crew payout splits (RSI-verified members)
- **Info Archive** — Components, ordnance, factions, resource lore, and site guides

### Marketplace (members only)

- **Custom Orders** — One **New Order** form for both listing types:
  - **WTB** (Submit Buy Order) — request crafted items or supplied resources
  - **WTS** (Submit Sell Order) — offer stock or crafted items you have on hand
  - DFP-priced lines, reputation gates, edit or delete while pending
- **Fulfillment** — Browse pending **WTB** and **WTS** listings with All/WTB/WTS filters; accept to craft for buyers or purchase from sellers; optional inventory deduct; ratings and archive

Both marketplace pages share one reputation system (buyer rep + fulfiller/seller rep). RSI Handle verification is required to post or accept.

### BP Dumper (desktop)

Companion app for blueprint farming — parses `Game.log` for blueprint drops and active missions. **Watch mode** + a per-user **API key** (Settings) feeds the **Live Mission Tracker**. Pre-built releases for Windows, macOS, and Linux; source in `scripts/bp-dumper-go/` and `scripts/bp-dumper-py/`. See [scripts/bp-dumper/README.md](scripts/bp-dumper/README.md).

### Offline Mode (no account)

Try most tools in the browser before signing up: blueprints, Mission Tracker, Resource Tracker, Mining Tracker, and Archive. Offline progress migrates to your account on first sign-in.

**Fulfillment teaser:** Offline users can open Fulfillment to see how many orders are waiting (count only — sign in to browse details or accept).

Custom Orders, mining ledgers, and accepting trades require a free member account.

### Community & admin

- **Notifications** — Header bell; dismiss deletes the row
- **Discord Webhooks** — Paste your channel webhook at `/discord-subscribe` for personal deal alerts, opt-in marketplace feed, and support ticket updates
- **Discord + Google OAuth** — Sign in with either provider; manual linking in Settings
- **Support tickets** — Member bug reports; officer **Support Dashboard**
- **Roles** — `pending` → officer approval → `member` / `officer` / `super-admin`
- **Ghost Mode** — Hide from member directory; keeps personal tools, hides orders/fulfillment
- **Site Analytics** — Super-admin tool usage and visitor stats (`/analytics`)
- **Admin** — Approve users, roles, ban/unban; super-admin **DB Actions** (game data extract/parse/deploy)

## Tech stack

React 19, Vite 8, TanStack Router/Query, Tailwind CSS 4, Supabase (Auth + Postgres + RLS + Edge Functions).

| Workflow | File |
|----------|------|
| CI (lint + build) | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |
| Deploy reference site | [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) |
| BP Dumper releases | [`.github/workflows/release-dumper.yml`](.github/workflows/release-dumper.yml) |

Production deploys on push to `main` via GitHub Pages (reference instance only).

## Quick start

1. Clone and `npm install` (Node **22+**, npm **11+** — see `.nvmrc`)
2. Copy `.env.example` → `.env` with your Supabase URL and anon key
3. Set up the database — see [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)
   - **Existing databases:** apply incremental migrations in numeric order through **`113_dumper_game_status.sql`**
4. Deploy Edge Functions listed in `SUPABASE_SETUP.md` (including `log-watcher-webhook` for Live Mission Tracker)
5. `npm run dev` for local development
6. `npm run build` to produce `dist/` for any static host

## Hosting

Host `dist/` on **any** static file provider (GitHub Pages, Cloudflare, nginx, S3, etc.). GitHub Actions in this repo deploys the reference instance to GitHub Pages only.

Franchise branding (org logo) is uploaded via super-admin **Settings → Site**, not git — see [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

## Game data

Blueprint, mining, component, reputation, and Archive lore data come from direct Star Citizen game file extraction (StarBreaker). After a patch:

```powershell
.\scripts\extract-game-data.ps1
node scripts/parse-extracted-data.mjs
node scripts/sync-game-data-to-db.mjs   # optional: push game_mining etc. to Supabase
```

Output lives in `src/data/game-*.json`. Super-admins can also run extract → parse → deploy from **DB Actions**. See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

Useful audits after mining location changes:

```bash
npm run audit-hpp-mining-locations
node scripts/audit-ore-location-coverage.mjs
```

## Dumpers Fair-Value Pricing (DFP)

**Dumper's Fair-Value Price (DFP)** is **proprietary** to Michael Linzenmeyer. Production franchises must load the official engine from `https://www.dumpers-repo.com` (`dfp-engine.js` + `dfp-version.json`). Do not tamper with or replace the engine.

The engine is built from the private **dfp-engine-private** repository (not public). This repo ships the pre-built bundle in `public/`.

Super-admins may **disable DFP display** in Settings; the required opt-out footer notice appears on every page.

## Franchise policy

Dumper's Repo is owned and licensed by **Michael Linzenmeyer** (RSI: Sinedrone_Sentinel). You may run a **free** franchise for your org under [LICENSE](LICENSE):

- Keep the **Dumper's Repo** header
- **Do not charge** members to use the app
- **Do not tamper with** DFP
- Ship unmodified [LICENSE](LICENSE) and [TRADEMARK.md](TRADEMARK.md)

See [TRADEMARK.md](TRADEMARK.md) for brand rules.

## Disclaimer

Not affiliated with Cloud Imperium Games. Star Citizen is a trademark of Cloud Imperium Games.
