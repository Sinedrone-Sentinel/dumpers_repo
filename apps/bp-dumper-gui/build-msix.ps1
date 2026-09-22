# Package BP Dumper-GUI as AppContainer MSIX for Partner Center.
# No runFullTrust. Does not launch the app.
#
#   powershell -File apps/bp-dumper-gui/build-msix.ps1

param(
  [ValidateSet('Debug', 'Release')]
  [string]$Config = 'Release',
  [string]$StoreDropDir = $(
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    Join-Path (Split-Path $repoRoot -Parent) 'APP_Store Code\BP Dumper'
  )
)

$ErrorActionPreference = 'Stop'
$makeappx = 'C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64\makeappx.exe'
if (-not (Test-Path $makeappx)) {
  throw "makeappx.exe not found: $makeappx"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$gen = Join-Path $repoRoot 'scripts\installer\msix\generate-msix-assets.py'
$generated = Join-Path $repoRoot 'scripts\installer\msix\Assets'
$assetDest = Join-Path $PSScriptRoot 'Package\Assets'
if (-not (Test-Path $gen)) { throw "Missing icon generator: $gen" }

Write-Host 'Generating Store logos from bp-dumper-icon.png...' -ForegroundColor Cyan
& python -m pip install pillow --quiet
& python $gen
if ($LASTEXITCODE -ne 0) { throw "Icon generation failed (exit $LASTEXITCODE)" }
New-Item -ItemType Directory -Force -Path $assetDest | Out-Null
foreach ($name in @('StoreLogo.png', 'Square44x44Logo.png', 'Square71x71Logo.png', 'Square150x150Logo.png')) {
  $from = Join-Path $generated $name
  if (-not (Test-Path $from)) { throw "Missing generated asset: $from" }
  Copy-Item -Force $from (Join-Path $assetDest $name)
}

$csproj = Join-Path $PSScriptRoot 'BpDumperGui.csproj'
$publishDir = Join-Path $PSScriptRoot "bin\$Config\net8.0-windows10.0.19041.0\win-x64\store-publish"
Write-Host "Publishing self-contained GUI ($Config|win-x64)..." -ForegroundColor Cyan
& dotnet publish $csproj -c $Config -r win-x64 --self-contained true -p:PublishSingleFile=false -p:StorePackage=true -o $publishDir
if ($LASTEXITCODE -ne 0) { throw "dotnet publish failed (exit $LASTEXITCODE)" }

$layout = Join-Path $PSScriptRoot 'Package\layout'
if (Test-Path $layout) { Remove-Item -Recurse -Force $layout }
New-Item -ItemType Directory -Force -Path $layout | Out-Null
Copy-Item -Recurse -Force (Join-Path $publishDir '*') $layout
Copy-Item -Force (Join-Path $PSScriptRoot 'Package\Package.appxmanifest') (Join-Path $layout 'AppxManifest.xml')
$layoutAssets = Join-Path $layout 'Assets'
New-Item -ItemType Directory -Force -Path $layoutAssets | Out-Null
Copy-Item -Force (Join-Path $assetDest '*') $layoutAssets

$manifestText = Get-Content -Raw (Join-Path $layout 'AppxManifest.xml')
if ($manifestText -match 'Capability\s+Name="runFullTrust"') {
  throw 'Refusing to publish: AppxManifest.xml declares the runFullTrust capability'
}

$outDir = Join-Path $PSScriptRoot 'Package\AppPackages'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$msix = Join-Path $outDir 'BPDumper.msix'
if (Test-Path $msix) { Remove-Item -Force $msix }

Write-Host 'Running makeappx...' -ForegroundColor Cyan
& $makeappx pack /d $layout /p $msix /o
if ($LASTEXITCODE -ne 0) { throw "makeappx failed (exit $LASTEXITCODE)" }

if (-not (Test-Path $StoreDropDir)) {
  New-Item -ItemType Directory -Force -Path $StoreDropDir | Out-Null
}
$dropPath = Join-Path $StoreDropDir 'BPDumper.msix'
Copy-Item -Force $msix $dropPath
Write-Host 'Copied for Partner Center:' -ForegroundColor Green
Write-Host "  $dropPath"
Write-Host "(build tree: $msix)" -ForegroundColor DarkGray
