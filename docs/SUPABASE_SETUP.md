# Supabase setup (greenfield)

Use this guide when standing up a **new** Dumper's Repo franchise database.

## If you already have a live database

If you previously ran incremental migrations `001`–`041` from `supabase/migrations_legacy/`, **do not** run the squashed baseline. Apply only new incremental files (e.g. `042_site_settings.sql`, `043_blueprint_order_overrides.sql`) as documented in release notes.

## 1. Create a Supabase project

1. [supabase.com](https://supabase.com) → New project
2. Note **Project URL** and **anon public** key for `.env`
3. Note **service_role** key (Settings → API) — needed for Edge Functions, keep secret

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

## 3. Run baseline SQL

In **SQL Editor**, run these files **in order** from `supabase/migrations/`:

1. `001_core_profiles_auth.sql` — profiles, auth trigger
2. `002_bans_admin.sql` — ban infrastructure (placeholder)
3. `003_blueprints_catalog.sql` — blueprint resources catalog
4. `004_resource_tracker.sql` — personal inventory, site totals
5. `005_orders_schema.sql` — custom orders system
6. `006_access_rls_functions.sql` — RLS policies, access functions
7. `042_site_settings.sql` — site-wide settings (DFP display toggle)
8. `043_blueprint_order_overrides.sql` — blueprint orderable overrides
9. `044_auto_approve_setting.sql` — auto-approve new signups toggle

Each file is idempotent where practical. Errors about existing objects usually mean the step already ran.

## 4. Deploy Edge Functions

The app requires three Edge Functions for admin operations:

```bash
# Install Supabase CLI if needed
npm install -g supabase

# Login and link to your project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Deploy functions
supabase functions deploy ban-user
supabase functions deploy unban-user
supabase functions deploy delete-account
```

These functions use `SUPABASE_SERVICE_ROLE_KEY` which is automatically available in the Edge Functions environment. **Do not** expose this key in frontend code.

## 5. Promote a super-admin

After your first Google sign-in (creates a `pending` profile), run:

```sql
UPDATE public.profiles
SET role = 'super-admin', approved_at = now()
WHERE email = 'your-google-email@example.com';
```

## 6. Configure the frontend

Copy `.env.example` to `.env` and fill in your values:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Optional (production franchises must use the canonical DFP host per LICENSE):

```env
# Dev only — local public/ copy from npm run build-dfp
# VITE_DFP_ENGINE_BASE_URL=http://localhost:5173
```

## 7. Build and host

```bash
npm install
npm run build
```

Deploy the `dist/` folder to your static host. See `docs/SELF_HOSTING.md` for hosting examples.

## 8. DFP canonical hosting

Franchise production apps load DFP from **https://www.dumpers-repo.com**. The reference deployment must publish:

- `/dfp-engine.js`
- `/dfp-version.json`

Configure **CORS** on your static host so franchise origins can fetch these files (e.g. `Access-Control-Allow-Origin: *` for those paths via Cloudflare or your CDN).

## Legacy migrations

`supabase/migrations_legacy/` (001–041) is historical audit only — **not** for new installs.
