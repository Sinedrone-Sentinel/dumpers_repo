# Build native Windows DumperApps.exe with Go (no PyInstaller / no UPX).
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path,
    [string]$OutputDir = (Join-Path $PSScriptRoot "output"),
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host ("==> [{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $Message) -ForegroundColor Cyan
}

if (-not $Version) {
    $versionFile = Join-Path $RepoRoot "scripts/bp-dumper/version.json"
    $Version = (Get-Content $versionFile -Raw | ConvertFrom-Json).version
}

$goDir = Join-Path $RepoRoot "scripts/bp-dumper-go"
$lookupPath = Join-Path $goDir "lookup.json"
$pyLookupPath = Join-Path $RepoRoot "scripts/bp-dumper-py/lookup.json"
$iconPath = Join-Path $PSScriptRoot "dumper-apps.ico"
$exeName = "DumperApps.exe"
$exePath = Join-Path $OutputDir $exeName

if (-not (Test-Path $lookupPath)) {
    if (Test-Path $pyLookupPath) {
        Copy-Item $pyLookupPath $lookupPath -Force
    } else {
        throw "Missing $lookupPath (run: node scripts/copy-blueprint-lookup.mjs)"
    }
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
if (Test-Path $exePath) {
    Remove-Item -Force $exePath
}

# Keep embed + ldflags in sync with release version / min game version
$utf8 = New-Object System.Text.UTF8Encoding $false
$versionTxt = Join-Path $goDir "version.txt"
[System.IO.File]::WriteAllText($versionTxt, $Version, $utf8)
$pyMin = Join-Path $RepoRoot "scripts/bp-dumper-py/_min_game_version.py"
if (Test-Path $pyMin) {
    $minLine = Select-String -Path $pyMin -Pattern 'MIN_GAME_VERSION\s*=\s*"([^"]+)"' | Select-Object -First 1
    if ($minLine) {
        [System.IO.File]::WriteAllText((Join-Path $goDir "mingame.txt"), $minLine.Matches[0].Groups[1].Value, $utf8)
    }
}

Write-Step "Generating BP Dumper icon"
& (Join-Path $PSScriptRoot "generate-icon.ps1") -RepoRoot $RepoRoot

Write-Step "Embedding PE version info (SignPath product metadata)"
$parts = @($Version.Split('.') + @('0', '0', '0', '0'))[0..3] | ForEach-Object { [int]($_ -replace '[^0-9]', '0') }
$fileVers = ($parts -join '.')
$sysoPath = Join-Path $goDir "resource.syso"
if (Test-Path $sysoPath) {
    Remove-Item -Force $sysoPath
}
$versionInfoJson = Join-Path $goDir "versioninfo.json"
@"
{
  "FixedFileInfo": {
    "FileVersion": { "Major": $($parts[0]), "Minor": $($parts[1]), "Patch": $($parts[2]), "Build": $($parts[3]) },
    "ProductVersion": { "Major": $($parts[0]), "Minor": $($parts[1]), "Patch": $($parts[2]), "Build": $($parts[3]) },
    "FileFlagsMask": "3f",
    "FileFlags": "00",
    "FileOS": "040004",
    "FileType": "01",
    "FileSubType": "00"
  },
  "StringFileInfo": {
    "CompanyName": "Dumper's Repo",
    "FileDescription": "Dumper Apps",
    "FileVersion": "$Version",
    "InternalName": "DumperApps",
    "LegalCopyright": "Copyright (c) Michael Linzenmeyer",
    "OriginalFilename": "DumperApps.exe",
    "ProductName": "Dumper Apps",
    "ProductVersion": "$Version"
  },
  "VarFileInfo": { "Translation": { "LangID": "0409", "CharsetID": "04B0" } },
  "IconPath": "$($iconPath -replace '\\','/')"
}
"@ | ForEach-Object { [System.IO.File]::WriteAllText($versionInfoJson, $_, $utf8) }

Push-Location $goDir
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
go run github.com/josephspurrier/goversioninfo/cmd/goversioninfo@v1.4.1 `
    -64 `
    -o resource.syso `
    -icon="$iconPath" `
    -product-version="$fileVers" `
    -file-version="$fileVers" `
    versioninfo.json
$verInfoOk = ($LASTEXITCODE -eq 0) -and (Test-Path $sysoPath)
if (-not $verInfoOk) {
    Write-Warning "goversioninfo failed (exit $LASTEXITCODE); building without PE version resource"
    if (Test-Path $sysoPath) { Remove-Item -Force $sysoPath }
}
$ErrorActionPreference = $prevEap

Write-Step "Building native DumperApps.exe (Go)"
$env:CGO_ENABLED = "0"
$env:GOOS = "windows"
$env:GOARCH = "amd64"
go build -trimpath -ldflags "-s -w -X main.Version=$Version" -o $exePath .
if ($LASTEXITCODE -ne 0) {
    if (Test-Path $sysoPath) {
        Write-Warning "go build failed with resource.syso; retrying without PE version resource"
        Remove-Item -Force $sysoPath
        go build -trimpath -ldflags "-s -w -X main.Version=$Version" -o $exePath .
    }
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        throw "go build failed with exit code $LASTEXITCODE"
    }
}
Pop-Location

# Clean generated build artifacts from the module tree
foreach ($junk in @($sysoPath, $versionInfoJson, (Join-Path $goDir "DumperApps.exe"))) {
    if ((Test-Path $junk) -and ($junk -ne $exePath)) {
        Remove-Item -Force $junk -ErrorAction SilentlyContinue
    }
}

if (-not (Test-Path $exePath)) {
    throw "Go build did not produce $exePath"
}

Write-Step "Build complete: $exePath"
Get-Item $exePath | ForEach-Object {
    Write-Host ("Size: {0:N1} MB" -f ($_.Length / 1MB))
}
