# Dumper Apps Windows packaging

**Canonical path:** Python watcher → single-file exe.

| Path | Project | Notes |
|---|---|---|
| **Member Windows** | [`scripts/bp-dumper-py/`](../bp-dumper-py/) + this folder | Auto-detects Star Citizen install; CI publishes `DumperApps.exe` |
| **Microsoft Store** | [`apps/bp-dumper-store/`](../../apps/bp-dumper-store/) | Parked listing — not primary |

Trust / SignPath / OpenSSF: [`docs/TRUST_AND_SIGNING.md`](../../docs/TRUST_AND_SIGNING.md)

## Build the exe

```powershell
node scripts/copy-blueprint-lookup.mjs
pwsh scripts/installer/build-exe.ps1
```

Output: `scripts/installer/output/DumperApps.exe` (gitignored).

## CI

`.github/workflows/build-releases.yml` — builds the Python exe on `v*` tags, optionally SignPath-signs when secrets are configured, uploads to GitHub Release.

## Legacy full-trust MSIX

`build-msix.ps1` wrapped the exe with `runFullTrust` for an earlier Store experiment. Not used for the primary member path.

After changing blueprint lookup data:

```bash
npm run copy-blueprint-lookup
npx supabase functions deploy log-watcher-webhook --no-verify-jwt
```
