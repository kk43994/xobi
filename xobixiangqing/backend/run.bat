@echo off
setlocal

cd /d "%~dp0"

echo Starting xobi Backend...
echo.

if not exist instance mkdir instance
if not exist uploads mkdir uploads

:: 检查并安装依赖
if exist requirements.txt (
    echo Checking dependencies...
    pip install -r requirements.txt -q
    echo.
)

echo Starting Flask server on port 5000...
echo.

:: 尝试不同的 Python 命令
where py >nul 2>&1
if %errorlevel% equ 0 (
    py app.py
) else (
    python app.py
)

echo.
echo Flask exited with code: %errorlevel%
echo.
pause
endlocal
