@echo off
chcp 65001 >nul
cd /d "%~dp0"
title HaKometz
where node >nul 2>nul || (echo Node.js is not installed. Download LTS from https://nodejs.org and run again. & pause & exit /b 1)
where cloudflared >nul 2>nul || (echo Installing the official Cloudflare tool [cloudflared] with winget... & winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements)
where cloudflared >nul 2>nul || (echo. & echo cloudflared was installed. Close this window and double-click start.bat again. & pause & exit /b 0)
if not exist node_modules (echo Installing for the first time... & call npm install --omit=dev)
echo Starting the game server...
start "HaKometz server" cmd /k node server\index.js
timeout /t 3 >nul
echo.
echo Opening a public HTTPS link (Cloudflare)...
echo Look below for a line with https://....trycloudflare.com  - send that link to your friends!
echo Keep this window open. Close it to stop the public link.
echo.
cloudflared tunnel --no-autoupdate --url http://localhost:3000
pause
