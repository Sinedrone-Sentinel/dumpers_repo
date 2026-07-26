# Build dumper-apps.ico + tray.ico from the site DR favicon (public/favicon.png).
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
foreach ($name in @("dumper-apps.ico", "tray.ico")) {
    $iconPath = Join-Path $PSScriptRoot $name
    if (-not (Test-Path $iconPath)) {
        throw "Icon generation failed: $iconPath"
    }
}
