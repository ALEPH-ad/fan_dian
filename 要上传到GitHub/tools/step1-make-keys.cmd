@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set "OUT=%~dp0key.txt"
if exist "%OUT%" del /f /q "%OUT%" >nul 2>&1
set "FD_REPO=%REPO%"

echo.
echo ===============================================
echo   Iron Line FanDian - Step 1: make push keys
echo ===============================================
echo.
echo Step 1. Open your GitHub repository page, copy its address.
echo         Example: https://github.com/zhangsan/fan-dian
echo.
echo Step 2. Paste it below and press Enter.
echo         (If you cannot paste: right-click the window)
echo.

set "REPO="
set /p REPO=Repository address:

set "FD_REPO=%REPO%"

set "NODE=%~dp0..\tools\node.exe"
if not exist "%NODE%" set "NODE=%~dp0tools\node.exe"
if not exist "%NODE%" set "NODE=node"

"%NODE%" "%~dp0..\tools\setup-keys-plain.mjs"

if not exist "%OUT%" goto FAIL

echo.
echo OK! The text file "key.txt" will open in Notepad now.
echo Copy the two long strings from it. You will paste them in step 3.
echo.
start "" notepad.exe "%OUT%"
goto END

:FAIL
echo.
echo SOMETHING WENT WRONG.
echo Please take a photo of this window and send it to the person who helped you.

:END
echo.
echo Press any key to close this window.
pause >nul
