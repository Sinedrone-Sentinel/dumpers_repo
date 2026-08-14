# Dumper Apps Windows packaging

**Canonical path:** native Go watcher → `DumperApps.exe` (no PyInstaller / no UPX).

| Path | Project | Notes |
|---|---|---|
| **Member Windows** | [`scripts/bp-dumper-go/`](../bp-dumper-go/) + this folder | Auto-detects Star Citizen install; CI publishes `DumperApps.exe` |
| **Python reference** | [`scripts/bp-dumper-py/`](../bp-dumper-py/) | Protocol/behavior source; macOS/Linux scripts |
| **Microsoft Store (Partner Center)** | [`apps/bp-dumper-store/`](../../apps/bp-dumper-store/) | **AppContainer only** — FolderPicker, **no `runFullTrust`** |

Trust / OpenSSF / VirusTotal / checksums: [`docs/TRUST_AND_SIGNING.md`](../../docs/TRUST_AND_SIGNING.md)

## Build the exe (GitHub Releases / portable)

```powershell
node scripts/copy-blueprint-lookup.mjs
pwsh scripts/installer/build-exe.ps1
```

Requires Go on `PATH`. Output: `scripts/installer/output/DumperApps.exe` (gitignored).

## Store MSIX (Partner Center) — AppContainer ONLY

Upload **only** the WinUI AppContainer package:

```powershell
cd apps/bp-dumper-store
pwsh ./build-store.ps1 -Config Release -Package
```

That copies `BPDumper.msix` to `Coding Projects\APP_Store Code\BP Dumper\`.

**Do not** upload `scripts/installer/build-msix.ps1` output to Partner Center. That wraps
`DumperApps.exe` with `runFullTrust` / `Windows.FullTrustApplication` and is **rejected /
forbidden** for this Store listing.

## Local full-trust MSIX (NOT for Store)

`build-msix.ps1` exists for local/private packaging experiments only. It must **never**
be submitted to Partner Center for product `9PMR8CPSB04K`.

## CI

`.github/workflows/build-releases.yml` — builds the Go exe on `v*` tags, runs the VirusTotal gate (`VT_GATE_MODE=named`), uploads SHA256SUMS + cosign signature, then publishes the draft GitHub Release. Does **not** build or publish Store MSIX.

After changing blueprint lookup data:

```bash
npm run copy-blueprint-lookup
npx supabase functions deploy log-watcher-webhook --no-verify-jwt
```
