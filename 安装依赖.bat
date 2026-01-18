@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
set "LOG_FILE=%ROOT%install_log.txt"
set "ERROR_COUNT=0"
set "SUCCESS_COUNT=0"

:: Clear log file
echo Xobi Install Log - %date% %time% > "%LOG_FILE%"
echo. >> "%LOG_FILE%"

echo ========================================
echo   Xobi - One-Click Dependency Installer
echo ========================================
echo.
echo [INFO] Log file: %LOG_FILE%
echo.

:: ========================================
:: Step 1: Check Node.js
:: ========================================
echo [1/7] Checking Node.js...
echo [1/7] Checking Node.js... >> "%LOG_FILE%"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found!
    echo [ERROR] Node.js not found! >> "%LOG_FILE%"
    echo        Please install Node.js from: https://nodejs.org/
    echo        Recommended version: 18.x or higher
    echo.
    set /a ERROR_COUNT+=1
    goto CHECK_PYTHON
)

for /f "tokens=*" %%i in ('node --version 2^>^&1') do set NODE_VER=%%i
echo [OK] Node.js version: %NODE_VER%
echo [OK] Node.js version: %NODE_VER% >> "%LOG_FILE%"

for /f "tokens=*" %%i in ('npm --version 2^>^&1') do set NPM_VER=%%i
echo [OK] npm version: %NPM_VER%
echo [OK] npm version: %NPM_VER% >> "%LOG_FILE%"
echo.

:: ========================================
:: Step 2: Check Python
:: ========================================
:CHECK_PYTHON
echo [2/7] Checking Python...
echo [2/7] Checking Python... >> "%LOG_FILE%"

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python not found!
    echo [ERROR] Python not found! >> "%LOG_FILE%"
    echo        Please install Python from: https://www.python.org/
    echo        Recommended version: 3.10 or higher
    echo        IMPORTANT: Check "Add Python to PATH" during installation!
    echo.
    set /a ERROR_COUNT+=1
    goto CHECK_ERRORS_EARLY
)

for /f "tokens=*" %%i in ('python --version 2^>^&1') do set PY_VER=%%i
echo [OK] %PY_VER%
echo [OK] %PY_VER% >> "%LOG_FILE%"

for /f "tokens=*" %%i in ('pip --version 2^>^&1') do set PIP_VER=%%i
echo [OK] %PIP_VER%
echo [OK] %PIP_VER% >> "%LOG_FILE%"
echo.

:: ========================================
:: Check for critical errors before continuing
:: ========================================
:CHECK_ERRORS_EARLY
if %ERROR_COUNT% gtr 0 (
    echo ========================================
    echo [FATAL] Missing required tools!
    echo         Please install Node.js and Python first.
    echo         Then run this script again.
    echo ========================================
    echo.
    pause
    exit /b 1
)

:: ========================================
:: Step 3: Create required directories
:: ========================================
echo [3/7] Creating required directories...
echo [3/7] Creating required directories... >> "%LOG_FILE%"

:: Main backend directories
if not exist "%ROOT%xobixiangqing\backend\instance" (
    mkdir "%ROOT%xobixiangqing\backend\instance"
    echo [OK] Created: xobixiangqing\backend\instance
    echo [OK] Created: xobixiangqing\backend\instance >> "%LOG_FILE%"
) else (
    echo [OK] Exists: xobixiangqing\backend\instance
)

if not exist "%ROOT%xobixiangqing\backend\uploads" (
    mkdir "%ROOT%xobixiangqing\backend\uploads"
    echo [OK] Created: xobixiangqing\backend\uploads
    echo [OK] Created: xobixiangqing\backend\uploads >> "%LOG_FILE%"
) else (
    echo [OK] Exists: xobixiangqing\backend\uploads
)

:: Tools backend directories
if exist "%ROOT%tupian-de-tu\backend" (
    if not exist "%ROOT%tupian-de-tu\backend\data" (
        mkdir "%ROOT%tupian-de-tu\backend\data"
        echo [OK] Created: tupian-de-tu\backend\data
    )
    if not exist "%ROOT%tupian-de-tu\backend\data\inputs" (
        mkdir "%ROOT%tupian-de-tu\backend\data\inputs"
        echo [OK] Created: tupian-de-tu\backend\data\inputs
    )
    if not exist "%ROOT%tupian-de-tu\backend\data\outputs" (
        mkdir "%ROOT%tupian-de-tu\backend\data\outputs"
        echo [OK] Created: tupian-de-tu\backend\data\outputs
    )
)
echo.

:: ========================================
:: Step 4: Install main frontend dependencies
:: ========================================
echo [4/7] Installing main frontend dependencies...
echo [4/7] Installing main frontend dependencies... >> "%LOG_FILE%"
echo      Path: xobixiangqing\frontend
echo      This may take a few minutes...
echo.

cd /d "%ROOT%xobixiangqing\frontend"
if not exist "package.json" (
    echo [ERROR] package.json not found in xobixiangqing\frontend
    echo [ERROR] package.json not found >> "%LOG_FILE%"
    set /a ERROR_COUNT+=1
    goto INSTALL_BACKEND
)

call npm install 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Frontend dependencies installation failed!
    echo [ERROR] Frontend npm install failed with code %errorlevel% >> "%LOG_FILE%"
    echo        Check the output above for details.
    set /a ERROR_COUNT+=1
) else (
    echo [OK] Frontend dependencies installed successfully
    echo [OK] Frontend dependencies installed >> "%LOG_FILE%"
    set /a SUCCESS_COUNT+=1
)
echo.

:: ========================================
:: Step 5: Install main backend dependencies
:: ========================================
:INSTALL_BACKEND
echo [5/7] Installing main backend dependencies...
echo [5/7] Installing main backend dependencies... >> "%LOG_FILE%"
echo      Path: xobixiangqing\backend
echo.

cd /d "%ROOT%xobixiangqing\backend"
if not exist "requirements.txt" (
    echo [ERROR] requirements.txt not found in xobixiangqing\backend
    echo [ERROR] requirements.txt not found >> "%LOG_FILE%"
    set /a ERROR_COUNT+=1
    goto INSTALL_TOOLS
)

pip install -r requirements.txt 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Backend dependencies may have issues
    echo [WARNING] Backend pip install had warnings/errors >> "%LOG_FILE%"
    echo          Some packages may have failed to install.
    echo          Check the output above for details.
) else (
    echo [OK] Backend dependencies installed successfully
    echo [OK] Backend dependencies installed >> "%LOG_FILE%"
    set /a SUCCESS_COUNT+=1
)
echo.

:: ========================================
:: Step 6: Install tools service dependencies
:: ========================================
:INSTALL_TOOLS
echo [6/7] Installing tools service dependencies...
echo [6/7] Installing tools service dependencies... >> "%LOG_FILE%"

if not exist "%ROOT%tupian-de-tu\backend\requirements.txt" (
    echo [SKIP] tupian-de-tu\backend not found, skipping
    echo [SKIP] tupian-de-tu\backend not found >> "%LOG_FILE%"
    goto INSTALL_VIDEO
)

echo      Path: tupian-de-tu\backend
echo.

cd /d "%ROOT%tupian-de-tu\backend"
pip install -r requirements.txt 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] Tools service dependencies may have issues
    echo [WARNING] Tools pip install had warnings/errors >> "%LOG_FILE%"
) else (
    echo [OK] Tools service dependencies installed successfully
    echo [OK] Tools service dependencies installed >> "%LOG_FILE%"
    set /a SUCCESS_COUNT+=1
)
echo.

:: ========================================
:: Step 7: Install video workstation dependencies
:: ========================================
:INSTALL_VIDEO
echo [7/7] Installing video workstation dependencies...
echo [7/7] Installing video workstation dependencies... >> "%LOG_FILE%"

if not exist "%ROOT%video-workstation\package.json" (
    echo [SKIP] video-workstation not found, skipping
    echo [SKIP] video-workstation not found >> "%LOG_FILE%"
    goto SUMMARY
)

echo      Path: video-workstation (root + server + client)
echo.

:: Install root dependencies (concurrently)
cd /d "%ROOT%video-workstation"
echo      Installing root dependencies...
call npm install 2>&1
if %errorlevel% neq 0 (
    echo [WARNING] video-workstation root npm install had issues
    echo [WARNING] video-workstation root npm install failed >> "%LOG_FILE%"
)

:: Install server dependencies
if exist "%ROOT%video-workstation\server\package.json" (
    echo      Installing server dependencies...
    cd /d "%ROOT%video-workstation\server"
    call npm install 2>&1
    if %errorlevel% neq 0 (
        echo [WARNING] video-workstation server npm install had issues
        echo [WARNING] video-workstation server npm install failed >> "%LOG_FILE%"
    )
)

:: Install client dependencies
if exist "%ROOT%video-workstation\client\package.json" (
    echo      Installing client dependencies...
    cd /d "%ROOT%video-workstation\client"
    call npm install 2>&1
    if %errorlevel% neq 0 (
        echo [WARNING] video-workstation client npm install had issues
        echo [WARNING] video-workstation client npm install failed >> "%LOG_FILE%"
    )
)

echo [OK] Video workstation dependencies installed
echo [OK] Video workstation dependencies installed >> "%LOG_FILE%"
set /a SUCCESS_COUNT+=1
echo.

:: ========================================
:: Summary
:: ========================================
:SUMMARY
echo ========================================
echo   Installation Summary
echo ========================================
echo.

if %ERROR_COUNT% equ 0 (
    echo [SUCCESS] All dependencies installed successfully!
    echo.
    echo Next steps:
    echo   1. Run "Xobi启动器.bat" to start the application
    echo   2. Open http://localhost:3000 in your browser
    echo   3. Go to Settings and enter your API Key
    echo.
) else (
    echo [WARNING] Installation completed with %ERROR_COUNT% error(s)
    echo.
    echo Please check:
    echo   - The error messages above
    echo   - The log file: %LOG_FILE%
    echo.
    echo Common fixes:
    echo   - Make sure Node.js and Python are in PATH
    echo   - Try running as Administrator
    echo   - Check your internet connection
    echo.
)

echo Installation log saved to: %LOG_FILE%
echo.

:: Log summary
echo. >> "%LOG_FILE%"
echo ======================================== >> "%LOG_FILE%"
echo Summary: %SUCCESS_COUNT% successful, %ERROR_COUNT% errors >> "%LOG_FILE%"
echo Completed at: %date% %time% >> "%LOG_FILE%"

pause
endlocal
