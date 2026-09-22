# BP Dumper-GUI (Phase 1 — unpackaged exe)

Windows desktop GUI for BP Dumper. **Does not start watching on launch.**

Same `.env` keys as `DumperApps.exe` and `dumper.py`. Drop `BPDumperGUI.exe` next to an existing `.env` or use **File → Load Settings**.

This is **not** the member GitHub download and **not** a Store package. Member Windows download stays `DumperApps.exe`.

## Rights model

- You pick the Star Citizen LIVE folder (**File → Path to SC**). No drive scan.
- API key is typed in the header.
- Store / MSIX (Phase 2) stays AppContainer + `internetClient` + FolderPicker + FutureAccessList. Do not add `runFullTrust`.

## Build

```powershell
dotnet publish apps/bp-dumper-gui/BpDumperGui.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true
```

Output: `apps/bp-dumper-gui/bin/Release/net8.0-windows10.0.19041.0/win-x64/publish/BPDumperGUI.exe`

## Store MSIX (AppContainer, no runFullTrust)

```powershell
powershell -File apps/bp-dumper-gui/build-msix.ps1
```

Writes `Coding Projects\APP_Store Code\BP Dumper\BPDumper.msix` for Partner Center (listing 9PMR8CPSB04K). Capabilities: `internetClient` only. Does not launch the app.

## Use

1. Run the exe. It stays idle.
2. **File → Load Settings** an existing `.env`, or type the key and set options.
3. **File → Path to SC** — choose the LIVE folder that contains `Game.log`.
4. **File → Save Settings** writes `.env` beside the exe (or the file you loaded).
5. **Start** begins optional imports, then tails `Game.log` if Watch mode is on. The button becomes **Stop**.

## Shared mutex

`Local\DumpersRepo.BPDumper` — cannot run at the same time as `DumperApps.exe` or `dumper.py`.
