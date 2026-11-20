@echo off
setlocal
echo ========================================================================
echo       BUILD SCRIPT BINA EXCEL (BINER RELEASE + INSTALLER MSI)
echo ========================================================================
echo.

cd /d "%~dp0"

echo [1/4] Mengompilasi Biner Release (Rust)...
set "GRIDCRAFT_REQUIRE_WINRES=1"
cargo build --release -p gridcraft -p gridcraft-cli
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Kompilasi Rust gagal!
    exit /b %ERRORLEVEL%
)

echo [2/4] Menyiapkan Staging Directory...
if not exist "target\staging" mkdir "target\staging"
copy /y "target\release\gridcraft.exe" "target\staging\gridcraft.exe" >nul
copy /y "target\release\gridcraft-cli.exe" "target\staging\gridcraft-cli.exe" >nul

echo [3/4] Membangun Installer MSI (WiX Toolset)...
"C:\Program Files\WiX Toolset v7.0\bin\wix.exe" build packaging\windows\gridcraft.wxs -arch x64 -d Version=0.19.1 -d BinDir=target\staging -d IconPath=assets\app-icon\gridcraft.ico -ext WixToolset.UI.wixext -ext WixToolset.Util.wixext -out target\BinaExcel-Setup.msi
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Pembuatan MSI gagal!
    exit /b %ERRORLEVEL%
)

echo [4/4] Memperbarui Folder binaexcel26 dan ZIP...
copy /y "target\BinaExcel-Setup.msi" "binaexcel26\BinaExcel-Setup.msi" >nul
copy /y "target\release\gridcraft.exe" "binaexcel26\portable\bina-excel.exe" >nul
copy /y "target\release\gridcraft-cli.exe" "binaexcel26\portable\bina-excel-cli.exe" >nul

powershell -NoProfile -Command "Remove-Item -Force binaexcel26.zip -ErrorAction SilentlyContinue; Compress-Archive -Path 'binaexcel26' -DestinationPath 'binaexcel26.zip' -CompressionLevel Optimal -Force"

echo.
echo ========================================================================
echo    SUKSES! Paket binaexcel26.zip telah berhasil dibuat ulang.
echo ========================================================================
pause
