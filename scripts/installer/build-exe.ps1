# Build a single-file DumperApps exe with PyInstaller (no zip/SFX wrapper).
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

$bpDir = Join-Path $RepoRoot "scripts/bp-dumper-py"
$lookupPath = Join-Path $bpDir "lookup.json"
$iconPath = Join-Path $PSScriptRoot "dumper-apps.ico"
$workDir = Join-Path $PSScriptRoot "pyinstaller-work"
$exeName = "DumperApps.exe"
$exePath = Join-Path $OutputDir $exeName

if (-not (Test-Path $lookupPath)) {
    throw "Missing $lookupPath (run: node scripts/copy-blueprint-lookup.mjs)"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
if (Test-Path $workDir) {
    Remove-Item -Recurse -Force $workDir
}
New-Item -ItemType Directory -Force -Path $workDir | Out-Null
if (Test-Path $exePath) {
    Remove-Item -Force $exePath
}

Write-Step "Installing build dependencies"
python -m pip install --upgrade pip --quiet
python -m pip install -r (Join-Path $bpDir "requirements.txt") pyinstaller pillow --quiet

Write-Step "Generating BP Dumper icon"
& (Join-Path $PSScriptRoot "generate-icon.ps1") -RepoRoot $RepoRoot

Write-Step "Building single-file DumperApps exe"
$versionJson = Join-Path $RepoRoot "scripts/bp-dumper/version.json"
$bundledVersionJson = Join-Path $bpDir "dumper-version.json"
Copy-Item $versionJson $bundledVersionJson -Force
$addLookup = "$lookupPath;."
$addVersion = "$bundledVersionJson;."
python -m PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --console `
    --name "DumperApps" `
    --icon $iconPath `
    --distpath $OutputDir `
    --workpath $workDir `
    --specpath $workDir `
    --hidden-import "_version" `
    --hidden-import "_min_game_version" `
    --add-data $addLookup `
    --add-data $addVersion `
    (Join-Path $bpDir "dumper.py")

if (-not (Test-Path $exePath)) {
    throw "PyInstaller did not produce $exePath"
}

Write-Step "Build complete: $exePath"
Get-Item $exePath | ForEach-Object {
    Write-Host ("Size: {0:N1} MB" -f ($_.Length / 1MB))
}
