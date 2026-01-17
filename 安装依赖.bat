@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"

echo ========================================
echo   Xobi 一键安装依赖
echo ========================================
echo.

:: 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: 检查 Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Python，请先安装 Python 3.10+
    echo 下载地址: https://www.python.org/
    pause
    exit /b 1
)

echo [信息] Node.js 版本:
node --version
echo.
echo [信息] Python 版本:
python --version
echo.

:: 安装前端依赖
echo ========================================
echo [1/2] 安装前端依赖 (npm install)
echo ========================================
cd /d "%ROOT%xobixiangqing\frontend"
if not exist "package.json" (
    echo [错误] 找不到 package.json
    pause
    exit /b 1
)
call npm install
if %errorlevel% neq 0 (
    echo [错误] 前端依赖安装失败
    pause
    exit /b 1
)
echo [成功] 前端依赖安装完成
echo.

:: 安装后端依赖
echo ========================================
echo [2/2] 安装后端依赖 (pip install)
echo ========================================
cd /d "%ROOT%xobixiangqing\backend"
if not exist "requirements.txt" (
    echo [错误] 找不到 requirements.txt
    pause
    exit /b 1
)
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [警告] 后端依赖安装可能有问题，请检查上面的错误信息
) else (
    echo [成功] 后端依赖安装完成
)
echo.

:: 检查 tupian-de-tu 后端
if exist "%ROOT%tupian-de-tu\backend\requirements.txt" (
    echo ========================================
    echo [额外] 安装工具服务依赖
    echo ========================================
    cd /d "%ROOT%tupian-de-tu\backend"
    pip install -r requirements.txt
    echo [成功] 工具服务依赖安装完成
    echo.
)

echo ========================================
echo   全部依赖安装完成！
echo ========================================
echo.
echo 现在可以运行 "Xobi启动器.bat" 启动服务
echo.

pause
endlocal
