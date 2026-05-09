@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%setup-cloudflare-secrets.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Setup failed with exit code %EXIT_CODE%.
  exit /b %EXIT_CODE%
)

echo.
echo Done.
exit /b 0
