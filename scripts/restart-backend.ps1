<#
.SYNOPSIS
  Stops whatever is on port 5000 and (re)starts backend-unified.

.PARAMETER NoInstall
  Skip "npm install" before starting.

.PARAMETER TestOnly
  Only run the health check against an already-running server; do not stop/start anything.
#>
param(
    [switch]$NoInstall,
    [switch]$TestOnly
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_common.ps1"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend-unified"
$Port = 5000
$HealthUrl = "http://localhost:$Port/health"

Write-Host "=== backend-unified (port $Port) ===" -ForegroundColor Magenta

if ($TestOnly) {
    Wait-ForHttpOk -Url $HealthUrl -Label "backend-unified" -TimeoutSeconds 10
    exit 0
}

Stop-ProcessOnPort -Port $Port -Label "backend-unified"

if (-not $NoInstall) {
    Write-Host "  Installing dependencies..." -ForegroundColor Cyan
    Push-Location $BackendDir
    npm install
    Pop-Location
}

Start-DevProcess -WorkingDirectory $BackendDir -Command "npm run dev" -WindowTitle "TaskTel: backend-unified (5000)"

Write-Host "  Waiting for server to come up..." -ForegroundColor Cyan
Wait-ForHttpOk -Url $HealthUrl -Label "backend-unified" -TimeoutSeconds 30
