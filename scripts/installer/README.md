# Dumper Apps Windows build

Builds **`DumperApps.exe`** — a single-file Windows app (PyInstaller). No install wizard, no zip/SFX extractor. The filename is stable (no version suffix) so re-downloads overwrite the previous file.

Members: download from **Dumper Apps** on the site → run the exe → paste API key → done.

## App icon

Source art: `scripts/installer/bp-dumper-icon.png` (custom BP Dumper mark — not the site DR favicon).

- `generate-icon.ps1` / `generate_icon.py` → `dumper-apps.ico` + `tray.ico` (GitHub portable exe)
- `msix/generate-msix-assets.py` → Store/MSIX tile logos (local MSIX only)

## Local build (portable exe)

```powershell
node scripts/copy-blueprint-lookup.mjs
pwsh scripts/installer/build-exe.ps1
```

Output: `scripts/installer/output/DumperApps.exe` (gitignored)

## Microsoft Store MSIX (local / private only)

**Do not** attach `BPDumper.msix` to GitHub Releases or public workflow artifacts. Upload only via Partner Center (product **BP Dumper**, Store ID `9PMR8CPSB04K`).

Requires Windows 10/11 SDK (`MakeAppx.exe` on PATH or under `Windows Kits\10\bin`).

```powershell
node scripts/copy-blueprint-lookup.mjs
pwsh scripts/installer/build-exe.ps1
pwsh scripts/installer/build-msix.ps1
```

Output: `scripts/installer/output/BPDumper.msix` (gitignored)

Partner Center identity (locked in `msix/AppxManifest.xml.template`):

| Field | Value |
|---|---|
| Identity Name | `SinedroneSentinel.BPDumper` |
| Publisher | `CN=BB0EF4E0-83D8-4581-AB1E-92981A9DA66B` |
| Package Family Name | `SinedroneSentinel.BPDumper_fvbh2q0x73pq6` |
| DisplayName | `BP Dumper` |
| Store ID | `9PMR8CPSB04K` |

On submission, explain **runFullTrust**: Win32 console tool that reads Star Citizen `Game.log` / `logbackups` under the user install path and POSTs unlock events to the org webhook.

Store installs write `.env` / cache under `%LOCALAPPDATA%\BP Dumper` and update via the Store (not GitHub auto-update).

## CI

- **Smoke test:** Actions → **Test Windows portable build** → Run workflow.
- **Release build:** `.github/workflows/build-releases.yml` on tag / workflow_dispatch — publishes **exe only** (no MSIX).

After changing blueprint lookup data, redeploy the webhook:

```bash
npm run copy-blueprint-lookup
npx supabase functions deploy log-watcher-webhook --no-verify-jwt
```

## Legacy scripts

- `prepare-bundle.ps1` — old folder layout with embeddable Python (local dev only).
