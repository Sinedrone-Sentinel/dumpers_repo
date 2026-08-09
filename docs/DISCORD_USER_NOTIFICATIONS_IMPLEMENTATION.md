# Discord User Notifications — Implementation Spec

**Status:** Ready to implement (Phase 0 + Phase 1). Org site code deferred — see [`DISCORD_ORG_PHASE2_DEFERRED.md`](DISCORD_ORG_PHASE2_DEFERRED.md).

**Apply migrations on Supabase after deploy:** `080_discord_personal_routing.sql`, then `081_rsi_org_schema.sql` (schema only).

---

## Summary

| Lane | Who subscribes | Routing |
|------|----------------|---------|
| **Personal** (`my_*`) | Your webhook, your checkboxes | `target_user_id` = recipient; skip if `actor = target` |
| **Marketplace** (`market_*`) | Opt-in firehose | All subscribers except `actor_user_id` |
| **Support personal** (`my_support_*`) | Opt-in on your webhook | `target_user_id` = ticket requester |
| **Staff** (`support`, `admin`) | Official webhook only | Unchanged |

**No self-echo:** poster/acceptor never gets Discord for their own click.

**Server-side only:** remove `queueOrderEvent` calls from [`src/lib/operations.ts`](../src/lib/operations.ts). Order/support Discord via SQL triggers + patched RPCs in migration 080.

---

## Migration 080 — `supabase/migrations/080_discord_personal_routing.sql`

Creates:

- `discord_message_queue.target_user_id`, `actor_user_id`
- `discord_settings.personal_discord_enabled`
- New event types; removes pending `blueprints` queue rows
- `queue_discord_message(..., p_target_user_id, p_actor_user_id)`
- `get_discord_webhooks_for_personal_event`, `get_discord_webhooks_for_market_event`
- Updated `get_pending_discord_messages`, `get_discord_public_event_types` (adds `event_category`)
- Updated `register_discord_webhook` / `update_my_discord_webhook` valid events + defaults
- Migrates existing webhook `subscribed_events` from legacy `order_*` / `blueprints`
- Triggers: new listing, delete listing, `order_events` lifecycle
- Patches: `abandon_custom_order_fulfillment`, `add_ticket_message`, `report_order_dispute`
- Trigger: `support_tickets` status → resolved

### Default user webhook subscriptions (on register)

**On:** `my_order_accepted`, `my_order_ready`, `my_order_completed`, `my_order_cancelled`, `my_order_released`, `my_order_timeout`, `my_order_noshow`, `my_order_dispute`, `my_support_reply`, `my_support_resolved`

**Off by default:** all `market_*`, `my_order_in_progress`

### Admin master toggles (unchanged columns, new mapping)

| Admin toggle | Gates |
|--------------|-------|
| `order_new_enabled` | `market_wtb_new`, `market_wts_new` |
| `order_fulfilled_enabled` | `market_accepted` |
| `order_cancelled_enabled` | `market_cancelled` |
| `personal_discord_enabled` (new) | all `my_*` + `my_support_*` |
| `support` / `admin` / `partnership_application` / `contributor_application` | Super-Admin webhook |

Remove **Blueprints** toggle from admin UI (column can remain in DB).

---

## Migration 081 — `supabase/migrations/081_rsi_org_schema.sql`

**DB only — no site code, no send-discord org fan-out yet.**

Tables:

- `rsi_orgs` — org SID cache
- `rsi_org_ranks` — per-org rank ladder + `can_manage_webhooks`
- `user_rsi_org_affiliations` — many rows per user (multi-org)
- `discord_org_webhooks` — org channel URLs (verified registration later)
- `org_webhook_registration_requests` — staff approval queue

See org deferred doc for verification rules.

---

## Edge function — `supabase/functions/send-discord/index.ts`

Update fan-out per message:

1. **`support` / `admin` / `partnership_application` / `contributor_application`** → Super-Admin webhook only
2. **`my_*` / `my_support_*`** → `get_discord_webhooks_for_personal_event(event_type, target_user_id)`
3. **`market_*`** → `get_discord_webhooks_for_market_event(event_type, actor_user_id)`
4. **Legacy `order_new` / `order_fulfilled` / `order_cancelled` / `orders`** → drain via `get_discord_webhooks_for_event` until queue empty

Add COLORS for new event types. Extend `QueuedMessage` with `target_user_id`, `actor_user_id`.

---

## Frontend

### [`src/lib/discord.ts`](../src/lib/discord.ts)

- Extend `DiscordEventType` with personal/market types
- Add `personal_discord_enabled` to `DiscordSettings`
- Remove `queueOrderEvent`, `queueBlueprintSyncEvent`
- Keep `queueSupportEvent` / `queueAdminEvent` (staff lane, client OK for now)
- Update `getDiscordPublicEventTypes` return type to include `event_category`, `display_name`, `description`

### [`src/routes/DiscordSubscribe.index.tsx`](../src/routes/DiscordSubscribe.index.tsx)

Three sections from API `event_category`:

1. **My activity** — personal events
2. **Marketplace activity** — `market_*` (opt-in)
3. **Support** — `my_support_*`

Default selected events = SQL `discord_default_user_events()`. Update labels map. Explain: “Discord alerts when someone else changes your deal — not when you click it yourself.”

### [`src/components/DiscordSettingsModal.tsx`](../src/components/DiscordSettingsModal.tsx)

- Remove Blueprints toggle
- Rename order toggles: “Marketplace: new listings (WTB/WTS)”, “Marketplace: accepted”, “Marketplace: cancelled”
- Add “Personal notifications (global)” toggle → `personal_discord_enabled`

### [`src/lib/operations.ts`](../src/lib/operations.ts)

- Remove `import { queueOrderEvent }` and all four `queueOrderEvent(...)` calls

### Archive — [`src/components/archive/ArchiveWelcome.tsx`](../src/components/archive/ArchiveWelcome.tsx)

Add `PAGE_GUIDES` entry for Discord Webhooks (`/discord-subscribe`).

### Docs — [`docs/SUPABASE_SETUP.md`](../docs/SUPABASE_SETUP.md)

Add migrations 080–081 to table.

---

## Deploy checklist

1. Apply `080` then `081` on Supabase
2. Deploy `send-discord` edge function
3. Deploy frontend
4. Super-admin: verify Discord master toggles
5. Test: user A posts WTB → user B subscribed to `market_wtb_new` gets ping; user A does not
6. Test: user B accepts → user A gets `my_order_accepted` on personal webhook only

---

## Full migration 080 SQL

The complete SQL file is stored at:

`supabase/migrations/080_discord_personal_routing.sql`

(To be created on implement — content matches the migration drafted in the implementation session: queue columns, helpers, triggers, RPC patches, public event types, webhook migration.)
