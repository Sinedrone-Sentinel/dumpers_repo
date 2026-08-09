# Dumper Apps Windows packaging

**Canonical path:** native Go watcher → `DumperApps.exe` (no PyInstaller / no UPX).

| Path | Project | Notes |
|---|---|---|
| **Member Windows** | [`scripts/bp-dumper-go/`](../bp-dumper-go/) + this folder | Auto-detects Star Citizen install; CI publishes `DumperApps.exe` |
| **Python reference** | [`scripts/bp-dumper-py/`](../bp-dumper-py/) | Protocol/behavior source; macOS/Linux scripts |
| **Legacy Store experiment** | [`apps/bp-dumper-store/`](../../apps/bp-dumper-store/) | Not offered in member UI |

Trust / SignPath / OpenSSF / VirusTotal: [`docs/TRUST_AND_SIGNING.md`](../../docs/TRUST_AND_SIGNING.md)

## Build the exe

```powershell
node scripts/copy-blueprint-lookup.mjs
pwsh scripts/installer/build-exe.ps1
```

Requires Go on `PATH`. Output: `scripts/installer/output/DumperApps.exe` (gitignored).

## CI

`.github/workflows/build-releases.yml` — builds the Go exe on `v*` tags, optionally SignPath-signs when secrets are configured, runs the VirusTotal gate (`VT_GATE_MODE=named`), then publishes the draft GitHub Release.

## Legacy full-trust MSIX

`build-msix.ps1` wrapped the exe with `runFullTrust` for an earlier Store experiment. Not used for the primary member path.

After changing blueprint lookup data:

```bash
npm run copy-blueprint-lookup
npx supabase functions deploy log-watcher-webhook --no-verify-jwt
```
