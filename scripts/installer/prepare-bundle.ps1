# Stage a self-contained Dumper Apps tree for the Windows Inno Setup installer.
# Requires: git, PowerShell 5.1+, network (Python embed, Tesseract, SC-Toolbox clone).
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path,
    [string]$OutDir = (Join-Path $PSScriptRoot "staging"),
    [string]$PythonVersion = "3.12.7"
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host "==> $Message" -ForegroundColor Cyan
}

if (Test-Path $OutDir) {
    Remove-Item -Recurse -Force $OutDir
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$pyDir = Join-Path $OutDir "python"
$tessDir = Join-Path $OutDir "tesseract"
$bpPyDir = Join-Path $OutDir "scripts/bp-dumper-py"
$rockDir = Join-Path $OutDir "scripts/rock-scan-ocr"
$vendorParent = Join-Path $rockDir "vendor"

Write-Step "Copying Dumper Apps scripts"
New-Item -ItemType Directory -Force -Path $bpPyDir, $rockDir | Out-Null

$bpFiles = @(
    "dumper.py", "_version.py", "_min_game_version.py",
    "lookup.json", "requirements.txt", "README.md", "dumper.bat", "dumper.sh"
)
foreach ($name in $bpFiles) {
    $src = Join-Path $RepoRoot "scripts/bp-dumper-py/$name"
    if (-not (Test-Path $src)) {
        throw "Missing $src (run: node scripts/copy-blueprint-lookup.mjs)"
    }
    Copy-Item $src (Join-Path $bpPyDir $name)
}

$rockSrc = Join-Path $RepoRoot "scripts/rock-scan-ocr"
Get-ChildItem $rockSrc -Recurse -File | Where-Object {
    $rel = $_.FullName.Substring($rockSrc.Length + 1)
    $rel -notmatch '\\(__pycache__|rock-scan-exports|vendor)(\\|$)' -and
    $_.Name -ne 'sc-toolbox.path' -and
    $_.Name -ne 'capture-region.json'
} | ForEach-Object {
    $rel = $_.FullName.Substring($rockSrc.Length + 1)
    $dest = Join-Path $rockDir $rel
    New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
    Copy-Item $_.FullName $dest
}

Copy-Item (Join-Path $PSScriptRoot "Launch-DumperApps.bat") (Join-Path $OutDir "Launch-DumperApps.bat")
Copy-Item (Join-Path $PSScriptRoot "Restart-Tray.vbs") (Join-Path $OutDir "Restart-Tray.vbs")

Write-Step "Cloning SC_OCR engine (Mining_Signals)"
$toolboxRoot = Join-Path $env:TEMP "dumper-sc-toolbox-$(Get-Random)"
if (Test-Path $toolboxRoot) { Remove-Item -Recurse -Force $toolboxRoot }
git clone --depth 1 --filter=blob:none --sparse "https://github.com/ScPlaceholder/SC-Toolbox-Beta-V2.git" $toolboxRoot
Push-Location $toolboxRoot
git sparse-checkout init --cone
git sparse-checkout set tools/Mining_Signals
Pop-Location

$miningSignalsSrc = Join-Path $toolboxRoot "tools/Mining_Signals"
$apiPy = Join-Path $miningSignalsSrc "ocr/sc_ocr/api.py"
if (-not (Test-Path $apiPy)) {
    throw "SC_OCR api.py missing after sparse checkout: $apiPy"
}

if (Test-Path $vendorParent) { Remove-Item -Recurse -Force $vendorParent }
New-Item -ItemType Directory -Force -Path $vendorParent | Out-Null
Copy-Item -Recurse -Path $miningSignalsSrc -Destination $vendorParent
Remove-Item -Recurse -Force $toolboxRoot

$vendorDir = Join-Path $vendorParent "Mining_Signals"
$models = Join-Path $vendorDir "ocr/models"
$hudOnnx = Join-Path $models "model_hud_cnn.onnx"
$hudData = Join-Path $models "model_hud_cnn.onnx.data"
$hudQuarantine = Join-Path $models "model_hud_cnn.onnx.missing_data"
if ((Test-Path $hudOnnx) -and -not (Test-Path $hudData) -and -not (Test-Path $hudQuarantine)) {
    Move-Item $hudOnnx $hudQuarantine
}

Write-Step "Downloading Python $PythonVersion embeddable"
$pyZip = Join-Path $env:TEMP "python-embed.zip"
$pyUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
Invoke-WebRequest -Uri $pyUrl -OutFile $pyZip -UseBasicParsing
Expand-Archive -Path $pyZip -DestinationPath $pyDir -Force
Remove-Item $pyZip -Force

$pthFile = Get-ChildItem "$pyDir/python*._pth" | Select-Object -First 1
$pthLines = Get-Content $pthFile.FullName
$pthLines = $pthLines | ForEach-Object { $_ -replace '^#\s*import site', 'import site' }
if ($pthLines -notcontains 'Lib\site-packages') { $pthLines += 'Lib\site-packages' }
Set-Content -Path $pthFile.FullName -Value $pthLines -Encoding ASCII
New-Item -ItemType Directory -Force -Path (Join-Path $pyDir "Lib/site-packages") | Out-Null

$getPip = Join-Path $env:TEMP "get-pip.py"
Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $getPip -UseBasicParsing
& (Join-Path $pyDir "python.exe") $getPip --no-warn-script-location
Remove-Item $getPip -Force

$pip = Join-Path $pyDir "python.exe"
$reqBp = Join-Path $bpPyDir "requirements.txt"
$reqRock = Join-Path $rockDir "requirements.txt"
Write-Step "Installing Python packages (may take several minutes)"
& $pip -m pip install --upgrade pip --no-warn-script-location
& $pip -m pip install -r $reqBp -r $reqRock --no-warn-script-location

Write-Step "Installing portable Tesseract OCR"
$tessInstaller = Join-Path $env:TEMP "tesseract-setup.exe"
$tessUrl = "https://digi.bib.uni-mannheim.de/tesseract/tesseract-ocr-w64-setup-5.4.0.20240606.exe"
Invoke-WebRequest -Uri $tessUrl -OutFile $tessInstaller -UseBasicParsing
if (Test-Path $tessDir) { Remove-Item -Recurse -Force $tessDir }
New-Item -ItemType Directory -Force -Path $tessDir | Out-Null
$proc = Start-Process -FilePath $tessInstaller -ArgumentList @(
    "/VERYSILENT", "/SUPPRESSMSGBOXES", "/DIR=$tessDir", "/NOICONS", "/NORESTART"
) -Wait -PassThru
Remove-Item $tessInstaller -Force
if ($proc.ExitCode -ne 0) {
    throw "Tesseract installer failed with exit code $($proc.ExitCode)"
}
if (-not (Test-Path (Join-Path $tessDir "tesseract.exe"))) {
    throw "tesseract.exe not found after install"
}

Write-Step "Bundle ready: $OutDir"
Get-ChildItem $OutDir -Recurse -File | Measure-Object -Property Length -Sum |
    ForEach-Object { Write-Host ("Total size: {0:N1} MB" -f ($_.Sum / 1MB)) }
