# Dumper Apps Windows packaging

**Canonical path:** native Go watcher → `DumperApps.exe` (no PyInstaller / no UPX).

| Path | Project | Notes |
|---|---|---|
| **Member Windows** | [`scripts/bp-dumper-go/`](../bp-dumper-go/) + this folder | Auto-detects Star Citizen install; CI publishes `DumperApps.exe` |
| **Python reference** | [`scripts/bp-dumper-py/`](../bp-dumper-py/) | Protocol/behavior source; macOS/Linux scripts |
| **Legacy Store experiment** | [`apps/bp-dumper-store/`](../../apps/bp-dumper-store/) | Not offered in member UI |

Trust / OpenSSF / VirusTotal / checksums: [`docs/TRUST_AND_SIGNING.md`](../../docs/TRUST_AND_SIGNING.md)

## Build the exe

```powershell
node scripts/copy-blueprint-lookup.mjs
pwsh scripts/installer/build-exe.ps1
```

Requires Go on `PATH`. Output: `scripts/installer/output/DumperApps.exe` (gitignored).

## Store / full-trust MSIX (Partner Center)

When Windows Defender blocks the portable GitHub `DumperApps.exe`, members can use the
Microsoft Store listing (`runFullTrust` package wrapping the same Go exe).

```powershell
node scripts/copy-blueprint-lookup.mjs
pwsh scripts/installer/build-exe.ps1
pwsh scripts/installer/build-msix.ps1
```

Output: `scripts/installer/output/BPDumper.msix` (upload in Partner Center).

Store installs write `.env` / cache under `%LOCALAPPDATA%\BP Dumper` (WindowsApps is
read-only). If Star Citizen is not auto-detected, the app **keeps asking** for the LIVE
folder path (the folder that contains `Game.log`) instead of exiting.

## CI

`.github/workflows/build-releases.yml` — builds the Go exe on `v*` tags, runs the VirusTotal gate (`VT_GATE_MODE=named`), uploads SHA256SUMS + cosign signature, then publishes the draft GitHub Release.

After changing blueprint lookup data:

```bash
npm run copy-blueprint-lookup
npx supabase functions deploy log-watcher-webhook --no-verify-jwt
```
