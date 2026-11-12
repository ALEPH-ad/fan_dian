@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo ==========================================
echo   Open the folder that is ready for GitHub
echo ==========================================
echo.
echo This folder contains exactly 16 small files:
echo    docs\                  (the web page)
echo    tools\                 (the push script)
echo    .github\workflows\     (the daily auto reminder)
echo.
echo Drag the THREE items above (docs, tools, .github)
echo onto the GitHub upload page, then click Commit changes.
echo.
start "" explorer.exe "%~dp0"
echo Folder opened. Press any key to close this window.
pause >nul
