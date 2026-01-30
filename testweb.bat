@echo off
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I "node.exe" >NUL
if %ERRORLEVEL%==0 (
    echo Killing existing node.exe processes...
    taskkill /F /IM node.exe >NUL 2>&1
    timeout /t 2 /nobreak >NUL
)
cd /d D:\devl\lib5
start "imageflow" cmd /c npm run dev:imageflow
start "pdfedit" cmd /c npm run dev:pdfedit
