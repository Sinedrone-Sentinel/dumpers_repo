# Self-Hosting Guide

This guide covers deploying your own Dumper's Repo franchise instance.

## Prerequisites

- Node.js 18+
- A Supabase project (see `SUPABASE_SETUP.md`)
- A static file hosting provider

## Quick Start

1. Clone the repository
2. Copy `.env.example` to `.env` and configure Supabase credentials
3. Run database migrations (see `SUPABASE_SETUP.md`)
4. Deploy Edge Functions
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

## Branding Customization

Franchises may customize these values in `src/config/site.ts`:

| Constant | Purpose | Customizable |
|----------|---------|--------------|
| `SITE_URL` | Canonical URL for SEO | Yes |
| `SITE_TITLE` | Browser title, meta tags | Yes |
| `SITE_DESCRIPTION` | Meta description | Yes |
| `SITE_COPYRIGHT` | Footer copyright text | Yes (per TRADEMARK.md) |
| `SITE_SLOGAN` | Tagline displayed in UI | Yes |
| `SITE_BRAND_*` | Brand colors, fonts, logo | No (see LICENSE) |
| `DFP_OFFICIAL_HOSTS` | Reference deployment hosts | No |
| `DFP_CANONICAL_BASE_URL` | DFP engine source | No |

Also update `index.html` for:
- `<title>` tag
- `og:*` meta tags
- `twitter:*` meta tags
- Canonical URL

## DFP Engine (Important)

Per the LICENSE, franchise deployments **must** load the DFP engine from the canonical host (`dumpers-repo.com` or the GitHub raw URL). Do not bundle or self-host the DFP engine in production.

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
The canonical DFP host (`raw.githubusercontent.com`) serves `Access-Control-Allow-Origin: *`. If you see CORS errors, check that you're not accidentally trying to load from a different origin.

### Edge Functions not working
1. Verify functions are deployed: `supabase functions list`
2. Check function logs: `supabase functions logs ban-user`
3. Ensure `SUPABASE_SERVICE_ROLE_KEY` is set in Supabase dashboard

### Google OAuth redirect errors
1. Verify redirect URIs in Google Cloud Console match Supabase callback URL
2. Check Site URL in Supabase Authentication settings
3. Ensure your app origin is in the allowed redirect URLs
