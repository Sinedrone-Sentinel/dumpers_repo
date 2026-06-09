# Supabase setup (greenfield)

Use this guide when standing up a **new** Dumper's Repo franchise database.

## If you already have a live database

If you previously ran incremental migrations `001`–`041` from `supabase/migrations_legacy/`, **do not** run the squashed baseline. Apply only new incremental files (e.g. `042_site_settings.sql`) as documented in release notes.

## 1. Create a Supabase project

1. [supabase.com](https://supabase.com) → New project
2. Note **Project URL** and **anon public** key for `.env`

## 2. Enable Google OAuth

Authentication → Providers → Google → enable and set redirect URLs for your app origin(s).

## 3. Run baseline SQL

In **SQL Editor**, run these files **in order** from `supabase/migrations/`:

1. `001_core_profiles_auth.sql`
2. `002_bans_admin.sql` (no-op placeholder)
3. `003_blueprints_catalog.sql`
4. `004_resource_tracker.sql`
5. `005_orders_schema.sql`
6. `006_access_rls_functions.sql`

Each file is idempotent where practical. Errors about existing objects usually mean the step already ran.

## 4. Promote a super-admin

After your first Google sign-in (creates a `pending` profile), run:

```sql
UPDATE public.profiles
SET role = 'super-admin', approved_at = now()
WHERE email = 'your-google-email@example.com';
```

## 5. Configure the frontend

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Optional (production franchises must use the canonical DFP host per LICENSE):

```env
# Dev only — local public/ copy from npm run build-dfp
# VITE_DFP_ENGINE_BASE_URL=http://localhost:5173
```

## 6. Build and host

```bash
npm install
npm run build
```

Deploy the `dist/` folder to your static host. The app is **not** tied to GitHub Pages.

## 7. DFP canonical hosting

Franchise production apps load DFP from **https://www.dumpers-repo.com**. The reference deployment must publish:

- `/dfp-engine.js`
- `/dfp-version.json`

Configure **CORS** on your static host so franchise origins can fetch these files (e.g. `Access-Control-Allow-Origin: *` for those paths via Cloudflare or your CDN).

## Legacy migrations

`supabase/migrations_legacy/` (001–041) is historical audit only — **not** for new installs.
