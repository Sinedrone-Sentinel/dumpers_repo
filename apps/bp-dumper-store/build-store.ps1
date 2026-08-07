# Build / package BP Dumper Store app — NO Visual Studio required.
# Prereqs: .NET 8 SDK (dotnet --version). For MSIX: Windows 10/11 SDK (MakeAppx via MSBuild targets).
#
# Usage:
#   pwsh ./build-store.ps1              # Debug build
#   pwsh ./build-store.ps1 -Config Release
#   pwsh ./build-store.ps1 -Package     # Release MSIX → APP_Store Code\BP Dumper\BPDumper.msix

param(
  [ValidateSet('Debug', 'Release')]
  [string]$Config = 'Debug',
  [switch]$Package,
  # Maintainer Partner Center drop folder (sibling of Dumpers Repo under Coding Projects).
  # apps/bp-dumper-store → repo root → Coding Projects → APP_Store Code\BP Dumper
  [string]$StoreDropDir = $(
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    Join-Path (Split-Path $repoRoot -Parent) 'APP_Store Code\BP Dumper'
  )
)

$ErrorActionPreference = 'Stop'
$proj = Join-Path $PSScriptRoot 'BpDumperStore\BpDumperStore.csproj'
if (-not (Test-Path $proj)) { throw "Project not found: $proj" }

function Assert-Dotnet {
  if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw @'
.NET SDK not found. Install .NET 8 SDK (no Visual Studio needed):
  https://dotnet.microsoft.com/download/dotnet/8.0
  or: winget install Microsoft.DotNet.SDK.8
'@
  }
}

Assert-Dotnet

function Sync-StoreIcons {
  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
  $gen = Join-Path $repoRoot 'scripts\installer\msix\generate-msix-assets.py'
  $generated = Join-Path $repoRoot 'scripts\installer\msix\Assets'
  $dest = Join-Path $PSScriptRoot 'BpDumperStore\Assets'
  if (-not (Test-Path $gen)) { throw "Missing icon generator: $gen" }
  Write-Host "Generating Store logos from bp-dumper-icon.png…" -ForegroundColor Cyan
  & python $gen
  if ($LASTEXITCODE -ne 0) { throw "Icon generation failed (exit $LASTEXITCODE)" }
  foreach ($name in @('StoreLogo.png', 'Square44x44Logo.png', 'Square71x71Logo.png', 'Square150x150Logo.png')) {
    $from = Join-Path $generated $name
    if (-not (Test-Path $from)) { throw "Missing generated asset: $from" }
    Copy-Item -Force $from (Join-Path $dest $name)
  }
}

Push-Location $PSScriptRoot
try {
  if ($Package) {
    Sync-StoreIcons
    Write-Host "Packaging MSIX ($Config|x64)…" -ForegroundColor Cyan
    # Partner Center accepts unsigned Store packages (Store re-signs on ingest).
    & dotnet msbuild $proj `
      /restore `
      /p:Configuration=$Config `
      /p:Platform=x64 `
      /p:GenerateAppxPackageOnBuild=true `
      /p:AppxBundle=Never `
      /p:UapAppxPackageBuildMode=StoreUpload `
      /p:AppxPackageSigningEnabled=false `
      /p:AppxPackageDir="$($PSScriptRoot.TrimEnd('\'))\AppPackages\\"
    if ($LASTEXITCODE -ne 0) { throw "MSIX packaging failed (exit $LASTEXITCODE)" }

    # Prefer the app package itself (not Windows App Runtime dependency .msix files).
    $built = Get-ChildItem -Path (Join-Path $PSScriptRoot 'AppPackages') -Recurse -Filter 'BpDumperStore*.msix' -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending |
      Select-Object -First 1
    if (-not $built) {
      throw "Packaging reported success but no BpDumperStore*.msix was found under AppPackages\"
    }

    if (-not (Test-Path $StoreDropDir)) {
      New-Item -ItemType Directory -Force -Path $StoreDropDir | Out-Null
    }
    $dropPath = Join-Path $StoreDropDir 'BPDumper.msix'
    Copy-Item -Force $built.FullName $dropPath
    Write-Host "Copied for Partner Center:" -ForegroundColor Green
    Write-Host "  $dropPath"
    Write-Host "(build tree also kept at: $($built.FullName))" -ForegroundColor DarkGray
  }
  else {
    Write-Host "Building ($Config|x64)…" -ForegroundColor Cyan
    & dotnet build $proj -c $Config -p:Platform=x64
    if ($LASTEXITCODE -ne 0) { throw "Build failed (exit $LASTEXITCODE)" }
    Write-Host "Build OK. Open BpDumperStore.sln in VS Code or run the output DLL via a packaged install when ready." -ForegroundColor Green
  }
}
finally {
  Pop-Location
}
