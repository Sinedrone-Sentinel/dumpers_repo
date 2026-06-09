# Dumper's Repo

**Buy. Craft. Sell.** — Blueprint tracking, resource coordination, custom orders, and fulfillment for Star Citizen orgs.

**Reference deployment:** [dumpers-repo.com](https://www.dumpers-repo.com) (Black Star, operated by Michael Linzenmeyer / RSI `Sinedrone_Sentinel`). Other hosts running this codebase are separate franchise instances.

## Features

- **Blueprints** — Browse the catalog, mark acquired blueprints, member collection directory
- **Target BP List** — Personal wishlist synced to Supabase
- **Resource Tracker** — Per-member stock (quality-tier SCU), **Site Total** live rollup, super-admin catalog sync
- **Custom Orders** — Multi-blueprint DFP-priced buy orders with resource lines, reputation gates, edit/abandon while pending
- **Fulfillment** — Accept, craft, optional inventory deduct, ratings, archive
- **Notifications** — Header bell; dismiss deletes the row
- **Roles** — Google OAuth; `pending` → officer approval → `member` / `officer` / `super-admin`
- **Ghost Mode** — Hide from member directory
- **Admin** — Approve users, roles, ban/unban; super-admin DB Actions (resource wipe)

## Tech stack

React 18, Vite, TanStack Router/Query, Tailwind, Supabase (Auth + Postgres + RLS + RPCs).

## Quick start

1. Clone and `npm install`
2. Copy `.env.example` → `.env` with your Supabase URL and anon key
3. Set up the database — see [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)
4. `npm run dev` for local development
5. `npm run build` to produce `dist/` for any static host

## Hosting

Host `dist/` on **any** static file provider (GitHub Pages, Cloudflare, nginx, S3, etc.). GitHub Actions in this repo deploys the reference instance to GitHub Pages only.

## Blueprint data

```bash
npm run fetch-blueprints
npm run validate-blueprints
```

Catalog lives in `src/data/Blueprints.json`.

## Dumpers Fair-Value Pricing (DFP)

DFP is **proprietary** to Michael Linzenmeyer. Production franchises must load the official engine from `https://www.dumpers-repo.com` (`dfp-engine.js` + `dfp-version.json`). Do not tamper with or replace the engine.

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
