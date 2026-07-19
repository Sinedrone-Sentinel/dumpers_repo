# Dumper Apps Windows portable build

Builds **`DumperApps-X.Y.Z.exe`** — a self-extracting portable bundle (bundled Python + BP Dumper scripts + `DumperApps.exe` launcher). No install wizard.

Members: download from **Dumper Apps** on the site → run the exe → paste API key → done.

## Local build

```powershell
node scripts/copy-blueprint-lookup.mjs
pwsh scripts/installer/prepare-bundle.ps1
choco install 7zip -y   # if needed
pwsh scripts/installer/build-portable.ps1
```

Output: `scripts/installer/output/DumperApps-1.5.0.exe`

## CI

- **Smoke test (no release):** Actions → **Test Windows portable build** → Run workflow.
- **Release build:** `.github/workflows/build-releases.yml` job **`build-windows-portable`** on tag / workflow_dispatch.

After changing blueprint lookup data, redeploy the webhook:

```bash
npm run copy-blueprint-lookup
npx supabase functions deploy log-watcher-webhook --no-verify-jwt
```
