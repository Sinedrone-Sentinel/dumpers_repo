# Stage a self-contained Dumper Apps tree for the Windows Inno Setup installer.
param(
    [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path,
    [string]$OutDir = (Join-Path $PSScriptRoot "staging"),
    [string]$PythonVersion = "3.12.7",
    [string]$PythonVenvPath = ""
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
    Write-Host ""
    Write-Host ("==> [{0}] {1}" -f (Get-Date -Format "HH:mm:ss"), $Message) -ForegroundColor Cyan
}

if (Test-Path $OutDir) {
    Remove-Item -Recurse -Force $OutDir
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$pyDir = Join-Path $OutDir "python"
$pyVenvDir = Join-Path $OutDir "python-venv"
$bpPyDir = Join-Path $OutDir "scripts/bp-dumper-py"

Write-Step "Copying Dumper Apps scripts"
New-Item -ItemType Directory -Force -Path $bpPyDir | Out-Null

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

Copy-Item (Join-Path $PSScriptRoot "Launch-DumperApps.bat") (Join-Path $OutDir "Launch-DumperApps.bat")

if ($PythonVenvPath) {
    Write-Step "Copying pre-built Python venv from $PythonVenvPath"
    $venvPy = Join-Path $PythonVenvPath "Scripts/python.exe"
    if (-not (Test-Path $venvPy)) {
        throw "PythonVenvPath missing Scripts/python.exe: $venvPy"
    }
    Copy-Item -Recurse -Path $PythonVenvPath -Destination $pyVenvDir
} else {
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
    Write-Step "Installing Python packages into embeddable runtime"
    & $pip -m pip install --upgrade pip --no-warn-script-location
    & $pip -m pip install -r $reqBp --no-warn-script-location --prefer-binary
}

Write-Step "Bundle ready: $OutDir"
Get-ChildItem $OutDir -Recurse -File | Measure-Object -Property Length -Sum |
    ForEach-Object { Write-Host ("Total size: {0:N1} MB" -f ($_.Sum / 1MB)) }
