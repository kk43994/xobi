@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

:: ============================================================
::   Xobi 一键安装脚本
::
::   本脚本会自动安装所有必要的依赖：
::   - 前端依赖 (npm install)
::   - 后端依赖 (pip install)
::   - 工具服务依赖
::   - 视频工作站依赖（如果存在）
::
::   前提条件：
::   1. 已安装 Node.js (推荐 18.x 或更高版本)
::      下载地址: https://nodejs.org/
::   2. 已安装 Python (推荐 3.10 或更高版本)
::      下载地址: https://www.python.org/
::      安装时务必勾选 "Add Python to PATH"
:: ============================================================

:: 设置基础变量
set "ROOT=%~dp0"
set "LOG_FILE=%ROOT%install_log.txt"
set "ERROR_COUNT=0"
set "SUCCESS_COUNT=0"

:: ============================================================
:: 【检查点 1】检测是否在压缩包内直接运行
:: ============================================================
:: 说明：Windows 会把压缩包内的文件临时解压到 Temp 目录
::       如果检测到路径包含 \Temp\，说明用户没有先解压

echo %ROOT% | findstr /i "\\Temp\\" >nul
if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   【错误】请先解压再运行！
    echo ========================================
    echo.
    echo   检测到您正在压缩包内直接运行此脚本。
    echo   这样会导致安装失败！
    echo.
    echo   正确步骤：
    echo   ----------------------------------------
    echo   1. 右键点击 ZIP 压缩包文件
    echo   2. 选择"解压到当前文件夹"或"解压全部"
    echo   3. 进入解压后的文件夹
    echo   4. 再双击运行"安装依赖.bat"
    echo   ----------------------------------------
    echo.
    pause
    exit /b 1
)

:: ============================================================
:: 【检查点 2】检查关键文件是否存在
:: ============================================================
:: 说明：验证项目文件是否完整，避免解压不完整导致的问题

if not exist "%ROOT%xobixiangqing\frontend\package.json" (
    if not exist "%ROOT%xobixiangqing\backend\requirements.txt" (
        echo.
        echo ========================================
        echo   【错误】文件不完整！
        echo ========================================
        echo.
        echo   找不到关键项目文件，可能原因：
        echo   ----------------------------------------
        echo   1. 解压不完整，请重新解压整个压缩包
        echo   2. 在压缩包内直接运行，请先解压
        echo   3. 文件被杀毒软件误删，请检查隔离区
        echo   ----------------------------------------
        echo.
        echo   当前目录: %ROOT%
        echo.
        echo   应该存在的文件：
        echo   - xobixiangqing\frontend\package.json
        echo   - xobixiangqing\backend\requirements.txt
        echo.
        pause
        exit /b 1
    )
)

:: 初始化日志文件
echo Xobi 安装日志 - %date% %time% > "%LOG_FILE%"
echo. >> "%LOG_FILE%"

echo.
echo ========================================
echo   Xobi 一键依赖安装器
echo ========================================
echo.
echo   日志文件: %LOG_FILE%
echo   （如遇问题可将此文件发送给技术支持）
echo.

:: ============================================================
:: 【步骤 1/7】检查 Node.js 是否已安装
:: ============================================================
:: 说明：Node.js 是前端项目运行的必要环境
::       npm 是 Node.js 的包管理器，用于安装前端依赖

echo [1/7] 检查 Node.js 环境...
echo [1/7] 检查 Node.js 环境... >> "%LOG_FILE%"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo   【错误】未检测到 Node.js！
    echo   ----------------------------------------
    echo   Node.js 是前端项目运行的必要环境。
    echo.
    echo   解决方法：
    echo   1. 访问 https://nodejs.org/
    echo   2. 下载 LTS 版本（推荐 18.x 或更高）
    echo   3. 安装时保持默认选项即可
    echo   4. 安装完成后重新运行此脚本
    echo   ----------------------------------------
    echo.
    echo [错误] Node.js 未安装 >> "%LOG_FILE%"
    set /a ERROR_COUNT+=1
    goto CHECK_PYTHON
)

:: 获取并显示 Node.js 版本
for /f "tokens=*" %%i in ('node --version 2^>^&1') do set NODE_VER=%%i
echo   [OK] Node.js 版本: %NODE_VER%
echo [OK] Node.js 版本: %NODE_VER% >> "%LOG_FILE%"

:: 获取并显示 npm 版本
for /f "tokens=*" %%i in ('npm --version 2^>^&1') do set NPM_VER=%%i
echo   [OK] npm 版本: %NPM_VER%
echo [OK] npm 版本: %NPM_VER% >> "%LOG_FILE%"
echo.

:: ============================================================
:: 【步骤 2/7】检查 Python 是否已安装
:: ============================================================
:: 说明：Python 是后端服务运行的必要环境
::       pip 是 Python 的包管理器，用于安装后端依赖

:CHECK_PYTHON
echo [2/7] 检查 Python 环境...
echo [2/7] 检查 Python 环境... >> "%LOG_FILE%"

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo   【错误】未检测到 Python！
    echo   ----------------------------------------
    echo   Python 是后端服务运行的必要环境。
    echo.
    echo   解决方法：
    echo   1. 访问 https://www.python.org/
    echo   2. 下载 Python 3.10 或更高版本
    echo   3. 【重要】安装时务必勾选 "Add Python to PATH"
    echo   4. 安装完成后重新运行此脚本
    echo   ----------------------------------------
    echo.
    echo [错误] Python 未安装 >> "%LOG_FILE%"
    set /a ERROR_COUNT+=1
    goto CHECK_ERRORS_EARLY
)

:: 获取并显示 Python 版本
for /f "tokens=*" %%i in ('python --version 2^>^&1') do set PY_VER=%%i
echo   [OK] %PY_VER%
echo [OK] %PY_VER% >> "%LOG_FILE%"

:: 获取并显示 pip 版本
for /f "tokens=*" %%i in ('pip --version 2^>^&1') do set PIP_VER=%%i
echo   [OK] %PIP_VER%
echo [OK] %PIP_VER% >> "%LOG_FILE%"
echo.

:: ============================================================
:: 【检查点 3】确认必要工具都已安装
:: ============================================================
:: 说明：如果 Node.js 或 Python 缺失，无法继续安装

:CHECK_ERRORS_EARLY
if %ERROR_COUNT% gtr 0 (
    echo.
    echo ========================================
    echo   【致命错误】缺少必要的运行环境！
    echo ========================================
    echo.
    echo   请先安装以下工具，然后重新运行此脚本：
    echo   - Node.js: https://nodejs.org/
    echo   - Python:  https://www.python.org/
    echo.
    echo   安装教程可参考项目文档或百度搜索。
    echo.
    pause
    exit /b 1
)

:: ============================================================
:: 【步骤 3/7】创建必要的目录
:: ============================================================
:: 说明：这些目录用于存放数据库、上传文件等运行时数据

echo [3/7] 创建必要的目录...
echo [3/7] 创建必要的目录... >> "%LOG_FILE%"

:: 主后端目录 - instance 用于存放 SQLite 数据库
if not exist "%ROOT%xobixiangqing\backend\instance" (
    mkdir "%ROOT%xobixiangqing\backend\instance"
    echo   [OK] 已创建: xobixiangqing\backend\instance （数据库目录）
    echo [OK] 已创建: xobixiangqing\backend\instance >> "%LOG_FILE%"
) else (
    echo   [OK] 已存在: xobixiangqing\backend\instance
)

:: 主后端目录 - uploads 用于存放用户上传的文件
if not exist "%ROOT%xobixiangqing\backend\uploads" (
    mkdir "%ROOT%xobixiangqing\backend\uploads"
    echo   [OK] 已创建: xobixiangqing\backend\uploads （上传目录）
    echo [OK] 已创建: xobixiangqing\backend\uploads >> "%LOG_FILE%"
) else (
    echo   [OK] 已存在: xobixiangqing\backend\uploads
)

:: 工具服务目录 - 用于图片处理的输入输出
if exist "%ROOT%tupian-de-tu\backend" (
    if not exist "%ROOT%tupian-de-tu\backend\data" (
        mkdir "%ROOT%tupian-de-tu\backend\data"
        echo   [OK] 已创建: tupian-de-tu\backend\data
    )
    if not exist "%ROOT%tupian-de-tu\backend\data\inputs" (
        mkdir "%ROOT%tupian-de-tu\backend\data\inputs"
        echo   [OK] 已创建: tupian-de-tu\backend\data\inputs （输入目录）
    )
    if not exist "%ROOT%tupian-de-tu\backend\data\outputs" (
        mkdir "%ROOT%tupian-de-tu\backend\data\outputs"
        echo   [OK] 已创建: tupian-de-tu\backend\data\outputs （输出目录）
    )
)
echo.

:: ============================================================
:: 【步骤 4/7】安装主前端依赖
:: ============================================================
:: 说明：使用 npm install 安装 package.json 中定义的前端依赖包
::       这些是 React 项目运行所需的库

echo [4/7] 安装主前端依赖...
echo [4/7] 安装主前端依赖... >> "%LOG_FILE%"
echo      路径: xobixiangqing\frontend
echo      （这一步可能需要几分钟，请耐心等待...）
echo.

cd /d "%ROOT%xobixiangqing\frontend"
if not exist "package.json" (
    echo   【错误】找不到 package.json 文件！
    echo   这是前端项目的配置文件，缺失则无法安装依赖。
    echo [错误] package.json 未找到 >> "%LOG_FILE%"
    set /a ERROR_COUNT+=1
    goto INSTALL_BACKEND
)

:: 执行 npm install
call npm install 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   【错误】前端依赖安装失败！
    echo   ----------------------------------------
    echo   可能原因：
    echo   1. 网络问题，无法下载依赖包
    echo   2. npm 版本过低
    echo   3. 磁盘空间不足
    echo.
    echo   解决方法：
    echo   1. 检查网络连接
    echo   2. 尝试使用国内镜像: npm config set registry https://registry.npmmirror.com
    echo   3. 重新运行此脚本
    echo   ----------------------------------------
    echo [错误] 前端 npm install 失败，错误码: %errorlevel% >> "%LOG_FILE%"
    set /a ERROR_COUNT+=1
) else (
    echo   [OK] 前端依赖安装成功
    echo [OK] 前端依赖安装成功 >> "%LOG_FILE%"
    set /a SUCCESS_COUNT+=1
)
echo.

:: ============================================================
:: 【步骤 5/7】安装主后端依赖
:: ============================================================
:: 说明：使用 pip install 安装 requirements.txt 中定义的 Python 包
::       这些是 Flask 后端服务运行所需的库

:INSTALL_BACKEND
echo [5/7] 安装主后端依赖...
echo [5/7] 安装主后端依赖... >> "%LOG_FILE%"
echo      路径: xobixiangqing\backend
echo.

cd /d "%ROOT%xobixiangqing\backend"
if not exist "requirements.txt" (
    echo   【错误】找不到 requirements.txt 文件！
    echo   这是后端项目的依赖配置文件。
    echo [错误] requirements.txt 未找到 >> "%LOG_FILE%"
    set /a ERROR_COUNT+=1
    goto INSTALL_TOOLS
)

:: 执行 pip install
pip install -r requirements.txt 2>&1
if %errorlevel% neq 0 (
    echo.
    echo   【警告】后端依赖可能存在问题
    echo   ----------------------------------------
    echo   部分包可能安装失败，请检查上方输出。
    echo.
    echo   常见问题：
    echo   1. 某些包需要 Visual C++ Build Tools
    echo   2. 网络问题导致下载失败
    echo.
    echo   解决方法：
    echo   1. 尝试使用国内镜像: pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple
    echo   2. 重新运行此脚本
    echo   ----------------------------------------
    echo [警告] 后端 pip install 有警告或错误 >> "%LOG_FILE%"
) else (
    echo   [OK] 后端依赖安装成功
    echo [OK] 后端依赖安装成功 >> "%LOG_FILE%"
    set /a SUCCESS_COUNT+=1
)
echo.

:: ============================================================
:: 【步骤 6/7】安装工具服务依赖
:: ============================================================
:: 说明：tupian-de-tu 是图片处理工具服务
::       如果不存在则跳过（可选模块）

:INSTALL_TOOLS
echo [6/7] 安装工具服务依赖...
echo [6/7] 安装工具服务依赖... >> "%LOG_FILE%"

if not exist "%ROOT%tupian-de-tu\backend\requirements.txt" (
    echo   [跳过] 未找到 tupian-de-tu 工具服务（可选模块）
    echo [跳过] tupian-de-tu 未找到 >> "%LOG_FILE%"
    goto INSTALL_VIDEO
)

echo      路径: tupian-de-tu\backend
echo.

cd /d "%ROOT%tupian-de-tu\backend"
pip install -r requirements.txt 2>&1
if %errorlevel% neq 0 (
    echo   【警告】工具服务依赖可能存在问题
    echo [警告] 工具服务 pip install 有警告或错误 >> "%LOG_FILE%"
) else (
    echo   [OK] 工具服务依赖安装成功
    echo [OK] 工具服务依赖安装成功 >> "%LOG_FILE%"
    set /a SUCCESS_COUNT+=1
)
echo.

:: ============================================================
:: 【步骤 7/7】安装视频工作站依赖
:: ============================================================
:: 说明：video-workstation 是视频处理模块
::       如果不存在则跳过（可选模块）

:INSTALL_VIDEO
echo [7/7] 安装视频工作站依赖...
echo [7/7] 安装视频工作站依赖... >> "%LOG_FILE%"

if not exist "%ROOT%video-workstation\package.json" (
    echo   [跳过] 未找到 video-workstation 视频工作站（可选模块）
    echo [跳过] video-workstation 未找到 >> "%LOG_FILE%"
    goto SUMMARY
)

echo      路径: video-workstation (根目录 + server + client)
echo.

:: 安装根目录依赖（包含 concurrently 等工具）
cd /d "%ROOT%video-workstation"
echo      正在安装根目录依赖...
call npm install 2>&1
if %errorlevel% neq 0 (
    echo   【警告】视频工作站根目录依赖安装有问题
    echo [警告] video-workstation 根目录 npm install 失败 >> "%LOG_FILE%"
)

:: 安装服务端依赖
if exist "%ROOT%video-workstation\server\package.json" (
    echo      正在安装服务端依赖...
    cd /d "%ROOT%video-workstation\server"
    call npm install 2>&1
    if %errorlevel% neq 0 (
        echo   【警告】视频工作站服务端依赖安装有问题
        echo [警告] video-workstation server npm install 失败 >> "%LOG_FILE%"
    )
)

:: 安装客户端依赖
if exist "%ROOT%video-workstation\client\package.json" (
    echo      正在安装客户端依赖...
    cd /d "%ROOT%video-workstation\client"
    call npm install 2>&1
    if %errorlevel% neq 0 (
        echo   【警告】视频工作站客户端依赖安装有问题
        echo [警告] video-workstation client npm install 失败 >> "%LOG_FILE%"
    )
)

echo   [OK] 视频工作站依赖安装完成
echo [OK] 视频工作站依赖安装完成 >> "%LOG_FILE%"
set /a SUCCESS_COUNT+=1
echo.

:: ============================================================
:: 【安装总结】
:: ============================================================
:SUMMARY
echo.
echo ========================================
echo   安装总结
echo ========================================
echo.

if %ERROR_COUNT% equ 0 (
    echo   【成功】所有依赖安装完成！
    echo.
    echo   下一步操作：
    echo   ----------------------------------------
    echo   1. 双击运行 "Xobi启动器.bat" 启动服务
    echo   2. 浏览器打开 http://localhost:3000
    echo   3. 进入设置页面，填写 API Key
    echo   ----------------------------------------
    echo.
) else (
    echo   【警告】安装过程中有 %ERROR_COUNT% 个错误
    echo.
    echo   请检查：
    echo   ----------------------------------------
    echo   1. 上方的错误提示信息
    echo   2. 日志文件: %LOG_FILE%
    echo   ----------------------------------------
    echo.
    echo   常见解决方法：
    echo   ----------------------------------------
    echo   1. 确保 Node.js 和 Python 已正确安装并添加到 PATH
    echo   2. 尝试以管理员身份运行此脚本
    echo   3. 检查网络连接是否正常
    echo   4. 使用国内镜像源加速下载
    echo   ----------------------------------------
    echo.
)

echo   日志文件已保存到: %LOG_FILE%
echo   （如需技术支持，请将此文件发送给开发者）
echo.

:: 写入日志总结
echo. >> "%LOG_FILE%"
echo ======================================== >> "%LOG_FILE%"
echo 安装总结: %SUCCESS_COUNT% 个成功, %ERROR_COUNT% 个错误 >> "%LOG_FILE%"
echo 完成时间: %date% %time% >> "%LOG_FILE%"

pause
endlocal
