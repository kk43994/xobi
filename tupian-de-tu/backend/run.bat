@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

cd /d "%~dp0"

echo ========================================
echo   Xobi Tools (B) - Backend
echo ========================================
echo.

rem 1) Kill old process on port 8001 (avoid conflicts)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8001 ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>&1
)

rem 2) Select python command (prefer py)
set "PY_CMD=python"
where py >nul 2>&1
if %errorlevel% equ 0 set "PY_CMD=py"

rem 3) Install deps (best-effort)
if exist requirements.txt (
  echo Checking dependencies...
  %PY_CMD% -m pip install -r requirements.txt -q
  echo.
)

rem 4) Start FastAPI (uvicorn)
echo Starting FastAPI server on: http://localhost:8001
echo.
%PY_CMD% -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload

echo.
echo FastAPI exited with code: %errorlevel%
echo.
pause
endlocal
