# Dumper Apps Windows build

Builds **`DumperApps.exe`** — a single-file Windows app (PyInstaller). No install wizard, no zip/SFX extractor. The filename is stable (no version suffix) so re-downloads overwrite the previous file.

Members: download from **Dumper Apps** on the site → run the exe → paste API key → done.

## Local build

```powershell
node scripts/copy-blueprint-lookup.mjs
pwsh scripts/installer/build-exe.ps1
```

Output: `scripts/installer/output/DumperApps.exe`

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
