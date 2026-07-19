# Dumper Apps Windows build

Builds **`DumperApps-X.Y.Z.exe`** — a single-file Windows app (PyInstaller) with the DR logo embedded. No install wizard, no zip/SFX extractor.

Members: download from **Dumper Apps** on the site → run the exe → paste API key → done.

## Local build

```powershell
node scripts/copy-blueprint-lookup.mjs
pwsh scripts/installer/build-exe.ps1
```

Output: `scripts/installer/output/DumperApps-1.7.4.exe`

Icon source: `public/favicon.png` → `scripts/installer/dumper-apps.ico` (regenerated each build).

## CI

- **Smoke test:** Actions → **Test Windows portable build** → Run workflow.
- **Release build:** `.github/workflows/build-releases.yml` on tag / workflow_dispatch.

After changing blueprint lookup data, redeploy the webhook:

```bash
npm run copy-blueprint-lookup
npx supabase functions deploy log-watcher-webhook --no-verify-jwt
```

## Legacy scripts

- `prepare-bundle.ps1` — old folder layout with embeddable Python (local dev only).
- `build-portable.ps1` — deprecated 7-Zip SFX wrapper; do not use.
