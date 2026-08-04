# Build a Store-ready BPDumper.msix from DumperApps.exe (local/private only - do NOT attach to GitHub Releases).
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

Write-Step "MSIX ready (Store-only - do not attach to GitHub Releases)"
Write-Host $msixPath
Get-Item $msixPath | ForEach-Object {
    Write-Host ("Size: {0:N1} MB" -f ($_.Length / 1MB))
}
Write-Host ""
Write-Host "Partner Center product: 9PMR8CPSB04K (BP Dumper)" -ForegroundColor Yellow
Write-Host "Upload this .msix in Partner Center. Explain runFullTrust: reads Star Citizen Game.log/logbackups; POSTs to org webhook." -ForegroundColor DarkGray
