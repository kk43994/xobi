@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"
set "DATE=%date:~0,4%%date:~5,2%%date:~8,2%"
set "ZIPNAME=Xobi_%DATE%.zip"
set "OUTPUT=%USERPROFILE%\Desktop\%ZIPNAME%"

echo ========================================
echo   Xobi 项目打包工具
echo ========================================
echo.
echo 将打包到: %OUTPUT%
echo.
echo 排除内容:
echo - node_modules/
echo - __pycache__/
echo - .git/
echo - *.pyc
echo - .env (敏感信息)
echo - dist/
echo - .vite/
echo - coverage/
echo.

:: 检查 PowerShell
where powershell >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 需要 PowerShell 来创建 ZIP 文件
    pause
    exit /b 1
)

echo 正在打包，请稍候...
echo.

:: 使用 PowerShell 创建 ZIP，排除不需要的文件
powershell -NoProfile -Command ^
    "$source = '%ROOT%'.TrimEnd('\');" ^
    "$dest = '%OUTPUT%';" ^
    "$exclude = @('node_modules', '__pycache__', '.git', 'dist', '.vite', 'coverage', '*.pyc', '.env');" ^
    "if (Test-Path $dest) { Remove-Item $dest -Force };" ^
    "$tempDir = Join-Path $env:TEMP 'xobi_pack';" ^
    "if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force };" ^
    "New-Item -ItemType Directory -Path $tempDir -Force | Out-Null;" ^
    "Get-ChildItem -Path $source -Exclude '.git' | ForEach-Object {" ^
    "    $destPath = Join-Path $tempDir $_.Name;" ^
    "    if ($_.PSIsContainer) {" ^
    "        Copy-Item $_.FullName $destPath -Recurse -Force -Exclude @('node_modules', '__pycache__', 'dist', '.vite', 'coverage');" ^
    "    } else {" ^
    "        if ($_.Name -ne '.env') { Copy-Item $_.FullName $destPath -Force }" ^
    "    }" ^
    "};" ^
    "Compress-Archive -Path \"$tempDir\*\" -DestinationPath $dest -Force;" ^
    "Remove-Item $tempDir -Recurse -Force;" ^
    "Write-Host '打包完成!'"

if %errorlevel% neq 0 (
    echo [错误] 打包失败
    pause
    exit /b 1
)

echo.
echo ========================================
echo   打包完成!
echo ========================================
echo.
echo 文件位置: %OUTPUT%
echo.
echo 发送给其他人后，对方需要：
echo 1. 解压文件
echo 2. 双击运行 "安装依赖.bat"
echo 3. 复制 xobixiangqing/.env.example 为 .env 并配置
echo 4. 双击运行 "Xobi启动器.bat"
echo.

pause
endlocal
