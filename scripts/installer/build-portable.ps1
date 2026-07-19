# Package staged Dumper Apps bundle as a portable self-extracting exe (no install wizard).
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path,
    [string]$StagingDir = (Join-Path $PSScriptRoot "staging"),
    [string]$OutputDir = (Join-Path $PSScriptRoot "output"),
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"

if (-not $Version) {
    $versionFile = Join-Path $RepoRoot "scripts/bp-dumper/version.json"
    $Version = (Get-Content $versionFile -Raw | ConvertFrom-Json).version
}

if (-not (Test-Path $StagingDir)) {
    throw "Missing staging dir: $StagingDir (run prepare-bundle.ps1 first)"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$exeName = "DumperApps-$Version.exe"
$exePath = Join-Path $OutputDir $exeName
$archivePath = Join-Path $OutputDir "bundle.7z"
$configPath = Join-Path $OutputDir "sfx-config.txt"

if (Test-Path $exePath) { Remove-Item -Force $exePath }
if (Test-Path $archivePath) { Remove-Item -Force $archivePath }
if (Test-Path $configPath) { Remove-Item -Force $configPath }

$sevenZip = "${env:ProgramFiles}\7-Zip\7z.exe"
if (-not (Test-Path $sevenZip)) {
    $sevenZip = "${env:ProgramFiles(x86)}\7-Zip\7z.exe"
}
if (-not (Test-Path $sevenZip)) {
    throw "7-Zip not found. Install 7-Zip before building the portable exe."
}

$sfxModule = Join-Path (Split-Path $sevenZip -Parent) "7z.sfx"
if (-not (Test-Path $sfxModule)) {
    throw "7z.sfx module not found next to 7z.exe"
}

Write-Host "Creating 7z archive from staging..."
& $sevenZip a -t7z -mx=9 $archivePath "$StagingDir\*" | Out-Host

@"
;!@Install@!UTF-8!
Title="Dumper Apps"
BeginPrompt="Extract and run Dumper Apps?"
RunProgram="DumperApps.exe"
;!@InstallEnd@!
"@ | Set-Content -Path $configPath -Encoding ASCII

Write-Host "Building self-extracting portable exe: $exeName"
cmd /c copy /b """$sfxModule""" + """$configPath""" + """$archivePath""" """$exePath""" > $null

Remove-Item -Force $archivePath, $configPath

Write-Host "Portable exe ready: $exePath"
Get-Item $exePath | ForEach-Object {
    Write-Host ("Size: {0:N1} MB" -f ($_.Length / 1MB))
}
