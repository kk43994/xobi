$zip = 'C:\Users\zhouk\Desktop\Xobi_20260119.zip'
$tempDir = Join-Path $env:TEMP 'xobi_check'
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $tempDir -Force

Write-Host "=== Top Level ===" -ForegroundColor Cyan
Get-ChildItem $tempDir | Select-Object Name | Format-Table -AutoSize

Write-Host "`n=== xobixiangqing ===" -ForegroundColor Cyan
Get-ChildItem (Join-Path $tempDir 'xobixiangqing') | Select-Object Name | Format-Table -AutoSize

Write-Host "`n=== xobixiangqing/backend ===" -ForegroundColor Cyan
Get-ChildItem (Join-Path $tempDir 'xobixiangqing\backend') | Select-Object Name | Format-Table -AutoSize

Write-Host "`n=== xobixiangqing/backend/migrations/versions ===" -ForegroundColor Cyan
Get-ChildItem (Join-Path $tempDir 'xobixiangqing\backend\migrations\versions') | Select-Object Name | Format-Table -AutoSize

Write-Host "`n=== xobixiangqing/frontend ===" -ForegroundColor Cyan
Get-ChildItem (Join-Path $tempDir 'xobixiangqing\frontend') | Select-Object Name | Format-Table -AutoSize

Write-Host "`n=== tupian-de-tu ===" -ForegroundColor Cyan
Get-ChildItem (Join-Path $tempDir 'tupian-de-tu') -Recurse -Depth 2 | Select-Object FullName | ForEach-Object { $_.FullName.Replace($tempDir, '') }

Write-Host "`n=== video-workstation ===" -ForegroundColor Cyan
Get-ChildItem (Join-Path $tempDir 'video-workstation') | Select-Object Name | Format-Table -AutoSize

Write-Host "`n=== Key Files Check ===" -ForegroundColor Yellow
$keyFiles = @(
    'xobixiangqing\backend\app.py',
    'xobixiangqing\backend\requirements.txt',
    'xobixiangqing\backend\run.bat',
    'xobixiangqing\backend\config.py',
    'xobixiangqing\frontend\package.json',
    'xobixiangqing\frontend\start.bat',
    'xobixiangqing\frontend\vite.config.ts',
    'xobixiangqing\.env.example',
    'xobixiangqing\启动云雾版.bat',
    'tupian-de-tu\backend\requirements.txt',
    'tupian-de-tu\backend\run.bat',
    'tupian-de-tu\backend\app\main.py',
    'tupian-de-tu\backend\app\core\replacer.py',
    'tupian-de-tu\backend\app\core\style_batch.py',
    'tupian-de-tu\.env.example',
    'video-workstation\package.json',
    'video-workstation\server\package.json',
    'video-workstation\client\package.json',
    'video-workstation\server\.env.example',
    '安装依赖.bat',
    'Xobi启动器.bat'
)

foreach ($file in $keyFiles) {
    $path = Join-Path $tempDir $file
    if (Test-Path $path) {
        Write-Host "[OK] $file" -ForegroundColor Green
    } else {
        Write-Host "[MISSING] $file" -ForegroundColor Red
    }
}

Write-Host "`n=== Checking for .env files (should NOT exist) ===" -ForegroundColor Yellow
$envFiles = Get-ChildItem $tempDir -Recurse -Filter '.env' -File -ErrorAction SilentlyContinue
if ($envFiles) {
    Write-Host "[WARNING] Found .env files:" -ForegroundColor Red
    $envFiles | ForEach-Object { Write-Host $_.FullName }
} else {
    Write-Host "[OK] No .env files found (good - secrets excluded)" -ForegroundColor Green
}

Write-Host "`n=== Checking for database files (should NOT exist) ===" -ForegroundColor Yellow
$dbFiles = Get-ChildItem $tempDir -Recurse -Filter '*.db' -File -ErrorAction SilentlyContinue
if ($dbFiles) {
    Write-Host "[WARNING] Found .db files:" -ForegroundColor Red
    $dbFiles | ForEach-Object { Write-Host $_.FullName }
} else {
    Write-Host "[OK] No .db files found (good - user data excluded)" -ForegroundColor Green
}

# Cleanup
Remove-Item $tempDir -Recurse -Force
Write-Host "`nCheck complete!" -ForegroundColor Cyan
