<#
.SYNOPSIS
    Extracts Star Citizen game data using StarBreaker CLI.
    
.DESCRIPTION
    This script extracts the DataForge database from Star Citizen's Data.p4k
    and converts it to JSON format for use by the parsing scripts.
    
.PARAMETER StarCitizenPath
    Path to Star Citizen installation. Defaults to standard location.
    
.PARAMETER StarBreakerPath  
    Path to StarBreaker CLI executable.
    
.PARAMETER OutputPath
    Where to output extracted data. Defaults to extracted-data/ in project root.

.PARAMETER IncludeShopData
    Also extract shop socpaks and ShopInventories (not used by this app today).
    Skipped by default to save extraction time.

.EXAMPLE
    .\extract-game-data.ps1
    
.EXAMPLE
    .\extract-game-data.ps1 -StarCitizenPath "D:\Games\StarCitizen\LIVE"

.EXAMPLE
    .\extract-game-data.ps1 -IncludeShopData
#>

param(
    [string]$StarCitizenPath = "C:\Program Files\Roberts Space Industries\StarCitizen\LIVE",
    [string]$StarBreakerPath = "F:\SC Profiles\starbreaker-cli-v0.2.2-windows-x86_64\starbreaker.exe",
    [string]$OutputPath = $null,
    [switch]$IncludeShopData
)

$ErrorActionPreference = "Stop"

# Get project root (parent of scripts folder)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# Default output to extracted-data in project root
if (-not $OutputPath) {
    $OutputPath = Join-Path $ProjectRoot "extracted-data"
}

$DataP4kPath = Join-Path $StarCitizenPath "Data.p4k"

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content
    )
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Star Citizen Game Data Extraction" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuration:"
Write-Host "  Star Citizen: $StarCitizenPath"
Write-Host "  StarBreaker:  $StarBreakerPath"
Write-Host "  Output:       $OutputPath"
Write-Host "  Shop data:    $(if ($IncludeShopData) { 'included' } else { 'skipped (use -IncludeShopData to extract)' })"
Write-Host ""

# Validate paths
if (-not (Test-Path $DataP4kPath)) {
    Write-Host "ERROR: Data.p4k not found at: $DataP4kPath" -ForegroundColor Red
    Write-Host "Please check your Star Citizen installation path." -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $StarBreakerPath)) {
    Write-Host "ERROR: StarBreaker not found at: $StarBreakerPath" -ForegroundColor Red
    Write-Host "Please download StarBreaker from: https://github.com/diogotr7/StarBreaker/releases" -ForegroundColor Yellow
    exit 1
}

# Clean previous extraction (optional - comment out to keep old data)
if (Test-Path $OutputPath) {
    Write-Host "Cleaning previous extraction..." -ForegroundColor Yellow
    Remove-Item -Path $OutputPath -Recurse -Force
}

# Create output directory
New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null

# Capture game build version from the LIVE install (used by parse scripts + site UI)
$BuildManifestPath = Join-Path $StarCitizenPath "build_manifest.id"
$GameBuildVersion = $null
if (Test-Path $BuildManifestPath) {
    try {
        $manifest = Get-Content $BuildManifestPath -Raw | ConvertFrom-Json
        $internalVersion = $manifest.Data.Version
        $p4Change = $manifest.Data.RequestedP4ChangeNum
        $branch = $manifest.Data.Branch
        $GameBuildVersion = $null
        if ($internalVersion -and $internalVersion -ne 'None') {
            $parts = $internalVersion -split '\.'
            if ($parts.Length -ge 2) {
                $GameBuildVersion = "$($parts[0]).$($parts[1]).x"
            }
        }
        if (-not $GameBuildVersion -and $branch -match '(\d+)\.(\d+)') {
            $GameBuildVersion = "$($Matches[1]).$($Matches[2]).x"
        }
        # RSI launcher label: "{semver}-live.{RequestedP4ChangeNum}" (e.g. 4.9.0-live.12344265)
        $launcherVersion = $null
        $semver = $null
        if ($branch -match '(\d+)\.(\d+)\.(\d+)') {
            $semver = "$($Matches[1]).$($Matches[2]).$($Matches[3])"
        }
        elseif ($branch -match '(\d+)\.(\d+)') {
            $semver = "$($Matches[1]).$($Matches[2]).0"
        }
        elseif ($GameBuildVersion -match '^(\d+)\.(\d+)') {
            $semver = "$($Matches[1]).$($Matches[2]).0"
        }
        if ($semver -and $p4Change) {
            $launcherVersion = "$semver-live.$p4Change"
        }
        $gameBuild = @{
            version = $GameBuildVersion
            launcherVersion = $launcherVersion
            internalVersion = $internalVersion
            branch = $branch
            p4Change = $p4Change
            buildDate = $manifest.Data.BuildDateStamp
            extracted = (Get-Date).ToUniversalTime().ToString("o")
        }
        $gameBuildJson = $gameBuild | ConvertTo-Json -Depth 3
        Write-Utf8NoBom -Path (Join-Path $OutputPath "game-build.json") -Content $gameBuildJson
        Write-Host "Game build: $launcherVersion ($GameBuildVersion, $($branch), internal $($internalVersion))" -ForegroundColor Gray
    }
    catch {
        Write-Host "WARNING: Could not read build_manifest.id: $_" -ForegroundColor Yellow
    }
}
else {
    Write-Host "WARNING: build_manifest.id not found at: $BuildManifestPath" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[1/3] Extracting DataForge database to JSON..." -ForegroundColor Green
Write-Host "      This may take several minutes..." -ForegroundColor Gray
Write-Host ""

$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

try {
    & $StarBreakerPath dcb extract `
        --p4k $DataP4kPath `
        --output $OutputPath `
        --format json
        
    if ($LASTEXITCODE -ne 0) {
        throw "StarBreaker DCB extraction exited with code $LASTEXITCODE"
    }
}
catch {
    Write-Host "ERROR: DataForge extraction failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/3] Extracting localization files..." -ForegroundColor Green
Write-Host "      Getting english language strings for lore/descriptions..." -ForegroundColor Gray
Write-Host ""

try {
    & $StarBreakerPath p4k extract `
        --p4k $DataP4kPath `
        --output $OutputPath `
        --filter "**/Localization/english/**"
        
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARNING: Localization extraction returned code $LASTEXITCODE (may be partial)" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "WARNING: Localization extraction failed: $_" -ForegroundColor Yellow
    Write-Host "Continuing without localization data..." -ForegroundColor Yellow
}

if ($IncludeShopData) {
    Write-Host ""
    Write-Host "[3/3] Extracting shop socpaks + inventory JSON (optional)..." -ForegroundColor Green
    Write-Host ""

    try {
        & $StarBreakerPath p4k extract `
            --p4k $DataP4kPath `
            --output $OutputPath `
            --filter "Data/ObjectContainers/PU/Shops/**/*.socpak"

        & $StarBreakerPath p4k extract `
            --p4k $DataP4kPath `
            --output $OutputPath `
            --filter "Data/ObjectContainers/PU/loc/mod/**/reststop_*/**/*.socpak"

        & $StarBreakerPath p4k extract `
            --p4k $DataP4kPath `
            --output $OutputPath `
            --filter "Data/ObjectContainers/PU/loc/mod/**/reststop_ref/**/*.socpak"

        & $StarBreakerPath p4k extract `
            --p4k $DataP4kPath `
            --output $OutputPath `
            --filter "Data/Scripts/ShopInventories/**"

        Write-Host "  Shop socpaks and ShopInventories extracted" -ForegroundColor Gray
    }
    catch {
        Write-Host "WARNING: Shop data extraction failed: $_" -ForegroundColor Yellow
    }
}
else {
    Write-Host ""
    Write-Host "[3/3] Skipping shop socpaks + ShopInventories (not used by this app)." -ForegroundColor Green
    Write-Host "      Pass -IncludeShopData if you need them for a separate project." -ForegroundColor Gray
}

$stopwatch.Stop()
$elapsed = $stopwatch.Elapsed

Write-Host ""
Write-Host "Extraction complete!" -ForegroundColor Green
Write-Host ""

# Count extracted files
$fileCount = (Get-ChildItem -Path $OutputPath -Recurse -File).Count
$sizeMB = [math]::Round((Get-ChildItem -Path $OutputPath -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 2)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Extraction Summary" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Files extracted: $fileCount"
Write-Host "  Total size:      $sizeMB MB"
Write-Host "  Time elapsed:    $($elapsed.ToString('mm\:ss'))"
Write-Host "  Output path:     $OutputPath"
if ($GameBuildVersion) {
    Write-Host "  Game build:      $GameBuildVersion"
}
Write-Host ""
Write-Host "Quality bands and mission broker data come from the full DCB extract." -ForegroundColor DarkGray
Write-Host "No separate StarBreaker dcb query steps are required." -ForegroundColor DarkGray
Write-Host ""
Write-Host "Next step: Run the parsing scripts to generate app data files." -ForegroundColor Yellow
Write-Host "  node scripts/parse-extracted-data.mjs" -ForegroundColor Gray
Write-Host ""
