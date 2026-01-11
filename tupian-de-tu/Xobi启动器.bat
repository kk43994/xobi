@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0.."

echo ========================================
echo   Xobi 启动器（Legacy - B 工具仓库）
echo ========================================
echo.
echo 说明：当前项目已进入“融合版”模式。
echo - 请使用根目录启动器：%ROOT%\Xobi启动器.bat
echo - 该启动器会统一启动 Core(A) + Tools(B) + Portal + Video
echo.

if exist "%ROOT%\Xobi启动器.bat" (
  call "%ROOT%\Xobi启动器.bat"
) else (
  echo [Error] 找不到根目录启动器：%ROOT%\Xobi启动器.bat
  pause
)

endlocal
