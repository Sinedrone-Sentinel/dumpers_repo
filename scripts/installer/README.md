# Dumper Apps Windows packaging

Two Windows delivery paths:

| Path | Project | Trust model |
|---|---|---|
| **Microsoft Store** | [`apps/bp-dumper-store/`](../../apps/bp-dumper-store/) | AppContainer — FolderPicker + FutureAccessList, **no `runFullTrust`**, no drive scan |
| **Standalone / scripts** | [`scripts/bp-dumper-py/`](../bp-dumper-py/) | Python console — may auto-detect / scan drives |

Shared protocol: [`scripts/bp-dumper-shared/PROTOCOL.md`](../bp-dumper-shared/PROTOCOL.md)  
Sync rule: [`.cursor/rules/dumper-dual-client-sync.mdc`](../../.cursor/rules/dumper-dual-client-sync.mdc)

## Store app (preferred for members)

See [`apps/bp-dumper-store/README.md`](../../apps/bp-dumper-store/README.md). **No Visual Studio required** — use `pwsh apps/bp-dumper-store/build-store.ps1` / `-Package`. Upload MSIX via Partner Center (identity locked to Store ID `9PMR8CPSB04K`).

## Standalone Python exe (CI / advanced)

```powershell
node scripts/copy-blueprint-lookup.mjs
pwsh scripts/installer/build-exe.ps1
```

Output: `scripts/installer/output/DumperApps.exe` (gitignored). Used by GitHub release automation and local testing — **not** offered as a member download on the site.

### Legacy full-trust MSIX (retired for Store)

`build-msix.ps1` + `msix/AppxManifest.xml.template` packaged the PyInstaller exe with `runFullTrust`. That Store vehicle is being replaced by the sandboxed WinUI app. Keep the scripts for reference until the Store listing ships the AppContainer package.

## CI

- **Release build:** `.github/workflows/build-releases.yml` — publishes **Python exe** to GitHub Release (tooling).
- Store MSIX is built from `apps/bp-dumper-store` (Visual Studio / future CI), not attached to public Releases.

After changing blueprint lookup data:

```bash
npm run copy-blueprint-lookup
npx supabase functions deploy log-watcher-webhook --no-verify-jwt
```
