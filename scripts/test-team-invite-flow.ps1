<#
.SYNOPSIS
  End-to-end test for the team-member invitation feature against a running backend.

.DESCRIPTION
  Registers a throwaway company account, invites a member, activates them,
  logs in as them, verifies company-scoped access, and checks the auth guards.
  Cleans up the team members it creates.

.PARAMETER ApiBase
  Backend API base URL. Defaults to http://localhost:5000/api

.PARAMETER InviteEmail
  Optional real email address to send an actual invitation to, so you can
  check the inbox. Defaults to a throwaway address (no deliverable mail).
#>
param(
    [string]$ApiBase = "http://localhost:5000/api",
    [string]$InviteEmail = ""
)

$ErrorActionPreference = "Stop"
$pass = 0
$fail = 0

function Test-Case {
    param([string]$Name, [scriptblock]$Body)
    try {
        $result = & $Body
        if ($result -eq $false) {
            Write-Host "  FAIL  $Name" -ForegroundColor Red
            $script:fail++
        } else {
            Write-Host "  PASS  $Name" -ForegroundColor Green
            $script:pass++
        }
    } catch {
        Write-Host "  FAIL  $Name -> $($_.Exception.Message)" -ForegroundColor Red
        $script:fail++
    }
}

function Invoke-Api {
    param(
        [string]$Path,
        [string]$Method = "Get",
        $Body = $null,
        [string]$Token = $null
    )
    $params = @{
        Uri    = "$ApiBase$Path"
        Method = $Method
    }
    if ($Token) { $params.Headers = @{ Authorization = "Bearer $Token" } }
    if ($Body)  {
        $params.ContentType = "application/json"
        $params.Body = ($Body | ConvertTo-Json)
    }
    Invoke-RestMethod @params
}

function Expect-Failure {
    param([scriptblock]$Body)
    try { & $Body | Out-Null; return $false } catch { return $true }
}

Write-Host "=== Team invitation flow test ===" -ForegroundColor Magenta
Write-Host "API: $ApiBase`n"

# --- health -----------------------------------------------------------------
Test-Case "backend is reachable" {
    $h = Invoke-RestMethod -Uri ($ApiBase -replace '/api$', '/health') -TimeoutSec 5
    $h.status -eq 'OK'
}

# --- set up a throwaway company account -------------------------------------
$suffix = Get-Random
$adminEmail = "e2e_admin_$suffix@example.com"
$adminPass = "adminpass123"
$memberEmail = if ($InviteEmail) { $InviteEmail } else { "e2e_member_$suffix@example.com" }
$memberPass = "memberpass123"

$admin = Invoke-Api -Path "/auth/register" -Method Post -Body @{
    email        = $adminEmail
    password     = $adminPass
    name         = "E2E Admin"
    company_name = "E2E Test Company"
}
$adminToken = $admin.data.accessToken
Write-Host "  (company account: $adminEmail)" -ForegroundColor DarkGray

# --- invite -----------------------------------------------------------------
$invite = Invoke-Api -Path "/team-members/invite" -Method Post -Token $adminToken -Body @{
    full_name    = "E2E Member"
    email        = $memberEmail
    job_role     = "AV Specialist"
    access_level = "authorized_user"
}
$memberId = $invite.data.id

Test-Case "invite creates member with status 'invited'" { $invite.data.status -eq 'invited' }
Test-Case "invitation email was sent"                   { $invite.emailSent -eq $true }
Test-Case "member appears in the team list" {
    (Invoke-Api -Path "/team-members" -Token $adminToken).data.id -contains $memberId
}
Test-Case "email preview renders HTML"                  {
    (Invoke-Api -Path "/team-members/$memberId/email-preview" -Token $adminToken).data.html.Length -gt 500
}
Test-Case "duplicate invite is rejected" {
    Expect-Failure { Invoke-Api -Path "/team-members/invite" -Method Post -Token $adminToken -Body @{ full_name = "Dup"; email = $memberEmail } }
}
Test-Case "invalid email is rejected" {
    Expect-Failure { Invoke-Api -Path "/team-members/invite" -Method Post -Token $adminToken -Body @{ full_name = "Bad"; email = "not-an-email" } }
}
Test-Case "team list requires authentication" {
    Expect-Failure { Invoke-Api -Path "/team-members" }
}

# --- activate ---------------------------------------------------------------
$preview = Invoke-Api -Path "/team-members/$memberId/email-preview" -Token $adminToken
if ($preview.data.html -notmatch 'activate-account\?token=([a-f0-9]+)') {
    throw "Could not extract activation token from the email preview"
}
$inviteToken = $Matches[1]

Test-Case "pending member cannot log in before activating" {
    Expect-Failure { Invoke-Api -Path "/auth/login" -Method Post -Body @{ email = $memberEmail; password = $memberPass } }
}
Test-Case "activation token resolves to the invitee" {
    (Invoke-Api -Path "/team-members/activate/$inviteToken").data.email -eq $memberEmail
}
Test-Case "short password is rejected" {
    Expect-Failure { Invoke-Api -Path "/team-members/activate/$inviteToken" -Method Post -Body @{ password = "123" } }
}
Test-Case "setting a password activates the account" {
    (Invoke-Api -Path "/team-members/activate/$inviteToken" -Method Post -Body @{ password = $memberPass }).success -eq $true
}
Test-Case "activation token is single-use" {
    Expect-Failure { Invoke-Api -Path "/team-members/activate/$inviteToken" }
}
Test-Case "member now shows as active" {
    $m = (Invoke-Api -Path "/team-members" -Token $adminToken).data | Where-Object { $_.id -eq $memberId }
    $m.status -eq 'active'
}
Test-Case "resend is refused once activated" {
    Expect-Failure { Invoke-Api -Path "/team-members/$memberId/resend" -Method Post -Token $adminToken }
}

# --- member login -----------------------------------------------------------
$login = Invoke-Api -Path "/auth/login" -Method Post -Body @{ email = $memberEmail; password = $memberPass }
$memberToken = $login.data.accessToken
$memberRefresh = $login.data.refreshToken

Test-Case "activated member can log in"                  { $login.success -eq $true }
Test-Case "member session is flagged as a team member"   { $login.data.customer.is_team_member -eq $true }
Test-Case "member session scopes to the parent company"  { $login.data.customer.id -eq $admin.data.customer.id }
Test-Case "member keeps their own name"                  { $login.data.customer.name -eq 'E2E Member' }
Test-Case "/auth/me returns the member's identity" {
    (Invoke-Api -Path "/auth/me" -Token $memberToken).data.email -eq $memberEmail
}
Test-Case "member can read shared company team list" {
    (Invoke-Api -Path "/team-members" -Token $memberToken).success -eq $true
}
Test-Case "member can read shared service requests" {
    (Invoke-Api -Path "/service-requests" -Token $memberToken).success -eq $true
}
Test-Case "identity survives a token refresh" {
    $refreshed = Invoke-Api -Path "/auth/refresh" -Method Post -Body @{ refreshToken = $memberRefresh }
    (Invoke-Api -Path "/auth/me" -Token $refreshed.data.accessToken).data.email -eq $memberEmail
}
Test-Case "wrong password is rejected" {
    Expect-Failure { Invoke-Api -Path "/auth/login" -Method Post -Body @{ email = $memberEmail; password = "wrongpass999" } }
}
Test-Case "unknown email is rejected" {
    Expect-Failure { Invoke-Api -Path "/auth/login" -Method Post -Body @{ email = "nobody_$suffix@example.com"; password = "whatever123" } }
}
Test-Case "primary customer login still works" {
    (Invoke-Api -Path "/auth/login" -Method Post -Body @{ email = $adminEmail; password = $adminPass }).success -eq $true
}

# --- cleanup ----------------------------------------------------------------
Test-Case "member can be removed" {
    (Invoke-Api -Path "/team-members/$memberId" -Method Delete -Token $adminToken).success -eq $true
}
Test-Case "removed member is gone from the list" {
    (Invoke-Api -Path "/team-members" -Token $adminToken).data.Count -eq 0
}

# --- summary ----------------------------------------------------------------
Write-Host "`n=== $pass passed, $fail failed ===" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' })
if ($InviteEmail) {
    Write-Host "A real invitation was sent to $InviteEmail (already consumed by this test)." -ForegroundColor Yellow
}
Write-Host "Note: the throwaway account $adminEmail remains in the customers table." -ForegroundColor DarkGray

exit $(if ($fail -eq 0) { 0 } else { 1 })
