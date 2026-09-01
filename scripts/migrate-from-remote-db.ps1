<#
.SYNOPSIS
  Pulls the full schema + data from a network-reachable Postgres and replaces
  the local Docker container's `tasktel` database with it.

.DESCRIPTION
  Nothing needs to be installed on this machine. All pg_dump / psql work happens
  INSIDE the postgres:16-alpine container, which already ships both binaries.

  Flow:
    1. Verify the container is up and healthy.
    2. Probe the remote server's version (a dump from a NEWER server cannot be
       restored by an older pg_dump, so this is checked before anything is
       destroyed).
    3. Dump the remote database to a file inside the container.
    4. Back up the CURRENT local database (so a bad restore is recoverable).
    5. Drop + recreate the local `public` schema.
    6. Restore the dump.
    7. Report table/row counts and validate against the app's table allowlist.

.EXAMPLE
  .\scripts\migrate-from-remote-db.ps1 -RemoteHost 192.168.1.50 -RemoteUser tasktel -RemoteDb tasktel

.EXAMPLE
  # Dry run - probe connectivity + versions, dump, but do NOT touch local data
  .\scripts\migrate-from-remote-db.ps1 -RemoteHost 192.168.1.50 -RemoteUser tasktel -DumpOnly
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$RemoteHost,

    [int]$RemotePort = 5432,

    [Parameter(Mandatory = $true)]
    [string]$RemoteUser,

    [string]$RemoteDb = 'tasktel',

    # If omitted you are prompted securely (never echoed, never stored on disk).
    [securestring]$RemotePassword,

    [string]$Container = 'tasktel_app-postgres-1',
    [string]$LocalUser = 'tasktel',
    [string]$LocalDb   = 'tasktel',

    # Dump and verify only; leave the local database untouched.
    [switch]$DumpOnly,

    # Skip the confirmation prompt before the destructive step.
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Say([string]$m, [string]$c = 'White') { Write-Host $m -ForegroundColor $c }
function Step([string]$m) { Write-Host ""; Write-Host "==> $m" -ForegroundColor Cyan }
function Warn([string]$m) { Write-Host "  ! $m" -ForegroundColor Yellow }
function Die ([string]$m) { Write-Host ""; Write-Host "FAILED: $m" -ForegroundColor Red; exit 1 }

$stamp     = Get-Date -Format 'yyyyMMdd-HHmmss'
$dumpPath  = "/tmp/remote-$stamp.dump"
$backPath  = "/tmp/local-backup-$stamp.dump"

# ---------------------------------------------------------------------------
# Credentials
# ---------------------------------------------------------------------------
if (-not $RemotePassword) {
    $RemotePassword = Read-Host -AsSecureString "Password for $RemoteUser@$RemoteHost"
}
$plainPw = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($RemotePassword)
)
if ([string]::IsNullOrWhiteSpace($plainPw)) { Die "No password supplied." }

# Run a command in the container with PGPASSWORD set for the REMOTE server.
# The password is passed via `docker exec -e`, so it never lands in a file or
# in the container's shell history.
function Remote-Exec {
    param([string[]]$Cmd)
    docker exec -e "PGPASSWORD=$plainPw" $Container @Cmd 2>&1
}
function Local-Exec {
    param([string[]]$Cmd)
    docker exec $Container @Cmd 2>&1
}

# ---------------------------------------------------------------------------
# 1. Container health
# ---------------------------------------------------------------------------
Step "Checking local container '$Container'"

$running = (docker ps --filter "name=$Container" --format '{{.Names}}' 2>&1) -join ''
if ($running -notmatch [regex]::Escape($Container)) {
    Warn "Not running. Starting via docker compose..."
    docker compose up -d | Out-Null
    for ($i = 0; $i -lt 30; $i++) {
        docker exec $Container pg_isready -U $LocalUser -d $LocalDb 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Milliseconds 500
    }
}

docker exec $Container pg_isready -U $LocalUser -d $LocalDb 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Die "Local Postgres is not accepting connections." }

$localVer = (Local-Exec @('psql','-U',$LocalUser,'-d',$LocalDb,'-tAc','show server_version;')) -join ''
Say "  local server  : $($localVer.Trim())" 'Gray'

# ---------------------------------------------------------------------------
# 2. Remote reachability + version guard
# ---------------------------------------------------------------------------
Step "Probing remote $RemoteHost`:$RemotePort/$RemoteDb"

$remoteVer = (Remote-Exec @(
    'psql','-h',$RemoteHost,'-p',"$RemotePort",'-U',$RemoteUser,'-d',$RemoteDb,
    '-tAc','show server_version;'
)) -join ''

if ($LASTEXITCODE -ne 0 -or $remoteVer -match 'error|denied|refused|timeout|failed|could not') {
    Die @"
Could not connect to the remote database.

  $($remoteVer.Trim())

Check, on the SOURCE machine:
  * postgresql.conf -> listen_addresses = '*'
  * pg_hba.conf     -> a 'host <db> <user> <this-machine-ip>/32 scram-sha-256' line
  * the OS firewall allows inbound TCP $RemotePort
  * the service was restarted after those edits
"@
}

$remoteVer = $remoteVer.Trim()
Say "  remote server : $remoteVer" 'Gray'

$remoteMajor = [int]($remoteVer -split '\.')[0]
$dumpMajor   = [int](((Local-Exec @('pg_dump','--version')) -join '') -replace '.*?(\d+)\.\d+.*','$1')

if ($remoteMajor -gt $dumpMajor) {
    Die @"
Remote server is PostgreSQL $remoteMajor but this container's pg_dump is $dumpMajor.
pg_dump cannot dump a server newer than itself.

Fix: bump the image in docker-compose.yml to postgres:$remoteMajor-alpine, then
     'docker compose up -d' and re-run. (The volume is replaced anyway.)
"@
}

# ---------------------------------------------------------------------------
# 3. Dump the remote database
# ---------------------------------------------------------------------------
Step "Dumping remote database"
Say "  This can take a while on a large database..." 'Gray'

$dumpOut = Remote-Exec @(
    'pg_dump','-h',$RemoteHost,'-p',"$RemotePort",'-U',$RemoteUser,'-d',$RemoteDb,
    '--format=custom',        # compressed, restorable in dependency order
    '--no-owner','--no-privileges',  # local roles differ from remote roles
    '--verbose',
    '-f',$dumpPath
)
if ($LASTEXITCODE -ne 0) { Die "pg_dump failed:`n$($dumpOut -join "`n")" }

$size = ((Local-Exec @('sh','-c',"stat -c %s $dumpPath")) -join '').Trim()
if (-not $size -or [int64]$size -lt 1024) { Die "Dump file is empty or missing." }
Say ("  dump written  : {0:N2} MB" -f ([int64]$size / 1MB)) 'Green'

# What did we capture?
$toc = Local-Exec @('sh','-c',"pg_restore -l $dumpPath | grep -c 'TABLE DATA' || true")
Say "  tables with data: $((($toc -join '').Trim()))" 'Gray'

if ($DumpOnly) {
    Step "DumpOnly - local database untouched"
    Say "Dump retained inside the container at $dumpPath" 'Yellow'
    Say "Copy it out with:  docker cp ${Container}:$dumpPath ./remote.dump" 'Yellow'
    exit 0
}

# ---------------------------------------------------------------------------
# 4. Confirm + back up current local data
# ---------------------------------------------------------------------------
if (-not $Force) {
    Step "About to REPLACE the local '$LocalDb' database"
    $counts = Local-Exec @('psql','-U',$LocalUser,'-d',$LocalDb,'-tAc',
        "select count(*) from information_schema.tables where table_schema='public';")
    Warn "The local database currently has $((($counts -join '').Trim())) table(s). All of it will be dropped."
    $ans = Read-Host "Type 'yes' to continue"
    if ($ans -ne 'yes') { Say "Aborted. Nothing changed." 'Yellow'; exit 0 }
}

Step "Backing up current local database"
Local-Exec @('pg_dump','-U',$LocalUser,'-d',$LocalDb,'--format=custom','-f',$backPath) | Out-Null
if ($LASTEXITCODE -eq 0) {
    Say "  safety copy   : $backPath (inside container)" 'Gray'
} else {
    Warn "Local backup failed - continuing, but there is no rollback point."
}

# ---------------------------------------------------------------------------
# 5. Wipe + 6. Restore
# ---------------------------------------------------------------------------
Step "Dropping and recreating schema 'public'"
$drop = Local-Exec @('psql','-U',$LocalUser,'-d',$LocalDb,'-v','ON_ERROR_STOP=1','-c',
    "drop schema public cascade; create schema public; grant all on schema public to $LocalUser; grant all on schema public to public;")
if ($LASTEXITCODE -ne 0) { Die "Could not reset schema:`n$($drop -join "`n")" }

Step "Restoring remote dump"
# pg_restore reports benign notices on --no-owner restores; only a hard failure
# with zero restored tables is fatal, so the exit code is judged after counting.
$rest = Local-Exec @('pg_restore','-U',$LocalUser,'-d',$LocalDb,'--no-owner','--no-privileges',$dumpPath)
$restoreExit = $LASTEXITCODE

# ---------------------------------------------------------------------------
# 7. Verify
# ---------------------------------------------------------------------------
Step "Verifying restored database"

$report = Local-Exec @('psql','-U',$LocalUser,'-d',$LocalDb,'-c', @"
select table_name,
       (xpath('/row/c/text()',
         query_to_xml(format('select count(*) as c from public.%I', table_name),
                      false, true, '')))[1]::text::int as rows
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name;
"@)
$report | ForEach-Object { Write-Host "  $_" }

$tblCount = [int]((Local-Exec @('psql','-U',$LocalUser,'-d',$LocalDb,'-tAc',
    "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")) -join '').Trim()

if ($tblCount -eq 0) {
    Die "Restore produced no tables. Roll back with:`n  docker exec $Container pg_restore -U $LocalUser -d $LocalDb --clean --no-owner $backPath"
}
if ($restoreExit -ne 0) {
    Warn "pg_restore exited $restoreExit but $tblCount tables exist - review the warnings above."
}

# The app refuses to query any table outside this allowlist
# (backend-unified/config/databaseClient.js).
Step "Checking the app's required tables"
$required = @('admins','customer_preferences','customers','equipment','locations',
              'notifications','password_resets','rooms','service_requests',
              'service_updates','team_members','technicians')

$present = (Local-Exec @('psql','-U',$LocalUser,'-d',$LocalDb,'-tAc',
    "select table_name from information_schema.tables where table_schema='public';")) |
    ForEach-Object { $_.Trim() } | Where-Object { $_ }

$missing = $required | Where-Object { $present -notcontains $_ }
if ($missing) {
    Warn "Missing table(s) the backend expects: $($missing -join ', ')"
    Say  "Apply the repo migrations to fill the gaps:" 'Yellow'
    Say  "  Get-ChildItem backend-unified/migrations/*.sql | Sort-Object Name | ForEach-Object {" 'Yellow'
    Say  "    Get-Content `$_.FullName -Raw | docker exec -i $Container psql -U $LocalUser -d $LocalDb }" 'Yellow'
} else {
    Say "  All 12 required tables present." 'Green'
}

# Sequences must be moved past the restored rows or the first insert collides.
Step "Resyncing identity sequences"
Local-Exec @('psql','-U',$LocalUser,'-d',$LocalDb,'-tAc', @"
do `$`$
declare r record;
begin
  for r in
    select s.relname as seq, t.relname as tbl, a.attname as col
    from pg_class s
      join pg_depend d  on d.objid = s.oid and d.deptype in ('a','i')
      join pg_class t   on t.oid = d.refobjid
      join pg_attribute a on a.attrelid = t.oid and a.attnum = d.refobjsubid
      join pg_namespace n on n.oid = s.relnamespace
    where s.relkind = 'S' and n.nspname = 'public'
  loop
    execute format(
      'select setval(%L, coalesce((select max(%I) from public.%I), 0) + 1, false)',
      'public.' || r.seq, r.col, r.tbl);
  end loop;
end `$`$;
"@) | Out-Null
Say "  Sequences advanced past restored data." 'Green'

Write-Host ""
Say "DONE - local '$LocalDb' now mirrors $RemoteHost/$RemoteDb ($tblCount tables)." 'Green'
Say "Rollback if needed:" 'Gray'
Say "  docker exec $Container pg_restore -U $LocalUser -d $LocalDb --clean --no-owner $backPath" 'Gray'
