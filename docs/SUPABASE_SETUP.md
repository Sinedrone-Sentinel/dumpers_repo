# Supabase setup

Use this guide when standing up or catching up the **official** Dumper's Repo Supabase database with migrations.

## If you already have a live database

1. **Do not** re-run the squashed baseline (`001`-`006`) or migrations you have already applied.
2. If you previously ran incremental migrations `001`-`041` from `supabase/migrations_legacy/`, your starting point for this repo is **`042_site_settings.sql`** onward.
3. In **SQL Editor**, run only the migration files you are **missing**, **in numeric order** (see full list below).
4. Each file is idempotent where practical. Errors about existing objects usually mean that step already ran - verify with the sanity checks at the end.

**Latest migration:** `179_own_fulfillment_history.sql` (own 30-day fulfillment history + monthly cleanup cron). Apply missing files in numeric order if catching up. Bot setup: [`docs/DUMPER_SERVICES_BOT.md`](DUMPER_SERVICES_BOT.md).

---

## 1. Create a Supabase project

1. [supabase.com](https://supabase.com) → New project
2. Note **Project URL** and **anon public** key for `.env`
3. Note **service_role** key (Settings → API) - needed for Edge Functions; keep secret

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

> Supabase maps Discord's `global_name` to `full_name` in `raw_user_meta_data`. The existing `handle_new_user` trigger reads `full_name` and populates `display_name` automatically - no changes needed.

---

## 2c. Account linking (Google + Discord)

Members can use **one account** with multiple sign-in methods:

1. **Authentication → Settings → Enable Manual Linking** - required for Connect / Disconnect in app Settings
2. **Automatic linking** (on by default) - when Google and Discord share the same **verified** email, Supabase links them to the same user on first sign-in (works both directions). No duplicate profile is created.
3. **Discord email scope** - the Discord OAuth app must allow email; the app requests `identify email` so auto-merge can match addresses.

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
| 25 | `060_shop_data.sql` | *(Historical)* Shop tables - dropped by `087` |
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
| 40 | `075_game_data_tables.sql` | *(Historical)* Rename `starstrings_*` → `game_*` tables - dropped by `118` |
| 41 | `076_game_data_anon_read.sql` | *(Historical)* Anonymous read on `game_*` tables - dropped by `118` |
| 42 | `077_guest_pending_order_count.sql` | `get_pending_custom_order_count()` for Offline Fulfillment teaser |
| 43 | `078_order_listing_type.sql` | WTB/WTS `listing_type`, semantic buyer/seller RPCs |
| 44 | `079_drop_synced_blueprints.sql` | Drop legacy `synced_blueprints` (sccrafter era) |
| 45 | `080_discord_personal_routing.sql` | Personal + marketplace Discord routing, server-side triggers |
| 46 | `081_rsi_org_schema.sql` | *(Historical)* RSI multi-org tables - dropped by `114` (not site org logo / Discord admin) |
| 47 | `082_discord_market_coalesce.sql` | Marketplace listing churn coalesce + admin quiet-period setting |
| 48 | `083_discord_per_event_webhooks.sql` | Remove webhook cap; per-event sync RPC; return URLs to owner |
| 49 | `084_discord_rsi_personal_webhooks.sql` | Require RSI verification for `my_order_*` webhook registration |
| 50 | `085_shop_socpak_fields.sql` | *(Historical)* Shop socpak fields - dropped by `087` |
| 51 | `086_shop_shelf_vendors.sql` | *(Historical)* Shop shelf vendors - dropped by `087` |
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
| 83 | `118_drop_game_data_mirror_tables.sql` | Drop `game_*` mirror tables - game catalogs ship bundled from parsed JSON |
| 84 | `119_mining_ledger_close_payout_total.sql` | Ledger close records app-computed payout in site stats; skip zero-payout ledgers |
| 85 | `120_bazaar_one_listing.sql` | Bazaar rework: one open WTS + WTB listing per user (pending orders merged), exact-DFP pricing, `append_to_my_listing` / `accept_wtb_partial` / listing line-edit RPCs, listing-aware limits and timeouts |
| 86 | `121_inventory_note_line_key.sql` | Resource Tracker: stock cards unique per resource + quality + note (`note_key`); case-insensitive merge on add; note rename RPC takes current note key |
| 87 | `122_dumper_session_stale_timeout.sql` | BP Dumper live tracker: stale session cleanup after 120s (avoids flicker between 30s pings) |
| 88 | `123_market_edit_digest.sql` | Marketplace: listing edits (add items / change or remove a line) coalesce into one held, diff-only "Listing Updated" Discord digest; net-zero edits (add then remove) send nothing; new listings still post one full announcement |
| 89 | `124_drop_resource_is_active.sql` | Drop `blueprint_resources.is_active` and its partial index - resources are never retired from game files |
| 90 | `125_questionnaires.sql` | Custom questionnaires: super-admin builder, audience targeting, availability window, anonymous answers, submit/decline dispositions, notify fan-out |
| 91 | `126_questionnaire_notification_sync.sql` | `sync_questionnaire_notifications_for_me` - remove stale questionnaire bell items; create missing ones for late-eligible users |
| 92 | `127_questionnaire_exclude_creator.sql` | Exclude questionnaire `created_by` from activate fan-out, pending list, sync, and fill/decline |
| 93 | `128_discord_market_webhook_url_dedupe.sql` | Deduplicate market/personal/legacy Discord webhook lookups by `webhook_url` (fixes coalesced marketplace triple-posts when WTB/WTS/cancel share one channel) |
| 94 | `129_whats_new_ticker.sql` | Site-wide Updates / What's New ticker (DB-backed) |
| 95 | `130_discord_webhook_hardening.sql` | Drop open `discord_webhooks` INSERT RLS; `get_discord_settings` returns `official_webhook_url` only to super-admins and service_role |
| 96 | `131_questionnaire_public_poll_ticker.sql` | `public_results` on questionnaires; publish anonymous option tallies to What's New ticker on archive or soft expiry (hourly cron when pg_cron available) |
| 97 | `132_protect_profile_privileged_columns.sql` | Trigger blocks client UPDATE of `role` / `approved_*` / `rsi_handle_verified*`; drop officer FOR ALL profile policy; `admin_set_user_role` for Admin Panel |
| 98 | `133_lock_mark_rsi_handle_verified.sql` | Revoke client execute on `mark_rsi_handle_verified`; service_role / `validate-rsi-handle` Edge Function only |
| 99 | `134_lock_queue_discord_message.sql` | Queue support Discord from `create_support_ticket`; revoke authenticated execute on `queue_discord_message` |
| 100 | `135_marketplace_rls_rpc_only_writes.sql` | Replace marketplace FOR ALL RLS with SELECT; `cancel_custom_order_requester` for former client status updates |
| 101 | `136_rsi_bio_verify_challenge.sql` | Bio-code RSI verification (`issue_rsi_verify_challenge` / Edge scrape of public citizen Bio); officer `admin_force_rsi_handle_verified` escape hatch |
| 102 | `137_dumper_services_bot_harness.sql` | Partnership Discord bot test harness (first-wins Accept); does not touch personal/market webhooks |
| 103 | `138_partnership_support_category.sql` | Adds `partnership_application` support ticket category |
| 104 | `139_partner_org_services.sql` | Partner applications (support ticket + Discord notify), service_types catalog, partner org services/webhooks |
| 105 | `140_service_requests.sql` | Member service requests, delivery fan-out, first-wins Accept + requester notification (org + pricing) |
| 106 | `141_support_other_and_new_service.sql` | Support ticket categories: Other, Add New Service Request |
| 107 | `142_service_catalog_kinds.sql` | Service kinds (actionable/informative), catalog seeds, 30m/31m timers, tip screenshot storage |
| 108 | `143_service_request_pricing_tiers.sql` | FREE vs FEE request tiers - list/notify split by partner pricing_label |
| 109 | `144_discord_cron_ready_only.sql` | Discord cron skips coalesce-held queue rows (no empty wake every minute) |
| 110 | `145_dumper_invoke_analytics.sql` | BP Dumper Edge invoke stats (30-day daily rows; daily `cleanup-dumper-invoke-daily` cron) + Site Analytics RPC |
| 111 | `146_site_analytics_30day_retention.sql` | Purge site analytics daily/tool/visitor rows older than 30 days (daily cron + one-shot on apply) |
| 112 | `147_discord_cron_secret_apikey.sql` | Discord cron uses `apikey` header (Secret API key / `sb_secret_…`) |
| 113 | `148_officer_ban_members_only.sql` | Officers can ban pending/members only; cannot ban other officers |
| 114 | `149_whats_new_site_ttl.sql` | Whats New `kind` game|site; site/poll TTL 3d, game TTL 7d; site announcements for Dumper Apps + avatar menu |
| 115 | `150_ticker_headline_cleanup.sql` | Short ticker titles; strip legacy prefixes; remove over-detailed site rows |
| 116 | `151_admin_whats_new_crud.sql` | Super-admin ticker CRUD; `ticker_categories` (labels/colors/TTL); delete blocked while active messages use a category |
| 117 | `152_ticker_admin_purge_on_list.sql` | Admin ticker list purges expired rows on load (no “include expired” toggle) |
| 118 | `153_ticker_category_ttl_days.sql` | Per-category TTL days (1-90); system categories protected; questionnaire active count includes open forms |
| 119 | `154_questionnaire_ticker_include_creator.sql` | Creators see their own live questionnaires on the Updates ticker (can open/respond); activate fan-out still skips creator bell spam |
| 120 | `155_rsi_handle_verified_only.sql` | RSI handle written only after verification; client cannot set privileged handle fields |
| 121 | `156_dumper_projected_monthly.sql` | (superseded by 157) projected monthly Edge invokes |
| 122 | `157_dumper_projected_monthly_recent_pace.sql` | Projected monthly Edge = trailing 7-day invoke pace × 30 |
| 123 | `158_scu_resource_full_line_only.sql` | WTS/WTB partial checkout: SCU resources must take the full line; whole-unit items may use integer partial qty |
| 124 | `159_new_user_discord_on_signup.sql` | Staff “New User Joined” Discord fires on signup (`handle_new_user`), not welcome-modal finish; backfill recent unfinished onboardings |
| 125 | `160_rsi_verified_discord_notification.sql` | Staff “RSI Handle Verified” Discord on first verify (Edge + officer force) |
| 126 | `161_dumper_top_users_rolling_30d.sql` | Analytics Top Dumpers Edge invokes always use rolling 30 days (period filter still scopes other Dumper cards) |
| 127 | `162_member_left_discord_and_delete_cleanup.sql` | Staff “Member Left the Site” Discord on self-delete; Discord FK cleanup so profile delete cannot block; Edge also purges service-request screenshots |
| 128 | `163_contributor_team_and_ticker_ttl.sql` | Contributor Team applications/upgrades + GitHub sync RPCs; per-entry ticker `ttl_days_override` (1-366) |
| 129 | `164_fix_list_active_whats_new_volatile.sql` | Fix empty Updates ticker: `list_active_whats_new` is filter-only again (no DELETE in STABLE/read-only RPC) |
| 130 | `165_super_admin_discord_application_events.sql` | Super-Admin Discord: partnership_application + contributor_application event types/toggles |
| 131 | `166_friends_list.sql` | Friends: friendships + private groups; DEFINER RPCs for request/accept/remove/list/friend reads; tighten acquired_blueprints SELECT; hide accepted friends’ Bazaar listings |
| 132 | `167_friends_notify_actions_reorder_groups.sql` | Friends: outbound `friend_request_sent` Notify + clear pending request rows on resolve; `reorder_friend_groups` RPC |
| 133 | `168_friends_rsi_handle_privacy.sql` | Friends privacy: pending search/Notify/list use RSI Handle only; scrub leaked display names in existing friend Notify rows |
| 134 | `169_sync_pending_friend_notifications.sql` | Friends: `ensure_pending_friend_notifications` + backfill; DELETE RLS blocks Clear on pending friend Notify types |
| 135 | `170_friend_discord_personal_events.sql` | Friends personal Discord: `my_friend_request` / `my_friend_accepted` subscribe events; queue RSI-handle embed fields from friend RPCs |
| 136 | `171_friend_default_group.sql` | Friends: per-owner Default group (`is_default`); accept assigns both sides; delete custom group moves members to Default; reorder pins Default last; restore friends’ visibility/trade on Bazaar |
| 137 | `172_friend_invite_links.sql` | Friends: `friend_invite_token` + ensure/rotate/redeem RPCs (multi-use link; per-clicker rate limit) |
| 138 | `173_friends_rsi_verified_invite_stash.sql` | Friends: RSI-verified send/accept; `friend_invite_stashes` until clicker verifies; process on `mark_rsi_handle_verified` |
| 139 | `174_dumper_edge_abuse_guard.sql` | BP Dumper Edge abuse guard: IP auth-fail buckets (429); valid-key burst counters + Discord/Notify super-admin alerts (service_role RPCs only) |
| 140 | `175_support_chat_realtime.sql` | Publish `support_tickets` + `ticket_messages` to `supabase_realtime` (live support queues/chat; typing uses Presence) |
| 141 | `176_wtb_fulfill_without_blueprint_tracker.sql` | WTB fulfill no longer requires the Blueprint tracker; amber confirm on untracked lines |
| 142 | `177_deal_messages.sql` | Per-deal chat (`deal_messages`); `list_deal_messages` / `send_deal_message`; purge on terminal status; sticky `order_deal_message`; personal Discord `my_order_deal_message` |
| 143 | `178_order_timeout_cron_and_warning.sql` | Daily 04:00 UTC `order-timeout-checks` cron (`run_order_timeout_jobs`); WTS/WTB timeout attribution; `get_my_pending_timeout_warning` / `acknowledge_timeout_warning` |
| 144 | `179_own_fulfillment_history.sql` | Fulfillment history SELECT is own rows, last 30 days (including super-admin); monthly `cleanup-old-order-fulfillments` cron on the 1st |

### pg_cron (migrations 054, 065-068, 144, 147, 178, 179)

Migrations **065-068** schedule a cron job that calls the `send-discord` Edge Function. On Supabase:

1. Dashboard → **Database** → **Extensions** → enable **pg_cron** and **pg_net**
2. Deploy the `send-discord` Edge Function (see below)
3. Run migrations 065-068 if not already applied
4. Set `app_config.supabase_service_key` to the **Secret API key** (`sb_secret_…`) from Dashboard → Settings → API Keys → **Publishable and secret API keys** (the Legacy `service_role` JWT is the wrong value for cron once Edge prefers `SUPABASE_SECRET_KEYS`)
5. Apply migration **147** so cron sends that secret on the `apikey` header (not `Authorization: Bearer`)

If pg_cron is unavailable on your plan, Discord queue messages can still be processed manually from super-admin Discord settings (invoke `send-discord`).

Order timeout enforcement (`order-timeout-checks`, daily at 04:00 UTC) is scheduled by migration **178**. If pg_cron is missing, run this in the SQL editor after applying 178:

```sql
SELECT cron.schedule(
  'order-timeout-checks',
  '0 4 * * *',
  $$SELECT public.run_order_timeout_jobs()$$
);
```

To process already-overdue trades immediately after apply:

```sql
SELECT public.run_order_timeout_jobs();
```

Fulfillment history cleanup (`cleanup-old-order-fulfillments`, 04:00 UTC on the 1st of each month) is scheduled by migration **179**. If pg_cron is missing:

```sql
SELECT cron.schedule(
  'cleanup-old-order-fulfillments',
  '0 4 1 * *',
  $$SELECT public.cleanup_old_order_fulfillments()$$
);
```

To purge rows older than 30 days immediately:

```sql
SELECT public.cleanup_old_order_fulfillments();
```

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
npx supabase functions deploy send-discord --no-verify-jwt
npm run copy-blueprint-lookup
npx supabase functions deploy log-watcher-webhook --no-verify-jwt
npx supabase functions deploy discord-services-interactions --no-verify-jwt
npx supabase functions deploy discord-services-dispatch
npx supabase functions deploy discord-services-expire --no-verify-jwt
npx supabase functions deploy discord-services-bot-invite
npx supabase functions deploy discord-services-post-test
npx supabase functions deploy manage-github-collaborator
```

| Function | Purpose |
|----------|---------|
| `ban-user` / `unban-user` | Admin user management |
| `delete-account` | User self-service account deletion (RPC cleanup + auth user + service-request screenshots) |
| `validate-rsi-handle` | Verify RSI Handles via public citizen Bio challenge code (after `issue_rsi_verify_challenge`) |
| `send-discord` | Process queued Discord webhook messages (used by pg_cron) |
| `log-watcher-webhook` | Receives blueprint events from BP Dumper; Bearer API key + required `X-Dumper-Version` (426 outdated); IP auth-fail 429 + valid-key burst alerts (mig 174) |
| `discord-services-interactions` | Partnership Dumper Services bot (Accept buttons); Discord signature auth |
| `discord-services-dispatch` | Fan-out service requests to partner Discord channels |
| `discord-services-expire` | Expire open Accept windows + Timed out embeds |
| `discord-services-bot-invite` | Returns bot OAuth invite URL from `DISCORD_SERVICES_APPLICATION_ID` |
| `discord-services-post-test` | Super-admin harness: post N Accept messages for race testing |
| `manage-github-collaborator` | Contributor Team: invite/update/remove GitHub collaborators after approve/upgrade/leave/revoke |

Edge secrets for the Partnership bot: `DISCORD_SERVICES_PUBLIC_KEY`, `DISCORD_SERVICES_BOT_TOKEN`, `DISCORD_SERVICES_APPLICATION_ID` (see [`DUMPER_SERVICES_BOT.md`](DUMPER_SERVICES_BOT.md)).

Edge Functions receive platform secrets automatically (`SUPABASE_SECRET_KEYS`, plus deprecated `SUPABASE_SERVICE_ROLE_KEY`). **Never** expose secret / service_role keys in frontend code.

### Edge Function secrets

**Contributor Team:** set Edge secret `GITHUB_CONTRIBUTORS_TOKEN` to a fine-scoped GitHub PAT (or GitHub App installation token) that can manage collaborators on the configured public repo. Without it, `manage-github-collaborator` returns 503 and marks sync error.

Set these under **Project Settings → Edge Functions → Secrets** (or let semantic-release create them):

| Secret | Purpose | How it is updated |
|--------|---------|-------------------|
| `LATEST_DUMPER_VERSION` | Optional hotfix raise for the desktop version gate | Auto-set to the new semver by `build-releases.yml` after VirusTotal publish. Bundled `dumper-version.json` on Edge is the baseline; a **stale older** secret cannot pin below the bundle. |

BP Dumper's minimum Star Citizen **major.minor** (e.g. `4.8`) is **baked into each release build**, not stored in Supabase. When game data is parsed (`parse-extracted-data.mjs`), `npm run sync-min-game-version` updates `scripts/bp-dumper-py/_min_game_version.py` from `src/data/game-build-version.json`.

### What's New ticker (`129` + `149` + `150` + `151`)

Apply migrations through `151_admin_whats_new_crud.sql` for the bottom Updates ticker and super-admin management UI (avatar → **Site admin** → **Updates Ticker**).

| Piece | Role |
|-------|------|
| `whats_new_entries` | Rows keyed by `issue_key` + `version`; `kind` is `game` or `site`; optional `ticker_category_id` |
| `ticker_categories` | Layout categories (slug, label, accent hex, **ttl_days** 1-90); seeded Site / Game / Questionnaire / Dumper Apps |
| `list_ticker_categories()` | Anon/authenticated read of layout categories for badge colors |
| `list_active_whats_new()` | Anon/authenticated read - **game** rows 7 days, **site** rows 3 days (includes category layout fields) |
| `ingest_whats_new_entries(jsonb)` | Super-admin or `service_role` insert; **skips** if same issue+version (or identical headline for that version) already exists; resolves `ticker_category_id` |
| `cleanup_expired_whats_new()` | Deletes by kind TTL (site 3d / game 7d) - scheduled daily via pg_cron when available |
| `admin_*_whats_new_*` / `admin_*_ticker_category*` | Super-admin only CRUD; category delete blocked while **active** messages use that category; admin list runs `cleanup_expired_whats_new` so expired rows are gone |

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
| `send-discord` auth | Cron: exact match of the project **Secret API key** (`sb_secret_…`) on the `apikey` header (migration `147`). Manual Process Queue: verified super-admin user JWT. Deploy with `--no-verify-jwt`. Set `app_config.supabase_service_key` from Dashboard → Settings → API Keys → **Publishable and secret API keys** (not the Legacy JWT tab). |

Staff webhook **rotation** in Discord is optional after this - do it only if you suspect the URL was already pulled.

### Public questionnaire polls (`131_questionnaire_public_poll_ticker.sql`)

Apply migration `131`. Super-admin questionnaire editor gains a **Public poll** checkbox (off by default). When checked:

- **Archive** posts anonymous radio/checkbox tallies to the Updates ticker (`POLL RESULTS: …`)
- Soft expiry (`available_until`) is swept hourly by `publish_due_public_questionnaire_results` (pg_cron when available) - archives the row and posts results
- Free-text answers are counted only (bodies never go on the ticker)
- Results stay on the ticker for the **site** What's New TTL (3 days)

### BP Dumper webhook API

Members copy a personal API key from the **BP Dumper** modal (avatar menu, or Blueprints / Mission Tracker callout). Only the BP Dumper desktop program uses this key; it calls the deployed `log-watcher-webhook` Edge Function.

After migrations **145** / **174**, redeploy the webhook so invoke analytics and abuse-guard RPCs stay in sync with Edge:

```bash
npm run copy-blueprint-lookup
npx supabase functions deploy log-watcher-webhook --no-verify-jwt
```

**Abuse guard (migration 174, Edge):** malformed/`Invalid API key` traffic is counted per client IP; after ~25 fails in ~60s the IP is blocked with **429** (~10 min) and staff get a Discord/Notify alert (30 min cooldown). Accepted traffic with a **valid** key is classified (`ping` / `get_sync` / `blueprint` / `other`); bursts above normal dumper rates alert super-admins with **user id + RSI/email** (alert only — does not 429 bulk blueprint import). Thresholds: ping >10/min, GET sync >30/min, other >120/min, blueprint >900/min.

**Base URL:** `https://dcyugmcvlmhlfmillzma.supabase.co/functions/v1/log-watcher-webhook` (hardcoded in BP Dumper; members only need their API key)

**Auth header (all requests):** `Authorization: Bearer dr_<your_api_key>`

**POST - mark blueprint acquired**

```json
{
  "type": "blueprint_received",
  "blueprint": "<displayName or internalName from Game.log>",
  "contractDefinitionId": "<optional - from log marker for disambiguation>"
}
```

- `blueprint` should be the catalog **internalName** when the client can resolve it (preferred). If not, send the original Game.log display text - the server checks internalName first, then maps display names.
- Optional `contractDefinitionId` from log markers helps disambiguate armor variants.
- Response `200`: `{ "success": true, "blueprint": "<internalName>", "blueprintName": "...", "resolvedVia": "internal"|"display"|"contract", "duplicate": false }` - green-check site notification on new inserts only.
- Response `202`: `{ "error": "ambiguous_blueprint", "displayName": "...", "notificationSent": true }` - sends a red-× site notification to mark manually on Blueprints.
- Response `400`: unknown blueprint (not in catalog).
- Idempotent: duplicate inserts return `duplicate: true` without error or success notification.
- Also clears the blueprint from the member's Mission Tracker target list on new acquire.

**GET - sync acquired blueprint IDs**

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

**Error codes:** 401 invalid/missing key · 403 banned or pending approval · 426 outdated `X-Dumper-Version` · 429 auth-fail IP bucket · 405 wrong HTTP method · 400 invalid JSON or blueprint ID

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

Optional (production uses the official DFP host - see LICENSE.DFP):

```env
# Dev only - local public/ copy from dfp-engine-private build
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

-- Shop tables removed (087) - skip if migration 087 applied

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

`supabase/migrations_legacy/` (001-041) is historical audit only - **not** for new installs.
