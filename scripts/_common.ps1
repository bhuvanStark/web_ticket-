# Shared helpers for TaskTel restart scripts. Dot-sourced by the other scripts in this folder.

function Stop-ProcessOnPort {
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        [string]$Label = "port $Port"
    )

    $conns = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if (-not $conns) {
        Write-Host "  [$Label] nothing listening, nothing to stop." -ForegroundColor DarkGray
        return
    }

    $procIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $procIds) {
        try {
            $proc = Get-Process -Id $procId -ErrorAction Stop
            Write-Host "  [$Label] stopping PID $procId ($($proc.ProcessName))..." -ForegroundColor Yellow
            Stop-Process -Id $procId -Force -ErrorAction Stop
        } catch {
            Write-Host "  [$Label] could not stop PID $procId : $($_.Exception.Message)" -ForegroundColor Red
        }
    }

    # Wait for the port to actually free up before returning.
    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $deadline) {
        if (-not (Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue)) {
            Write-Host "  [$Label] port is free." -ForegroundColor Green
            return
        }
        Start-Sleep -Milliseconds 300
    }
    Write-Host "  [$Label] warning: port still appears in use after waiting." -ForegroundColor Red
}

function Wait-ForHttpOk {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [string]$Label = $Url,
        [int]$TimeoutSeconds = 30
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400) {
                Write-Host "  [$Label] responding ($($resp.StatusCode))." -ForegroundColor Green
                return $true
            }
        } catch {
            # not up yet, keep polling
        }
        Start-Sleep -Milliseconds 500
    }
    Write-Host "  [$Label] did not respond within $TimeoutSeconds s." -ForegroundColor Red
    return $false
}

function Start-DevProcess {
    param(
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string]$WindowTitle
    )

    if (-not (Test-Path $WorkingDirectory)) {
        throw "Working directory not found: $WorkingDirectory"
    }

    # Launch in its own PowerShell window so logs stay visible and the process
    # is independent of this script's lifetime.
    $argList = @(
        "-NoExit",
        "-Command",
        "`$host.UI.RawUI.WindowTitle = '$WindowTitle'; Set-Location -LiteralPath '$WorkingDirectory'; $Command"
    )
    Start-Process -FilePath "powershell.exe" -ArgumentList $argList -WorkingDirectory $WorkingDirectory
    Write-Host "  Launched '$WindowTitle' in a new window." -ForegroundColor Cyan
}
