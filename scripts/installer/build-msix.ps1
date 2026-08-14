# Build a LOCAL/PRIVATE full-trust MSIX from DumperApps.exe.
#
# *** NOT FOR MICROSOFT STORE / PARTNER CENTER ***
# This package uses runFullTrust + Windows.FullTrustApplication.
# Partner Center product 9PMR8CPSB04K requires the AppContainer WinUI app:
#   apps/bp-dumper-store → pwsh ./build-store.ps1 -Config Release -Package
#
# Do NOT copy this output to APP_Store Code or upload it to Partner Center.
# Do NOT attach to GitHub Releases.
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path,
    [string]$OutputDir = (Join-Path $PSScriptRoot "output"),
    [string]$ExePath = "",
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host ("==> [{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $Message) -ForegroundColor Cyan
}

function ConvertTo-MsixVersion([string]$SemVer) {
    $parts = $SemVer.TrimStart("v", "V") -split "[^0-9]+" | Where-Object { $_ -ne "" }
    $nums = @()
    foreach ($p in $parts) {
        if ($nums.Count -ge 4) { break }
        $nums += [int]$p
    }
    while ($nums.Count -lt 4) { $nums += 0 }
    return "{0}.{1}.{2}.{3}" -f $nums[0], $nums[1], $nums[2], $nums[3]
}

function Find-MakeAppx {
    $cmd = Get-Command MakeAppx.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }

    $roots = @(
        "${env:ProgramFiles(x86)}\Windows Kits\10\bin",
        "${env:ProgramFiles}\Windows Kits\10\bin"
    )
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        $hit = Get-ChildItem -Path $root -Recurse -Filter MakeAppx.exe -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match '\\x64\\' } |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($hit) { return $hit.FullName }
    }
    return $null
}

if (-not $Version) {
    $versionFile = Join-Path $RepoRoot "scripts/bp-dumper/version.json"
    $Version = (Get-Content $versionFile -Raw | ConvertFrom-Json).version
}
$msixVersion = ConvertTo-MsixVersion $Version

if (-not $ExePath) {
    $ExePath = Join-Path $OutputDir "DumperApps.exe"
}
if (-not (Test-Path $ExePath)) {
    throw "Missing exe at $ExePath - run scripts/installer/build-exe.ps1 first."
}

$makeAppx = Find-MakeAppx
if (-not $makeAppx) {
    throw "MakeAppx.exe not found. Install the Windows 10/11 SDK (App Certification Kit / Windows SDK)."
}

$msixDir = Join-Path $PSScriptRoot "msix"
$template = Join-Path $msixDir "AppxManifest.xml.template"
if (-not (Test-Path $template)) {
    throw "Missing manifest template: $template"
}

Write-Step "Generating MSIX logo assets"
python -m pip install pillow --quiet
python (Join-Path $msixDir "generate-msix-assets.py")

$stage = Join-Path $OutputDir "msix-stage"
if (Test-Path $stage) {
    Remove-Item -Recurse -Force $stage
}
New-Item -ItemType Directory -Force -Path $stage | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stage "Assets") | Out-Null

Write-Step "Staging package payload"
Copy-Item $ExePath (Join-Path $stage "DumperApps.exe") -Force
Copy-Item (Join-Path $msixDir "Assets\*") (Join-Path $stage "Assets") -Force

$manifestText = (Get-Content $template -Raw) -replace '\{\{VERSION\}\}', $msixVersion
$manifestPath = Join-Path $stage "AppxManifest.xml"
# UTF-8 without BOM - MakeAppx rejects UTF-8 BOM manifests
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($manifestPath, $manifestText, $utf8NoBom)

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$msixPath = Join-Path $OutputDir "BPDumper.msix"
if (Test-Path $msixPath) {
    Remove-Item -Force $msixPath
}

Write-Step "Packing MSIX ($msixVersion)"
& $makeAppx pack /d $stage /p $msixPath /o
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $msixPath)) {
    throw "MakeAppx failed (exit $LASTEXITCODE)"
}

Write-Step "MSIX packed (LOCAL/PRIVATE ONLY — NOT for Partner Center / Store)"
Write-Host $msixPath
Get-Item $msixPath | ForEach-Object {
    Write-Host ("Size: {0:N1} MB" -f ($_.Length / 1MB))
}
Write-Host ""
Write-Host "FORBIDDEN for Store upload: this package has runFullTrust." -ForegroundColor Red
Write-Host "For Partner Center 9PMR8CPSB04K use: apps/bp-dumper-store/build-store.ps1 -Package" -ForegroundColor Yellow
