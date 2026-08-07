# BP Dumper — Microsoft Store (sandboxed)

WinUI 3 / Windows App SDK **AppContainer** client for Partner Center product **BP Dumper** (`9PMR8CPSB04K`).

**You do not need Visual Studio.** The .NET 8 SDK + this repo’s scripts are enough for build/pack.

- **No `runFullTrust`** — only `internetClient`
- User picks Star Citizen **LIVE** (or channel) folder via **FolderPicker**
- Grant persisted with **FutureAccessList**
- **Does not** scan drives (that stays in the Python standalone)

Shared wire contract: [`../../scripts/bp-dumper-shared/PROTOCOL.md`](../../scripts/bp-dumper-shared/PROTOCOL.md)  
Sync rule: [`.cursor/rules/dumper-dual-client-sync.mdc`](../../.cursor/rules/dumper-dual-client-sync.mdc)

## Prerequisites (no Visual Studio)

1. **.NET 8 SDK** — [download](https://dotnet.microsoft.com/download/dotnet/8.0) or `winget install Microsoft.DotNet.SDK.8`
2. Optional for MSIX packaging: **Windows 10/11 SDK** (often already present; provides MSBuild Appx targets). If `-Package` fails asking for tooling, install [Windows SDK](https://developer.microsoft.com/windows/downloads/windows-sdk/) or the lighter [Build Tools for Visual Studio](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022) with the **.NET desktop build tools** + **Windows SDK** workloads (still not the full IDE).

Editor: **VS Code** + C# Dev Kit is fine for editing.

## Build

```powershell
cd apps/bp-dumper-store
pwsh ./build-store.ps1
# or:
dotnet build BpDumperStore\BpDumperStore.csproj -c Debug -p:Platform=x64
```

## Package MSIX for Partner Center

```powershell
cd apps/bp-dumper-store
pwsh ./build-store.ps1 -Config Release -Package
```

`-Package` copies the uploadable file to your usual drop folder:

`Coding Projects\APP_Store Code\BP Dumper\BPDumper.msix`

(build tree also under `AppPackages\`). Store re-signs on ingest. Do **not** attach Store MSIX to public GitHub Releases.

## Status

MVP scaffold:

- [x] FolderPicker + FutureAccessList
- [x] API key + webhook client (protocol headers)
- [x] Minimal Game.log tail + `blueprint_received`
- [x] CLI build/pack without Visual Studio
- [ ] Full mission / session / live-tracker parity with Python (dual-client sync rule)
