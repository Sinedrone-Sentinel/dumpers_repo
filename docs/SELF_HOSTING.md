# Operator deploy guide

Deploy notes for operators (including the official site at [dumpers-repo.com](https://dumpers-repo.com)).

Source is **Apache-2.0** ([LICENSE](../LICENSE)). Forks/self-hosts must **rebrand** ([TRADEMARK.md](../TRADEMARK.md)) and must **not** redistribute the DFP engine ([LICENSE.DFP](../LICENSE.DFP)).

## Prerequisites

- Node.js 22+ and npm 11+ (see `.nvmrc`)
- A Supabase project (see `SUPABASE_SETUP.md`)
- A static file hosting provider

## Quick Start

1. Clone the repository
2. Copy `.env.example` to `.env` and configure Supabase credentials
3. Run all database migrations in numeric order (currently through **`118_drop_game_data_mirror_tables.sql`**) — see [docs/SUPABASE_SETUP.md](SUPABASE_SETUP.md)
4. Deploy Edge Functions (`ban-user`, `unban-user`, `delete-account`, `validate-rsi-handle`, `send-discord`, `log-watcher-webhook`)
5. Build and deploy

```bash
npm install
npm run build
# Deploy dist/ to your host
```

## Hosting Options

The app is a static SPA that requires client-side routing (all paths serve `index.html`).

### GitHub Pages

Already configured via `.github/workflows/deploy.yml`. Set repository secrets:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The build script creates `dist/404.html` and `dist/.nojekyll` automatically.

### Cloudflare Pages

1. Connect your repository
2. Build command: `npm run build`
3. Output directory: `dist`
4. Add environment variables in dashboard

Cloudflare Pages handles SPA routing automatically.

### Nginx

```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/dumpers-repo/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### AWS S3 + CloudFront

1. Create S3 bucket with static website hosting
2. Set index document: `index.html`
3. Set error document: `index.html` (for SPA routing)
4. Create CloudFront distribution pointing to S3
5. Configure custom error response: 404 → `/index.html` with 200 status

### Vercel / Netlify

Both platforms detect Vite projects automatically and handle SPA routing. Just connect your repository and set environment variables.

## Site config (`src/config/site.ts`)

| Constant | Purpose |
|----------|---------|
| `SITE_URL` | Canonical URL for SEO (apex preferred; redirect www→apex at the host) |
| `SITE_TITLE` | Default browser title / OG fallback (per-route titles in `src/config/seo.ts`) |
| `SITE_DESCRIPTION` | Default meta description / OG fallback |
| `SEO_GOOGLE_SITE_VERIFICATION` | Optional Search Console HTML-tag token (`src/config/seo.ts`) |
| `SITE_COPYRIGHT` | Footer copyright text |
| `SITE_SUPPORT_URL` / `SITE_SUPPORT_LABEL` | Optional quiet footer tip link (e.g. Ko-fi); clear URL to hide |
| `SITE_SLOGAN` | Tagline displayed in UI |
| `SITE_BRAND_*` | Dumper's Repo header colors, fonts, product mark |
| `DFP_OFFICIAL_HOSTS` | Official production hostnames |
| `DFP_CANONICAL_BASE_URL` | DFP engine source for non-official hosts (dev / protected) |

### Org logo (blueprint modal flip)

Super-admins upload a **PNG org logo** under **Settings → Site**. Requirements:

- PNG only (`ORG_LOGO.png` in Supabase Storage bucket `org-logo`)
- 64–2048 pixels per side, max 512 KB
- Transparent background recommended

Apply migration **`089_org_logo.sql`** before using upload. Until then, members see the
shipped default at `public/org-logo-default.svg` (Dumper's Repo + slogan). Your
custom PNG replaces that default after upload.

For local dev you may keep a gitignored `public/ORG_LOGO.png` (see `.gitignore`).
Production should use the Settings upload so the logo is not baked into `dist/`.

Also update `index.html` for:
- `<title>` tag
- `og:*` meta tags
- `twitter:*` meta tags
- Canonical URL

`npm run build` also:
- Injects `SITE_*` into `index.html` / `dist/index.html`
- Prerenders public/offline routes (Playwright Chromium) so crawlers see real HTML
- Writes `dist/sitemap.xml` (see `public/robots.txt`)
- Copies the SPA shell to `dist/404.html` for GitHub Pages deep links

Install browsers once locally: `npx playwright install chromium`. CI does this in the deploy workflow.

After go-live: verify the property in Google Search Console, set `SEO_GOOGLE_SITE_VERIFICATION` if using the meta-tag method, and submit `https://dumpers-repo.com/sitemap.xml`. Prefer a single canonical host (apex **or** www) with a 301 redirect for the other.

## DFP Engine (Important)

Production loads DFP from the official host (`https://www.dumpers-repo.com` / same-origin). Do not rehost or replace the engine.

The `VITE_DFP_ENGINE_BASE_URL` environment variable is for **local development only**.

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `VITE_DFP_ENGINE_BASE_URL` | No | Dev only: override DFP engine host |
| `VITE_BUILD_ID` | No | Build identifier for cache busting |

## Troubleshooting

### 404 on page refresh
Your host isn't configured for SPA routing. All paths need to serve `index.html`.

### CORS errors loading DFP
Prefer same-origin DFP on dumpers-repo.com / www. If you override `VITE_DFP_ENGINE_BASE_URL` in local dev, ensure that host allows your origin.

### Edge Functions not working
1. Verify functions are deployed: `npx supabase functions list`
2. Required functions: `ban-user`, `unban-user`, `delete-account`, `validate-rsi-handle`, `send-discord`, `log-watcher-webhook`
3. Check function logs: `npx supabase functions logs send-discord`
4. Discord queue cron requires **pg_cron** + **pg_net** (see `SUPABASE_SETUP.md` migrations 065–068)
5. Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in Supabase dashboard

### Google OAuth redirect errors
1. Verify redirect URIs in Google Cloud Console match Supabase callback URL
2. Check Site URL in Supabase Authentication settings
3. Ensure your app origin is in the allowed redirect URLs
