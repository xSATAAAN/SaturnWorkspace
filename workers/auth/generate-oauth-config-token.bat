@echo off
setlocal EnableExtensions

cd /d "%~dp0"

for /f "usebackq delims=" %%T in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$bytes = New-Object byte[] 32; $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($bytes); $rng.Dispose(); [Convert]::ToBase64String($bytes)"`) do set "TOKEN=%%T"

if "%TOKEN%"=="" (
  echo Failed to generate token.
  exit /b 1
)

echo.
echo OAUTH_CONFIG_ACCESS_TOKEN:
echo %TOKEN%
echo.
echo %TOKEN%| clip
echo Token copied to clipboard.
echo.

choice /C YN /N /M "Upload this token to Cloudflare Worker secret now? [Y/N] "
if errorlevel 2 (
  echo Skipped Cloudflare upload.
  exit /b 0
)

echo %TOKEN%| npx wrangler secret put OAUTH_CONFIG_ACCESS_TOKEN
