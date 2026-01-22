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
echo - instance/*.db (数据库文件)
echo - *.log (日志文件)
echo - uploads/ 中的用户文件
echo - data/outputs/ 中的输出文件
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
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$source = '%ROOT%'.TrimEnd('\');" ^
    "$dest = '%OUTPUT%';" ^
    "if (Test-Path $dest) { Remove-Item $dest -Force };" ^
    "$tempDir = Join-Path $env:TEMP 'xobi_pack';" ^
    "if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force };" ^
    "New-Item -ItemType Directory -Path $tempDir -Force | Out-Null;" ^
    "" ^
    "# Copy files with exclusions" ^
    "$excludeDirs = @('node_modules', '__pycache__', '.git', 'dist', '.vite', 'coverage', '.claude');" ^
    "$excludeFiles = @('.env', '*.pyc', '*.log', '*.db', 'install_log.txt');" ^
    "" ^
    "function Copy-FilteredItem($src, $dst) {" ^
    "    $item = Get-Item $src;" ^
    "    if ($item.PSIsContainer) {" ^
    "        if ($excludeDirs -contains $item.Name) { return };" ^
    "        if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst -Force | Out-Null };" ^
    "        Get-ChildItem $src | ForEach-Object {" ^
    "            $newDst = Join-Path $dst $_.Name;" ^
    "            Copy-FilteredItem $_.FullName $newDst;" ^
    "        };" ^
    "    } else {" ^
    "        $skip = $false;" ^
    "        foreach ($pattern in $excludeFiles) {" ^
    "            if ($item.Name -like $pattern) { $skip = $true; break };" ^
    "        };" ^
    "        if (-not $skip) { Copy-Item $src $dst -Force };" ^
    "    };" ^
    "};" ^
    "" ^
    "Get-ChildItem -Path $source | ForEach-Object {" ^
    "    $destPath = Join-Path $tempDir $_.Name;" ^
    "    Copy-FilteredItem $_.FullName $destPath;" ^
    "};" ^
    "" ^
    "# Remove large generated/user files from temp copy" ^
    "$cleanupPaths = @(" ^
    "    (Join-Path $tempDir 'xobixiangqing\backend\instance\*.db')," ^
    "    (Join-Path $tempDir 'xobixiangqing\backend\uploads\*')," ^
    "    (Join-Path $tempDir 'tupian-de-tu\backend\data\outputs\*')," ^
    "    (Join-Path $tempDir 'tupian-de-tu\backend\data\inputs\*')" ^
    ");" ^
    "foreach ($path in $cleanupPaths) {" ^
    "    if (Test-Path $path) { Remove-Item $path -Recurse -Force -ErrorAction SilentlyContinue };" ^
    "};" ^
    "" ^
    "# Create empty placeholder directories" ^
    "$placeholderDirs = @(" ^
    "    (Join-Path $tempDir 'xobixiangqing\backend\instance')," ^
    "    (Join-Path $tempDir 'xobixiangqing\backend\uploads')," ^
    "    (Join-Path $tempDir 'tupian-de-tu\backend\data\inputs')," ^
    "    (Join-Path $tempDir 'tupian-de-tu\backend\data\outputs')" ^
    ");" ^
    "foreach ($dir in $placeholderDirs) {" ^
    "    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null };" ^
    "    $placeholder = Join-Path $dir '.gitkeep';" ^
    "    if (-not (Test-Path $placeholder)) { '' | Out-File $placeholder -Encoding utf8 };" ^
    "};" ^
    "" ^
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
echo 1. 解压文件到任意目录
echo 2. 双击运行 "安装依赖.bat" （首次使用）
echo 3. 双击运行 "Xobi启动器.bat"
echo 4. 打开浏览器访问 http://localhost:3000
echo 5. 在设置页面配置 API Key
echo.

pause
endlocal
