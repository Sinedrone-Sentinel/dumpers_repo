# Build dumper-apps.ico from the site DR favicon (public/favicon.png).
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
)

$ErrorActionPreference = "Stop"

$pngPath = Join-Path $RepoRoot "public/favicon.png"
if (-not (Test-Path $pngPath)) {
    throw "Missing favicon source: $pngPath"
}

python -m pip install pillow --quiet
python (Join-Path $PSScriptRoot "generate_icon.py")
$iconPath = Join-Path $PSScriptRoot "dumper-apps.ico"
if (-not (Test-Path $iconPath)) {
    throw "Icon generation failed"
}
