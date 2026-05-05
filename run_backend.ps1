param(
  [int]$Port = 8000,
  [int]$AuthPort = 8101,
  [int]$ProgressPort = 8102
)

$ErrorActionPreference = "Stop"

$localPython = "C:\Users\juane\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"

if (Get-Command python -ErrorAction SilentlyContinue) {
  $python = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
  $python = "py"
} elseif (Test-Path -LiteralPath $localPython) {
  $python = $localPython
} else {
  Write-Error "Python was not found. Install Python or update run_backend.ps1 with your Python path."
}

if (-not $env:INTERNAL_TOKEN) {
  $env:INTERNAL_TOKEN = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
}

$env:AUTH_PORT = "$AuthPort"
$env:PROGRESS_PORT = "$ProgressPort"
$env:AUTH_BASE_URL = "http://127.0.0.1:$AuthPort"
$env:PROGRESS_BASE_URL = "http://127.0.0.1:$ProgressPort"
$env:PORT = "$Port"

Start-Process -FilePath $python -ArgumentList "backend\auth\service.py" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
Start-Process -FilePath $python -ArgumentList "backend\progress\service.py" -WorkingDirectory $PSScriptRoot -WindowStyle Hidden

Start-Sleep -Seconds 1
& $python backend\gateway\server.py
