@echo off
cd /d "%~dp0"
set PORT=8001
echo Starting Cozy Cottage at http://localhost:%PORT%
echo Port 8001 is used so your previous localhost:8000 version can remain open.
start "Cozy Cottage Server" /min cmd /c "py -m http.server %PORT%"
timeout /t 2 /nobreak >nul
start "" http://localhost:%PORT%
pause
