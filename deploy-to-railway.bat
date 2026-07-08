@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo Work Order System - Railway Deploy
echo ========================================
echo.
echo This will open Railway login if needed.
echo Please sign in with your Railway account.
echo.

railway.exe whoami >nul 2>nul
if errorlevel 1 (
  railway.exe login
  if errorlevel 1 (
    echo.
    echo Login failed. Please try again.
    pause
    exit /b 1
  )
)

echo.
echo Deploying project to Railway...
railway.exe up --new --name work-order-system --detach -y
if errorlevel 1 (
  echo.
  echo Deploy failed.
  pause
  exit /b 1
)

echo.
echo Setting DATA_DIR=/data ...
railway.exe variable set DATA_DIR=/data --skip-deploys

echo.
echo Creating/attaching persistent volume at /data ...
railway.exe volume add --mount-path /data

echo.
echo Creating Railway public domain...
railway.exe domain --port 8787

echo.
echo Done. If Railway prints a URL above, open it in your browser.
echo If no URL appears, open the Railway dashboard and check the project domain.
pause
