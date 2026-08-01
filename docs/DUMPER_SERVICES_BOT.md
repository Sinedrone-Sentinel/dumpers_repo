# Dumper Services Discord Bot (Partnership)

Partnership-only bot for **Accept** on service requests. Does **not** replace personal/marketplace webhooks (`/discord-subscribe`, `send-discord`).

## What this proves

1. Discord can reach our Interactions URL (PING / portal validation).
2. An **Accept** button posts and is clickable.
3. **First click wins** in Postgres; late clicks get “already taken”.
4. Sibling Discord messages for the same request update to Accepted / Taken.

Harness tables: `dumper_services_bot_test_*` (migration `137`). Live tables: `service_requests` + `service_request_deliveries` (migration `140`).

**Live flow:** site `request_service` → Edge `discord-services-dispatch` (resolve partner webhook → bot posts Accept) → Interactions `accept_service_request` (first-wins) → `service_request_accepted` notification with `org_name` + `pricing_label` + `service_label`.

**Partner setup:** webhook URL on the service **and** invite the bot into that Discord server (**Send Messages + Embed Links + Attach Files**). Attach Files is required for salvage/pirate tip screenshots. After approval, `/partnership` loads the invite URL from Edge `discord-services-bot-invite` (secret `DISCORD_SERVICES_APPLICATION_ID`).

**Timers:** actionable Accept window **30 minutes** (then red Timed out on all copies); member cooldown **31 minutes** per service. Informative tips purge from DB after Discord delivery.

**Expire cron (optional):** call Edge `discord-services-expire` with `Authorization: Bearer <SERVICE_ROLE_KEY>` on a schedule (e.g. every 5 min) so Timed out patches do not wait for a late Accept click.

## Discord Developer Portal (you)

1. [Discord Developer Portal](https://discord.com/developers/applications) → **New Application** (e.g. `Dumper Services`).
2. **Bot** → Add Bot → copy **Bot Token**.
3. **General Information** → copy **Public Key** and **Application ID**.
4. Bot settings: enable nothing special for buttons (no privileged intents required for this test).
5. **OAuth2 → URL Generator**: scopes `bot`, permission **Send Messages** + **Embed Links** (and optionally Manage Messages). Invite into a test Discord server/channel.
6. **General Information → Interactions Endpoint URL** (after Edge deploy):

   `https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/discord-services-interactions`

   Discord will send a PING; URL only saves if signature verify succeeds.

## Supabase secrets

Project Settings → Edge Functions → Secrets:

| Secret | Value |
|--------|--------|
| `DISCORD_SERVICES_PUBLIC_KEY` | Application Public Key (hex) |
| `DISCORD_SERVICES_BOT_TOKEN` | Bot token |
| `DISCORD_SERVICES_APPLICATION_ID` | Application ID (optional; invite links) |

## Deploy

```bash
# Apply migrations 137 + 140 in SQL Editor first

npx supabase functions deploy discord-services-interactions --no-verify-jwt
npx supabase functions deploy discord-services-dispatch
npx supabase functions deploy discord-services-expire --no-verify-jwt
npx supabase functions deploy discord-services-bot-invite
npx supabase functions deploy discord-services-post-test
```

## Smoke test

1. Invite the bot to a channel; copy **Channel ID** (Discord Developer Mode).
2. As super-admin, call post-test (or use Discord Settings → Bot test panel when present):

```bash
curl -s -X POST \
  "$VITE_SUPABASE_URL/functions/v1/discord-services-post-test" \
  -H "Authorization: Bearer <SUPER_ADMIN_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"channel_id":"<CHANNEL_ID>","copy_count":2,"service_label":"Medical","requester_label":"sinedrone_sentinel"}'
```

3. Discord shows **2** messages (same request, simulating 2 orgs).
4. Click **Accept** on one → that message becomes Accepted; the other becomes Taken.
5. Click Accept on the remaining Taken message → ephemeral “Too late…”.

If the Interactions URL fails validation in the portal, the public key secret or deploy (`--no-verify-jwt`) is wrong.

## Invite URL (after Application ID is set)

```
https://discord.com/api/oauth2/authorize?client_id=<APPLICATION_ID>&permissions=51200&scope=bot
```

`51200` = Send Messages (`2048`) + Embed Links (`16384`) + Attach Files (`32768`). Re-invite if the bot was added without Attach Files.

Approved partners see Open / Copy invite on `/partnership` via Edge `discord-services-bot-invite` reading `DISCORD_SERVICES_APPLICATION_ID`.
