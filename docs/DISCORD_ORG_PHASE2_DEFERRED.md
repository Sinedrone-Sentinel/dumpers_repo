# Discord Org Channels — Phase 2 (Deferred)

**Status:** Database schema only in migration `081_rsi_org_schema.sql`. **No site UI, no send-discord org fan-out, no RSI scrape yet.**

Implement after personal + marketplace Discord (080) is live.

---

## Why defer site code

Org leadership verification requires RSI scrape + roster cross-check + optional staff approval. Personal Discord delivers immediate member value without scrape fragility.

---

## What migration 081 prepares (DB only)

| Table | Purpose |
|-------|---------|
| `rsi_orgs` | Cache org SID, name, logo, `ranks_scraped_at` |
| `rsi_org_ranks` | Per-org rank ladder; `can_manage_webhooks` flag |
| `user_rsi_org_affiliations` | **Many rows per user** — `org_sid`, `rank_title`, `rank_stars`, `is_main_org`, `scraped_at` |
| `discord_org_webhooks` | Org Discord URLs; `verification_method`, `verified_at`, `revoked_at` |
| `org_webhook_registration_requests` | Pending when auto-verify fails |

**No** `profiles.rsi_org_sid` single column — users belong to multiple orgs with different ranks.

---

## Verification rules (when site code is built)

**Users never self-declare leadership.** No checkbox, no rank dropdown.

Registration flow:

1. User has verified RSI handle
2. Re-scrape citizen profile → affiliations list (read-only picker, not free-text SID)
3. Re-scrape org public roster → find handle → read rank + stars
4. Compare to `rsi_org_ranks` for that org (Founder always allowed; officer tier by stars/name)
5. Pass → allow webhook URL for that `org_sid` only
6. Fail (hidden member, ambiguous rank) → `org_webhook_registration_requests` → site staff approves with RSI links

Leadership in org A does **not** grant org B.

---

## Org-scoped messages (future)

Queue rows: `target_org_sid` (add column when implementing Phase 2 site code).

On order events, collect **both participants’** fresh affiliation rows → emit one org event per distinct SID → fan-out to `discord_org_webhooks` for that SID.

Event types (org webhook subscriptions):

- `org_market_wtb_new`, `org_market_wts_new`
- `org_order_accepted`, `org_order_ready`, `org_order_completed`

Org channel **includes** “member posted WTB” (unlike personal lane — org admins want activity visibility).

---

## Implementation order (Phase 2 site)

1. Edge function `refresh-rsi-affiliations` (extend or split from `validate-rsi-handle`)
2. RPC `verify_org_webhook_eligibility(user_id, org_sid)`
3. `/discord-subscribe` — “Org channels” section (scraped affiliations only)
4. `send-discord` — fourth fan-out branch on `target_org_sid`
5. Order triggers — emit org events from participant affiliations
6. Staff UI for `org_webhook_registration_requests`
7. Weekly affiliation refresh cron + revoke webhooks on rank loss

---

## Touchpoints (reference)

- [`supabase/functions/validate-rsi-handle/index.ts`](../supabase/functions/validate-rsi-handle/index.ts) — today: handle existence only
- [`src/routes/DiscordSubscribe.index.tsx`](../src/routes/DiscordSubscribe.index.tsx) — add org section later
- [`supabase/functions/send-discord/index.ts`](../supabase/functions/send-discord/index.ts) — org fan-out branch
