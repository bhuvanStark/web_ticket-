<#
.SYNOPSIS
  Stops whatever is on port 5173 and (re)starts the ADMIN DASH (admin/technician) frontend.

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
$AppDir = Join-Path $RepoRoot "ADMIN_TECHNICIAN\ADMIN DASH"
$Port = 5173
$Url = "http://localhost:$Port/"

Write-Host "=== ADMIN DASH (port $Port) ===" -ForegroundColor Magenta

if ($TestOnly) {
    Wait-ForHttpOk -Url $Url -Label "admin-dash" -TimeoutSeconds 10
    exit 0
}

Stop-ProcessOnPort -Port $Port -Label "admin-dash"

if (-not $NoInstall) {
    Write-Host "  Installing dependencies..." -ForegroundColor Cyan
    Push-Location $AppDir
    npm install
    Pop-Location
}

Start-DevProcess -WorkingDirectory $AppDir -Command "npm run dev" -WindowTitle "TaskTel: ADMIN DASH (5173)"

Write-Host "  Waiting for dev server to come up..." -ForegroundColor Cyan
Wait-ForHttpOk -Url $Url -Label "admin-dash" -TimeoutSeconds 30
