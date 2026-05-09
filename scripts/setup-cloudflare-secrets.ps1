$ErrorActionPreference = "Stop"

$ExpectedAccountId = "0665376659b7e5b47ccc2114b25f75a6"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$AuthWorkerDir = Join-Path $RepoRoot "workers\auth"
$AdminWorkerDir = Join-Path $RepoRoot "workers\admin"

function New-RandomSecret {
  param([int]$Bytes = 32)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $data = New-Object byte[] $Bytes
    $rng.GetBytes($data)
    return [Convert]::ToBase64String($data).TrimEnd("=").Replace("+", "-").Replace("/", "_")
  }
  finally {
    $rng.Dispose()
  }
}

function Read-Required {
  param(
    [string]$Prompt,
    [string]$Default = ""
  )
  while ($true) {
    if ($Default) {
      $value = Read-Host "$Prompt [$Default]"
      if (-not $value.Trim()) { $value = $Default }
    }
    else {
      $value = Read-Host $Prompt
    }
    $value = $value.Trim()
    if ($value) { return $value }
    Write-Host "Value is required." -ForegroundColor Yellow
  }
}

function Read-RequiredSecret {
  param([string]$Prompt)
  while ($true) {
    $secure = Read-Host $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
    $value = String($value).Trim()
    if ($value) { return $value }
    Write-Host "Value is required." -ForegroundColor Yellow
  }
}

function Read-OAuthJson {
  while ($true) {
    $path = Read-Host "Google OAuth client JSON file path"
    $path = $path.Trim('"').Trim()
    if (-not $path) {
      Write-Host "Value is required." -ForegroundColor Yellow
      continue
    }
    if (-not (Test-Path -LiteralPath $path)) {
      Write-Host "File not found: $path" -ForegroundColor Yellow
      continue
    }
    $raw = Get-Content -LiteralPath $path -Raw
    try {
      $json = $raw | ConvertFrom-Json
      return ($json | ConvertTo-Json -Depth 20 -Compress)
    }
    catch {
      Write-Host "Invalid JSON file. Choose the downloaded OAuth client JSON file." -ForegroundColor Yellow
    }
  }
}

function Put-WorkerSecret {
  param(
    [string]$WorkerDir,
    [string]$Name,
    [string]$Value
  )
  if (-not $Value) {
    throw "Missing value for $Name"
  }
  Push-Location $WorkerDir
  try {
    Write-Host "Uploading $Name in $(Split-Path -Leaf $WorkerDir)..." -ForegroundColor Cyan
    $Value | npx wrangler secret put $Name
  }
  finally {
    Pop-Location
  }
}

Write-Host "Saturn Workspace Cloudflare secret setup" -ForegroundColor Green
Write-Host "This script does not write secret values to disk." -ForegroundColor DarkGray
Write-Host ""

foreach ($dir in @($AuthWorkerDir, $AdminWorkerDir)) {
  if (-not (Test-Path -LiteralPath $dir)) {
    throw "Missing Worker directory: $dir"
  }
}

$whoami = (& npx wrangler whoami 2>&1) -join "`n"
if ($whoami -notmatch [regex]::Escape($ExpectedAccountId)) {
  Write-Host $whoami
  throw "Wrangler is not logged into Cloudflare account $ExpectedAccountId. Run: npx wrangler login"
}

$generated = [ordered]@{
  OAUTH_CONFIG_ACCESS_TOKEN = New-RandomSecret 32
  ADMIN_LAYER1_PASSWORD = New-RandomSecret 24
  ADMIN_LAYER1_SESSION_SECRET = New-RandomSecret 64
  ADMIN_API_TOKEN = New-RandomSecret 32
  CRASH_INGEST_TOKEN = New-RandomSecret 32
}

Write-Host ""
Write-Host "Generated secrets. Save these in your password manager now:" -ForegroundColor Yellow
foreach ($item in $generated.GetEnumerator()) {
  Write-Host ("{0}={1}" -f $item.Key, $item.Value)
}
Write-Host ""

$adminUsername = Read-Required "ADMIN_LAYER1_USERNAME" "admin"
$adminAllowlist = Read-Required "ADMIN_EMAIL_ALLOWLIST (comma-separated admin Google emails)" "abdelrahman@saturnws.com"
$supabaseUrl = Read-Required "Supabase project URL, example https://xxxxx.supabase.co"
$supabaseServiceRole = Read-RequiredSecret "Supabase service_role key"
$firebaseProjectId = Read-Required "Firebase project id"
$firebaseWebApiKey = Read-Required "Firebase web API key"
$googleDriveConfigJson = Read-OAuthJson

Write-Host ""
Write-Host "About to upload secrets to Cloudflare Workers:" -ForegroundColor Yellow
Write-Host "- saturnws-auth"
Write-Host "- saturnws-admin"
$confirm = Read-Host "Type YES to continue"
if ($confirm -ne "YES") {
  Write-Host "Cancelled."
  exit 1
}

Put-WorkerSecret $AuthWorkerDir "SUPABASE_API_URL" $supabaseUrl
Put-WorkerSecret $AuthWorkerDir "SUPABASE_SERVICE_ROLE_KEY" $supabaseServiceRole
Put-WorkerSecret $AuthWorkerDir "GOOGLE_DRIVE_CLIENT_CONFIG_JSON" $googleDriveConfigJson
Put-WorkerSecret $AuthWorkerDir "FIREBASE_WEB_API_KEY" $firebaseWebApiKey
Put-WorkerSecret $AuthWorkerDir "OAUTH_CONFIG_ACCESS_TOKEN" $generated.OAUTH_CONFIG_ACCESS_TOKEN

Put-WorkerSecret $AdminWorkerDir "SUPABASE_URL" $supabaseUrl
Put-WorkerSecret $AdminWorkerDir "SUPABASE_SERVICE_ROLE_KEY" $supabaseServiceRole
Put-WorkerSecret $AdminWorkerDir "FIREBASE_WEB_API_KEY" $firebaseWebApiKey
Put-WorkerSecret $AdminWorkerDir "FIREBASE_PROJECT_ID" $firebaseProjectId
Put-WorkerSecret $AdminWorkerDir "ADMIN_LAYER1_USERNAME" $adminUsername
Put-WorkerSecret $AdminWorkerDir "ADMIN_LAYER1_PASSWORD" $generated.ADMIN_LAYER1_PASSWORD
Put-WorkerSecret $AdminWorkerDir "ADMIN_LAYER1_SESSION_SECRET" $generated.ADMIN_LAYER1_SESSION_SECRET
Put-WorkerSecret $AdminWorkerDir "ADMIN_EMAIL_ALLOWLIST" $adminAllowlist
Put-WorkerSecret $AdminWorkerDir "ADMIN_API_TOKEN" $generated.ADMIN_API_TOKEN
Put-WorkerSecret $AdminWorkerDir "CRASH_INGEST_TOKEN" $generated.CRASH_INGEST_TOKEN

Write-Host ""
Write-Host "Auth Worker secrets:" -ForegroundColor Green
Push-Location $AuthWorkerDir
try { npx wrangler secret list }
finally { Pop-Location }

Write-Host ""
Write-Host "Admin Worker secrets:" -ForegroundColor Green
Push-Location $AdminWorkerDir
try { npx wrangler secret list }
finally { Pop-Location }

Write-Host ""
Write-Host "Cloudflare secrets uploaded successfully." -ForegroundColor Green
