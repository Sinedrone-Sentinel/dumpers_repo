# Dumper Services Discord Bot (Partnership)

Partnership-only bot for **Accept** on service requests. Does **not** replace personal/marketplace webhooks (`/discord-subscribe`, `send-discord`).

## What this proves

1. Discord can reach our Interactions URL (PING / portal validation).
2. An **Accept** button posts and is clickable.
3. **First click wins** in Postgres; late clicks get “already taken”.
4. Sibling Discord messages for the same request update to Accepted / Taken.

Harness tables: `dumper_services_bot_test_*` (migration `137`). Real Partnership `service_requests` come later.

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
# Apply migration 137 in SQL Editor first

npx supabase functions deploy discord-services-interactions --no-verify-jwt
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
https://discord.com/api/oauth2/authorize?client_id=<APPLICATION_ID>&permissions=2048&scope=bot
```

`2048` = Send Messages. Add `16384` (Embed Links) → `18432` if you prefer both.
