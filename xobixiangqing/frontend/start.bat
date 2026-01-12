@echo off
setlocal

echo Starting xobi Frontend...
echo.

if not exist node_modules\\ (
    echo Installing dependencies...
    call npm install
)

echo Starting Vite dev server on http://localhost:3000
echo.

call npm run dev

pause
endlocal
