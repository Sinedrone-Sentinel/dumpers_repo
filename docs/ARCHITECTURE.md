# Architecture (high-level design)

This document describes the major **actions and actors** in the software produced by `dumpers_repo`.

## Products

1. **Dumper's Repo site** — static React SPA (`src/`) built with Vite, hosted as static files (GitHub Pages for the official deployment).
2. **Backend data & auth** — Supabase (Postgres + Auth + Realtime + Edge Functions). The browser uses the **anon** key; authorization is enforced with **RLS** and **SECURITY DEFINER** RPCs.
3. **Dumper Apps (BP Dumper)** — canonical Windows client is native Go (`scripts/bp-dumper-go/`) packaged as `DumperApps.exe` via `scripts/installer/build-exe.ps1` and published on GitHub Releases. Python (`scripts/bp-dumper-py/`) is the reference / non-Windows zip. The app reads local Star Citizen logs and posts events to the official webhook using the member's personal API key (`dr_…`).

```
  [Browser / Offline Mode]
           |  HTTPS
           v
  [Static SPA on GitHub Pages]
           |  Supabase JS (anon JWT)
           v
  [Supabase Auth + PostgREST + Edge Functions]
           |
           +--> Postgres (RLS / DEFINER RPCs)
           +--> Discord queue (server-side only)

  [DumperApps.exe on member PC]
           |  HTTPS + Bearer dr_…
           v
  [log-watcher Edge Function / webhook]
           |
           v
  [Supabase — blueprint / mission updates for that member]
```

## Actors

| Actor | Trust | Capabilities |
|-------|-------|--------------|
| Guest / Offline user | Low | Local tools; limited public pages; browser storage only |
| Signed-in member | Medium | Own data via RLS; marketplace via DEFINER RPCs; optional Dumper API key |
| Officer / site admin (app role) | Medium-high | Support/moderation UI; not GitHub admin by default |
| Lead maintainer | High | GitHub admin, production secrets, releases |
| GitHub Actions | High (trusted on `main`/tags) | Build, deploy, release; PR workflows are least-privilege |
| Supabase service_role | Highest | Edge Functions / server only — never in `VITE_*` |

## Trust boundaries

- **Browser ↔ Supabase:** untrusted client; must not receive service-role keys; privileged profile columns and Discord queue EXECUTE are not member-writable.
- **Dumper Apps ↔ webhook:** authenticated with member API key; no RSI/CIG passwords.
- **CI PR vs deploy:** pull_request jobs must not access deploy/signing secrets; tag/main workflows may publish releases.

## Major flows

- **Craft / track / market:** SPA calls PostgREST selects + RPCs; mutations for orders/listings go through DEFINER RPCs (not client `.insert`/`.update` on those tables).
- **RSI verify:** member **Link Citizen iD** OAuth (`link-citizenid` / `citizenid-oauth-callback`); Spectrum snapshot + tokens stored server-side; bio-code scrape is gone.
- **Advisor / Help:** member JWT + the member's own Gemini key; Edge Functions `mining-loadout-advisor` and `site-help-bot` call Google Gemini. Saved keys are browser-encrypted ciphertext on the profile.
- **BP Dumper sync:** local log parse → HTTPS post → Edge validates key → DB update for that user.
- **Release:** tag `v*` → `build-releases.yml` builds the Go exe → checksums + cosign-signed manifest → VirusTotal gate → GitHub Release assets (Authenticode-unsigned).

See also [SECURITY.md](../SECURITY.md) and [docs/SECURITY_ASSURANCE.md](SECURITY_ASSURANCE.md).
