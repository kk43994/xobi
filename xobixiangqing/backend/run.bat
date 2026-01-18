@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

echo ========================================
echo   Xobi Backend Service
echo ========================================
echo.

:: Create required directories
if not exist instance mkdir instance
if not exist uploads mkdir uploads

:: Select Python command
set "PY_CMD=python"
where py >nul 2>&1
if %errorlevel% equ 0 set "PY_CMD=py"

:: Check and install dependencies
if exist requirements.txt (
    echo [1/3] Checking dependencies...
    %PY_CMD% -m pip install -r requirements.txt -q
    if %errorlevel% neq 0 (
        echo [WARNING] Some dependencies may have failed to install
    ) else (
        echo [OK] Dependencies checked
    )
    echo.
)

:: Run database migrations
echo [2/3] Running database migrations...
set FLASK_APP=app.py
%PY_CMD% -m flask db upgrade 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Database migration had issues, trying to initialize...
    %PY_CMD% -m flask db init 2>nul
    %PY_CMD% -m flask db upgrade 2>&1
)
echo [OK] Database ready
echo.

:: Start Flask server
echo [3/3] Starting Flask server on http://localhost:5000
echo.
%PY_CMD% app.py

echo.
echo Flask exited with code: %errorlevel%
echo.
pause
endlocal
