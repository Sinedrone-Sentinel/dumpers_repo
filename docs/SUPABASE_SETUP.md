# Supabase setup

Use this guide when standing up or catching up the **official** Dumper's Repo Supabase database with migrations.

## If you already have a live database

1. **Do not** re-run the squashed baseline (`001`–`006`) or migrations you have already applied.
2. If you previously ran incremental migrations `001`–`041` from `supabase/migrations_legacy/`, your starting point for this repo is **`042_site_settings.sql`** onward.
3. In **SQL Editor**, run only the migration files you are **missing**, **in numeric order** (see full list below).
4. Each file is idempotent where practical. Errors about existing objects usually mean that step already ran — verify with the sanity checks at the end.

**Latest migration:** `131_questionnaire_public_poll_ticker.sql` (Public questionnaire polls publish option tallies to the Updates ticker on archive/expiry). Apply through `131` in numeric order if catching up. Also redeploy `send-discord` if you have not yet applied `130`.

---

## 1. Create a Supabase project

1. [supabase.com](https://supabase.com) → New project
2. Note **Project URL** and **anon public** key for `.env`
3. Note **service_role** key (Settings → API) — needed for Edge Functions; keep secret

---

## 2. Enable Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URIs:
   - `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
   - Your app origin(s) for local dev: `http://localhost:5173`
4. Copy the **Client ID** and **Client Secret**
5. In Supabase: Authentication → Providers → Google → Enable
6. Paste Client ID and Client Secret
7. Add your app origin(s) to Site URL and Redirect URLs

---

## 2b. Enable Discord OAuth

1. Go to [Discord Developer Portal](https://discord.com/developers/applications) → New Application
2. Under OAuth2, note the **Client ID** and generate a **Client Secret**
3. Add redirect URI: `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
4. In Supabase: Authentication → Providers → Discord → Enable
5. Paste Client ID and Client Secret
6. Ensure your Site URL and Redirect URLs include your app origin(s)

> Supabase maps Discord's `global_name` to `full_name` in `raw_user_meta_data`. The existing `handle_new_user` trigger reads `full_name` and populates `display_name` automatically — no changes needed.

---

## 2c. Account linking (Google + Discord)

Members can use **one account** with multiple sign-in methods:

1. **Authentication → Settings → Enable Manual Linking** — required for Connect / Disconnect in app Settings
2. **Automatic linking** (on by default) — when Google and Discord share the same **verified** email, Supabase links them to the same user on first sign-in (works both directions). No duplicate profile is created.
3. **Discord email scope** — the Discord OAuth app must allow email; the app requests `identify email` so auto-merge can match addresses.

Manual linking: a signed-in member can connect an additional provider from **Settings → Connected Accounts**, even when emails differ. At least one sign-in method must remain connected.

---

## 3. Run SQL migrations

In **SQL Editor**, run these files **in order** from `supabase/migrations/`:

| # | File | Summary |
|---|------|---------|
| 1 | `001_core_profiles_auth.sql` | Profiles, auth trigger |
| 2 | `002_bans_admin.sql` | Ban infrastructure |
| 3 | `003_blueprints_catalog.sql` | Blueprint resources catalog |
| 4 | `004_resource_tracker.sql` | Personal inventory, site totals |
| 5 | `005_orders_schema.sql` | Custom orders system |
| 6 | `006_access_rls_functions.sql` | RLS policies, access functions |
| 7 | `042_site_settings.sql` | Site-wide settings (DFP display toggle) |
| 8 | `043_blueprint_order_overrides.sql` | Blueprint orderable overrides |
| 9 | `044_auto_approve_setting.sql` | Auto-approve new signups toggle |
| 10 | `045_remove_preview_features.sql` | Opens preview-gated features to all members |
| 11 | `046_starstrings_data.sql` | Legacy reference data tables (later renamed in 075) |
| 12 | `047_public_auto_approve_read.sql` | Public read for auto-approve status (login page) |
| 13 | `048_blueprints_sync.sql` | Legacy `synced_blueprints` table (dropped in 079) |
| 14 | `049_welcome_modal.sql` | Welcome onboarding (`has_seen_welcome`, always-show setting) |
| 15 | `050_rsi_handle_verification.sql` | RSI Handle verification |
| 16 | `051_support_tickets.sql` | Support ticket system |
| 17 | `052_order_creation_notify.sql` | Notify members on new custom order |
| 18 | `053_pending_rep_limits.sql` | Pending rep order limits + RSI enforcement |
| 19 | `054_order_abuse_prevention.sql` | Min order value, duplicate detection, abuse reports |
| 20 | `055_order_timeouts.sql` | 72h timeouts, rating deadlines, disputes, strikes |
| 21 | `056_officer_rep_immunity.sql` | Officers/super-admins exempt from pending rep limits |
| 22 | `057_guest_preview_anon_read.sql` | Anonymous read for archive reference data |
| 23 | `058_officer_ratings_escalation.sql` | Officer ticket ratings + escalation |
| 24 | `059_mining_tracker.sql` | Mining Tracker entries (member sync) |
| 25 | `060_shop_data.sql` | *(Historical)* Shop tables — dropped by `087` |
| 26 | `061_discord_integration.sql` | Discord webhook integration + message queue |
| 27 | `062_granular_order_events.sql` | Granular Discord order event subscriptions |
| 28 | `063_user_webhook_management.sql` | User-managed Discord webhooks (4 max) |
| 29 | `064_rename_order_fulfilled.sql` | Rename Discord “Order Fulfilled” → “Order Accepted” |
| 30 | `065_discord_cron_job.sql` | pg_cron job to drain Discord queue |
| 31 | `066_fix_queue_status_rpc.sql` | Fix `get_discord_queue_status` RPC |
| 32 | `067_discord_cron_1min.sql` | Discord cron interval → 1 minute |
| 33 | `068_discord_cron_config.sql` | Discord cron config in `app_config` table |
| 34 | `069_order_slot_qualities.sql` | Per-slot quality on order blueprint lines |
| 35 | `070_slot_qualities_rpc.sql` | RPC updates for slot qualities on create/edit |
| 36 | `071_new_user_discord_notification.sql` | Discord notification on new sign-ups |
| 37 | `072_inventory_note_field.sql` | Note field on personal resource inventory |
| 38 | `073_blueprint_owner_counts.sql` | Blueprint owner count RPC for order UI |
| 39 | `074_resource_lore.sql` | Resource lore/description column |
| 40 | `075_game_data_tables.sql` | *(Historical)* Rename `starstrings_*` → `game_*` tables — dropped by `118` |
| 41 | `076_game_data_anon_read.sql` | *(Historical)* Anonymous read on `game_*` tables — dropped by `118` |
| 42 | `077_guest_pending_order_count.sql` | `get_pending_custom_order_count()` for Offline Fulfillment teaser |
| 43 | `078_order_listing_type.sql` | WTB/WTS `listing_type`, semantic buyer/seller RPCs |
| 44 | `079_drop_synced_blueprints.sql` | Drop legacy `synced_blueprints` (sccrafter era) |
| 45 | `080_discord_personal_routing.sql` | Personal + marketplace Discord routing, server-side triggers |
| 46 | `081_rsi_org_schema.sql` | *(Historical)* RSI multi-org tables — dropped by `114` (not site org logo / Discord admin) |
| 47 | `082_discord_market_coalesce.sql` | Marketplace listing churn coalesce + admin quiet-period setting |
| 48 | `083_discord_per_event_webhooks.sql` | Remove webhook cap; per-event sync RPC; return URLs to owner |
| 49 | `084_discord_rsi_personal_webhooks.sql` | Require RSI verification for `my_order_*` webhook registration |
| 50 | `085_shop_socpak_fields.sql` | *(Historical)* Shop socpak fields — dropped by `087` |
| 51 | `086_shop_shelf_vendors.sql` | *(Historical)* Shop shelf vendors — dropped by `087` |
| 52 | `087_drop_shop_data.sql` | Drop shop tables and RPCs (Shops feature removed from app) |
| 53 | `088_mining_tracker_location.sql` | Mining tracker location field |
| 54 | `089_org_logo.sql` | Supabase Storage bucket + super-admin org logo (`ORG_LOGO.png`) |
| 55 | `090_order_line_snapshot.sql` | Blueprint line display snapshot for fulfillment + Discord embeds |
| 56 | `091_wts_partial_purchase.sql` | Partial WTS purchases; listing stays open across child orders |
| 57 | `092_discord_embed_delivery_fix.sql` | Fix oversized Discord embeds + partial-abandon routing |
| 58 | `093_discord_queue_held_status.sql` | Coalesce-held vs ready-to-send Discord queue status |
| 59 | `094_format_dfp_auec_plain.sql` | Drop "(DFP required)" suffix from formatted prices |
| 60 | `095_mining_ledger.sql` | Mining crew payout ledgers + collaborators |
| 61 | `096_mining_ledger_rsi_lookup.sql` | Ledger RSI handle lookup; verified-member-only access |
| 62 | `097_mining_ledger_notifications.sql` | In-app notifications for ledger access, close, payouts |
| 63 | `098_mining_ledger_total_payout.sql` | Total payout RPC (ore profit − deductibles + other) |
| 64 | `099_mining_ledger_gem_profit.sql` | Gem profit: whole-unit count × price per gem |
| 65 | `100_mining_ledger_gem_sold_as_is.sql` | Gems sold as-is: unrefined cSCU only |
| 66 | `101_mining_ledger_partial_payout_notifications.sql` | Notify crew when paid-so-far increases |
| 67 | `102_site_analytics.sql` | Anonymous visitor + tool-time analytics (super-admin dashboard) |
| 68 | `103_fix_wts_partial_deplete_line.sql` | Fix partial WTS when buyer depletes an entire line |
| 69 | `104_group_blueprint_variants.sql` | Per-user FPS weapon/armor variant grouping on Blueprints |
| 70 | `105_analytics_audience_split.sql` | Split analytics by guest vs signed-in audience |
| 71 | `106_analytics_geo.sql` | Approximate visitor geography from IP (no raw IP stored) |
| 72 | `107_member_avg_ttd.sql` | Average fulfiller/seller delivery time on reputation |
| 73 | `108_wts_list_price_bounds.sql` | WTS list price bounds (±20% per line / ±10% full listing) |
| 74 | `109_mining_ledger_site_stats.sql` | Lifetime stats for archived mining ledgers |
| 75 | `110_user_api_keys.sql` | User API keys for external tool auth (Log Watcher webhook) |
| 76 | `111_user_data_wipe.sql` | Settings → My Data: wipe acquired blueprints / tracked resources |
| 77 | `112_dumper_live_tracker.sql` | BP Dumper live missions + watch session flags (Realtime) |
| 78 | `113_dumper_game_status.sql` | BP Dumper in-game session status for live tracker status bar |
| 79 | `114_cleanup_legacy_db_objects.sql` | Drop legacy RPCs, ghost_mode, RSI multi-org schema, game_components, shop remnants |
| 80 | `115_mining_loadouts.sql` | Per-user mining loadout planner state (cross-device sync) |
| 81 | `116_marketplace_ads.sql` | Marketplace listing ads, purchase toasts, dismissals, site/profile toggles |
| 82 | `117_marketplace_ads_rpc_hooks.sql` | Marketplace ad hooks on order RPCs; fix partial WTS line depletion |
| 83 | `118_drop_game_data_mirror_tables.sql` | Drop `game_*` mirror tables — game catalogs ship bundled from parsed JSON |
| 84 | `119_mining_ledger_close_payout_total.sql` | Ledger close records app-computed payout in site stats; skip zero-payout ledgers |
| 85 | `120_bazaar_one_listing.sql` | Bazaar rework: one open WTS + WTB listing per user (pending orders merged), exact-DFP pricing, `append_to_my_listing` / `accept_wtb_partial` / listing line-edit RPCs, listing-aware limits and timeouts |
| 86 | `121_inventory_note_line_key.sql` | Resource Tracker: stock cards unique per resource + quality + note (`note_key`); case-insensitive merge on add; note rename RPC takes current note key |
| 87 | `122_dumper_session_stale_timeout.sql` | BP Dumper live tracker: stale session cleanup after 120s (avoids flicker between 30s pings) |
| 88 | `123_market_edit_digest.sql` | Marketplace: listing edits (add items / change or remove a line) coalesce into one held, diff-only "Listing Updated" Discord digest; net-zero edits (add then remove) send nothing; new listings still post one full announcement |
| 89 | `124_drop_resource_is_active.sql` | Drop `blueprint_resources.is_active` and its partial index — resources are never retired from game files |
| 90 | `125_questionnaires.sql` | Custom questionnaires: super-admin builder, audience targeting, availability window, anonymous answers, submit/decline dispositions, notify fan-out |
| 91 | `126_questionnaire_notification_sync.sql` | `sync_questionnaire_notifications_for_me` — remove stale questionnaire bell items; create missing ones for late-eligible users |
| 92 | `127_questionnaire_exclude_creator.sql` | Exclude questionnaire `created_by` from activate fan-out, pending list, sync, and fill/decline |
| 93 | `128_discord_market_webhook_url_dedupe.sql` | Deduplicate market/personal/legacy Discord webhook lookups by `webhook_url` (fixes coalesced marketplace triple-posts when WTB/WTS/cancel share one channel) |
| 94 | `129_whats_new_ticker.sql` | Site-wide Updates / What's New ticker (DB-backed) |
| 95 | `130_discord_webhook_hardening.sql` | Drop open `discord_webhooks` INSERT RLS; `get_discord_settings` returns `official_webhook_url` only to super-admins and service_role |
| 96 | `131_questionnaire_public_poll_ticker.sql` | `public_results` on questionnaires; publish anonymous option tallies to What's New ticker on archive or soft expiry (hourly cron when pg_cron available) |

### pg_cron (migrations 054, 065–068)

Migrations **065–068** schedule a cron job that calls the `send-discord` Edge Function. On Supabase:

1. Dashboard → **Database** → **Extensions** → enable **pg_cron** and **pg_net**
2. Deploy the `send-discord` Edge Function (see below)
3. Run migrations 065–068 if not already applied

If pg_cron is unavailable on your plan, Discord queue messages can still be processed manually from super-admin Discord settings (invoke `send-discord`).

---

## 4. Deploy Edge Functions

```bash
npm install   # includes Supabase CLI as a dev dependency
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF

npx supabase functions deploy ban-user
npx supabase functions deploy unban-user
npx supabase functions deploy delete-account
npx supabase functions deploy validate-rsi-handle
npx supabase functions deploy send-discord
npm run copy-blueprint-lookup
npx supabase functions deploy log-watcher-webhook --no-verify-jwt
```

| Function | Purpose |
|----------|---------|
| `ban-user` / `unban-user` | Admin user management |
| `delete-account` | User self-service account deletion |
| `validate-rsi-handle` | Validate RSI Handles against robertsspaceindustries.com |
| `send-discord` | Process queued Discord webhook messages (used by pg_cron) |
| `log-watcher-webhook` | Receives blueprint events from external tools; Bearer API key auth |

Edge Functions use `SUPABASE_SERVICE_ROLE_KEY` automatically. **Never** expose service_role in frontend code.

### Edge Function secrets

Set these under **Project Settings → Edge Functions → Secrets** (or let semantic-release create them):

| Secret | Purpose | How it is updated |
|--------|---------|-------------------|
| `LATEST_DUMPER_VERSION` | Latest BP Dumper semver shown to desktop clients | Updated by semantic-release when dumper releases ship |

BP Dumper's minimum Star Citizen **major.minor** (e.g. `4.8`) is **baked into each release build**, not stored in Supabase. When game data is parsed (`parse-extracted-data.mjs`), `npm run sync-min-game-version` updates `scripts/bp-dumper-py/_min_game_version.py` from `src/data/game-build-version.json`.

### What's New ticker (`129_whats_new_ticker.sql`)

Apply migration `129_whats_new_ticker.sql` for the bottom Updates ticker.

| Piece | Role |
|-------|------|
| `whats_new_entries` | Rows keyed by `issue_key` + `version` (RSI launcher string) |
| `list_active_whats_new()` | Anon/authenticated read of rows newer than 7 days |
| `ingest_whats_new_entries(jsonb)` | Super-admin or `service_role` insert; **skips** if same issue+version (or identical headline for that version) already exists |
| `cleanup_expired_whats_new()` | Deletes `detected_at` older than 7 days — scheduled daily via pg_cron when available |

Local parse flow: append `extracted-data/whats-new-pending.jsonl` → RPC ingest → wipe file. Put `SUPABASE_SERVICE_ROLE_KEY` in `.env` on the parse machine (never in the browser). Retry with `npm run push-whats-new`.

### Discord webhook hardening (`130_discord_webhook_hardening.sql`)

Apply migration `130`, then redeploy `send-discord`:

```bash
npx supabase functions deploy send-discord
```

| Change | Effect |
|--------|--------|
| Drop open INSERT RLS on `discord_webhooks` | Anon/members can no longer insert rows directly; `/discord-subscribe` still works via `sync_my_discord_event_webhooks` |
| Mask `official_webhook_url` in `get_discord_settings` | Only super-admins and `service_role` receive the staff webhook URL |
| `send-discord` auth | Requires service_role Bearer (cron) or a verified super-admin JWT (manual Process Queue) |

Staff webhook **rotation** in Discord is optional after this — do it only if you suspect the URL was already pulled.

### Public questionnaire polls (`131_questionnaire_public_poll_ticker.sql`)

Apply migration `131`. Super-admin questionnaire editor gains a **Public poll** checkbox (off by default). When checked:

- **Archive** posts anonymous radio/checkbox tallies to the Updates ticker (`POLL RESULTS: …`)
- Soft expiry (`available_until`) is swept hourly by `publish_due_public_questionnaire_results` (pg_cron when available) — archives the row and posts results
- Free-text answers are counted only (bodies never go on the ticker)
- Results stay on the ticker for the usual 7-day What's New TTL

### BP Dumper webhook API

Members copy a personal API key from the **BP Dumper** modal (avatar menu, or Blueprints / Mission Tracker callout). Only the BP Dumper desktop program uses this key; it calls the deployed `log-watcher-webhook` Edge Function.

**Base URL:** `https://dcyugmcvlmhlfmillzma.supabase.co/functions/v1/log-watcher-webhook` (hardcoded in BP Dumper; members only need their API key)

**Auth header (all requests):** `Authorization: Bearer dr_<your_api_key>`

**POST — mark blueprint acquired**

```json
{
  "type": "blueprint_received",
  "blueprint": "<displayName or internalName from Game.log>",
  "contractDefinitionId": "<optional — from log marker for disambiguation>"
}
```

- `blueprint` should be the catalog **internalName** when the client can resolve it (preferred). If not, send the original Game.log display text — the server checks internalName first, then maps display names.
- Optional `contractDefinitionId` from log markers helps disambiguate armor variants.
- Response `200`: `{ "success": true, "blueprint": "<internalName>", "blueprintName": "...", "resolvedVia": "internal"|"display"|"contract", "duplicate": false }` — green-check site notification on new inserts only.
- Response `202`: `{ "error": "ambiguous_blueprint", "displayName": "...", "notificationSent": true }` — sends a red-× site notification to mark manually on Blueprints.
- Response `400`: unknown blueprint (not in catalog).
- Idempotent: duplicate inserts return `duplicate: true` without error or success notification.
- Also clears the blueprint from the member's Mission Tracker target list on new acquire.

**GET — sync acquired blueprint IDs**

```json
{ "success": true, "blueprints": ["behr_smg_ballistic_01", "..."] }
```

**Example curl**

```bash
curl -X POST "https://dcyugmcvlmhlfmillzma.supabase.co/functions/v1/log-watcher-webhook" \
  -H "Authorization: Bearer dr_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"blueprint_received","blueprint":"behr_smg_ballistic_01"}'
```

**Error codes:** 401 invalid/missing key · 403 banned or pending approval · 405 wrong HTTP method · 400 invalid JSON or blueprint ID

> **Removed from repo:** `sync-blueprints` (sccrafter.com), `sync-starstrings` (StarStrings), and `sync-game-data-to-db.mjs` (Supabase `game_*` mirror tables, dropped in migration 118). All game catalogs ship bundled from parsed `game-*.json`.

---

## 5. Promote a super-admin

After your first sign-in (Google or Discord) (creates a `pending` profile):

```sql
UPDATE public.profiles
SET role = 'super-admin', approved_at = now()
WHERE email = 'your-google-email@example.com';
```

---

## 6. Configure the frontend

Copy `.env.example` to `.env`:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Optional (production uses the official DFP host — see LICENSE):

```env
# Dev only — local public/ copy from dfp-engine-private build
# VITE_DFP_ENGINE_BASE_URL=http://localhost:5173
```

---

## 7. Build and host

```bash
npm install
npm run build
```

Deploy `dist/` to your static host. See [docs/SELF_HOSTING.md](SELF_HOSTING.md).

---

## 8. DFP hosting

Production loads DFP from **https://www.dumpers-repo.com** (or same-origin on that host):

- `/dfp-engine.js`
- `/dfp-version.json`

Do not rehost the engine on other public sites.

---

## Sanity checks

After applying migrations, verify key features:

```sql
-- 077: Offline Fulfillment teaser
SELECT public.get_pending_custom_order_count();

-- 078: WTB/WTS marketplace
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'custom_orders' AND column_name = 'listing_type';

-- Shop tables removed (087) — skip if migration 087 applied

-- 118: game data mirror tables removed (catalogs ship bundled with the site)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'game_%';  -- should return no rows after 118

-- 079: legacy sccrafter table removed
SELECT to_regclass('public.synced_blueprints');  -- should be NULL

-- 080: personal Discord routing
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'discord_message_queue' AND column_name = 'target_user_id';

-- 081 + 114: RSI multi-org schema removed (not site org logo / Discord admin)
SELECT to_regclass('public.user_rsi_org_affiliations');  -- should be NULL after 114

-- 114: ghost_mode and game_components retired
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'ghost_mode';  -- NULL after 114
SELECT to_regclass('public.game_components');  -- NULL after 114

-- 082: marketplace Discord coalesce
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'discord_settings' AND column_name = 'market_coalesce_enabled';

-- 084: RSI gate on personal deal webhooks
SELECT pg_get_functiondef(oid) LIKE '%my_order_%'
FROM pg_proc
WHERE proname = 'sync_my_discord_event_webhooks';
```

---

## Legacy migrations

`supabase/migrations_legacy/` (001–041) is historical audit only — **not** for new installs.
