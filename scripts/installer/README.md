# Dumper Apps Windows installer

Builds **`DumperApps-Setup-X.Y.Z.exe`** — a self-contained install with bundled Python and the BP Dumper (blueprint log watcher + Live Mission Tracker).

Members: download from **Dumper Apps** on the site → run the installer → paste API key → done.

## Local build (maintainers)

Requires **Windows**, **Inno Setup 6**, **git**, and network.

**CI fast path:** GitHub Actions pre-installs Python deps into a venv, then `prepare-bundle.ps1` copies them into the staging folder.

```powershell
cd "Dumpers Repo"
node scripts/copy-blueprint-lookup.mjs
pwsh scripts/installer/prepare-bundle.ps1
& "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" /DAppVersion=1.5.0 scripts/installer/dumper-apps.iss
```

Output: `scripts/installer/output/DumperApps-Setup-1.5.0.exe`

## CI

- **Smoke test (no release):** Actions → **Test Windows Installer Build** → Run workflow. Downloads the `DumperApps-Setup-test` artifact when green.
- **Release build:** `.github/workflows/build-releases.yml` job **`build-windows-installer`** on tag / workflow_dispatch.
