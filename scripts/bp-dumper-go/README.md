# BP Dumper (native Windows)

Windows member build of **DumperApps.exe** — Go port of the Python watcher in
`scripts/bp-dumper-py/`.

| Platform | Client |
|---|---|
| Windows (GitHub Releases) | **This module** → `DumperApps.exe` |
| macOS / Linux / scripts | `scripts/bp-dumper-py/dumper.py` |

Wire protocol: [`scripts/bp-dumper-shared/PROTOCOL.md`](../bp-dumper-shared/PROTOCOL.md).

## Why Go on Windows

PyInstaller `--onefile` shared bootloaders are frequently flagged by AV / VirusTotal
(e.g. `Trojan:Win32/Wacatac.B!ml`) even when the app is clean. A native Go binary
avoids that packaging fingerprint. The VirusTotal publish gate still requires
**0 malicious** before a release leaves draft.

## Build

```powershell
node scripts/copy-blueprint-lookup.mjs
.\scripts\installer\build-exe.ps1 -Version 1.16.0
# → scripts/installer/output/DumperApps.exe
```

Or locally:

```powershell
cd scripts/bp-dumper-go
go build -ldflags "-s -w -X main.Version=1.16.0" -o DumperApps.exe .
```

Do **not** UPX-pack or re-wrap the exe.

## Member setup notes

- Leave the LIVE path blank in the wizard to **auto-detect** Star Citizen (drive search for LIVE / Game.log), or paste a path to override.
- Updates are **manual**: download a new `DumperApps.exe` from GitHub Releases when prompted (HTTP 426). No auto-download/self-replace.
