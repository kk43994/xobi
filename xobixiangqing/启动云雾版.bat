@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
if /i "%XOBI_DEBUG_STARTUP%"=="1" echo on

set "ROOT=%~dp0"
pushd "%ROOT%" >nul

set "BACKEND_DIR=%ROOT%backend"
set "FRONTEND_DIR=%ROOT%frontend"
set "LEGACY_B_BACKEND_DIR=%ROOT%..\tupian-de-tu\backend"
set "VIDEO_WS_DIR=%ROOT%..\video-workstation"

echo ========================================
echo   xobi - YunWu API Edition
echo ========================================
echo.
echo Tips:
echo 1. This version uses YunWu.ai third-party API
echo 2. After startup, go to Settings to enter your API Key
echo.

rem Clean old processes on fixed ports (avoid port conflict / Vite auto-switch port).
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8001 ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4000 ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>&1
)

rem Check required files
if not exist "%BACKEND_DIR%\run.bat" ( echo [Error] backend\run.bat not found && pause && goto END )
if not exist "%FRONTEND_DIR%\start.bat" ( echo [Error] frontend\start.bat not found && pause && goto END )

rem Start backend (new window)
echo Starting backend service...
start "xobi-backend" /D "%BACKEND_DIR%" cmd /k call run.bat

rem Start legacy tools backend (B) (new window)
if exist "%LEGACY_B_BACKEND_DIR%\run.bat" (
  echo Starting legacy tools service ^(B^)...
  start "xobi-tools-b" /D "%LEGACY_B_BACKEND_DIR%" cmd /k call run.bat
) else (
  echo Legacy tools backend not found, skipping. ^(%LEGACY_B_BACKEND_DIR%\run.bat^)
)

rem Start frontend (new window)
echo Starting frontend service...
start "xobi-frontend" /D "%FRONTEND_DIR%" cmd /k call start.bat

rem Start video workstation (new window)
if exist "%VIDEO_WS_DIR%\package.json" (
  echo Starting video workstation...
  start "xobi-video" /D "%VIDEO_WS_DIR%" cmd /k npm run dev
) else (
  echo Video workstation not found, skipping. ^(%VIDEO_WS_DIR%\package.json^)
)

rem Wait a bit and open the portal.
echo Waiting for services to be ready (5 seconds)...
timeout /t 5 /nobreak >nul
echo Opening: http://localhost:3000
start http://localhost:3000

echo.
echo All services started.
echo If browser did not open, manually visit: http://localhost:3000
echo.
pause

:END
popd >nul
endlocal
