# Dumper Apps Windows packaging

**Canonical path:** native Go watcher → `DumperApps.exe` (no PyInstaller / no UPX).

| Path | Project | Notes |
|---|---|---|
| **Member Windows (recommended)** | Microsoft Store | Listed in the Dumper Apps modal. Package source is not in this repo |
| **Windows exe (alternate)** | [`scripts/bp-dumper-go/`](../bp-dumper-go/) + this folder | Auto-detects Star Citizen install; CI publishes `DumperApps.exe` |
| **Python reference** | [`scripts/bp-dumper-py/`](../bp-dumper-py/) | Protocol/behavior source; macOS/Linux scripts |

Trust / OpenSSF / VirusTotal / checksums: [`docs/TRUST_AND_SIGNING.md`](../../docs/TRUST_AND_SIGNING.md)

## Build the exe (GitHub Releases / portable)

```powershell
node scripts/copy-blueprint-lookup.mjs
pwsh scripts/installer/build-exe.ps1
```

Requires Go on `PATH`. Output: `scripts/installer/output/DumperApps.exe` (gitignored).

Do not build or attach a Store package from this repo. `scripts/installer/build-msix.ps1` is not the member Store upload.

## CI

`.github/workflows/build-releases.yml` — builds the Go exe on `v*` tags, runs the VirusTotal gate (`VT_GATE_MODE=named`), uploads SHA256SUMS + cosign signature, then publishes the draft GitHub Release.

After changing blueprint lookup data:

```bash
npm run copy-blueprint-lookup
npx supabase functions deploy log-watcher-webhook --no-verify-jwt
```
