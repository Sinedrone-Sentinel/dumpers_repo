# Build / package BP Dumper Store app — NO Visual Studio required.
# Prereqs: .NET 8 SDK (dotnet --version). For MSIX: Windows 10/11 SDK (MakeAppx via MSBuild targets).
#
# Usage:
#   pwsh ./build-store.ps1              # Debug build
#   pwsh ./build-store.ps1 -Config Release
#   pwsh ./build-store.ps1 -Package     # Release MSIX under AppPackages\ (unsigned; Store re-signs)

param(
  [ValidateSet('Debug', 'Release')]
  [string]$Config = 'Debug',
  [switch]$Package
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
Push-Location $PSScriptRoot
try {
  if ($Package) {
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
      /p:AppxPackageDir="$PSScriptRoot\AppPackages\"
    if ($LASTEXITCODE -ne 0) { throw "MSIX packaging failed (exit $LASTEXITCODE)" }
    Write-Host "MSIX output under: $PSScriptRoot\AppPackages\" -ForegroundColor Green
    Get-ChildItem -Path (Join-Path $PSScriptRoot 'AppPackages') -Recurse -Filter *.msix -ErrorAction SilentlyContinue |
      ForEach-Object { Write-Host "  $($_.FullName)" }
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
