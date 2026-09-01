<#
.SYNOPSIS
  Stops and restarts all three TaskTel services: backend-unified (5000),
  ADMIN DASH (5173), and the customer app (3000).

.PARAMETER NoInstall
  Skip "npm install" for every app before starting.

.PARAMETER TestOnly
  Only run health checks against already-running servers; do not stop/start anything.
#>
param(
    [switch]$NoInstall,
    [switch]$TestOnly
)

$ErrorActionPreference = "Stop"

$ScriptDir = $PSScriptRoot

$commonArgs = @{}
if ($NoInstall) { $commonArgs.NoInstall = $true }
if ($TestOnly) { $commonArgs.TestOnly = $true }

Write-Host "########## TaskTel: restart all services ##########" -ForegroundColor Blue

# Backend first: both frontends call it on startup.
& "$ScriptDir\restart-backend.ps1" @commonArgs

if (-not $TestOnly) {
    Start-Sleep -Seconds 2
}

& "$ScriptDir\restart-admin-dash.ps1" @commonArgs
& "$ScriptDir\restart-customer-app.ps1" @commonArgs

Write-Host "########## Done. ##########" -ForegroundColor Blue
Write-Host "backend-unified : http://localhost:5000/health"
Write-Host "ADMIN DASH      : http://localhost:5173/"
Write-Host "Customer APP    : http://localhost:3000/"
