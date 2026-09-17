@echo off
setlocal enabledelayedexpansion
title PUNCH FACE - phone server
echo ==============================================
echo  PUNCH FACE - open on your phone
echo  (PC and phone must be on the same Wi-Fi)
echo ==============================================
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
  set IP=%%a
  set IP=!IP: =!
  echo  Phone browser:  http://!IP!:8080
)
echo.
echo  (if several addresses are shown, use the one starting with 192.168)
echo  Close this window to stop the server.
echo.
cd /d "%~dp0"
python -m http.server 8080
pause
