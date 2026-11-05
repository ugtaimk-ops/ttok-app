@echo off
cd /d "%~dp0.."
set "PORT=3001"
set "HOST=127.0.0.1"
set "NODE_ENV=production"
start "" "http://127.0.0.1:3001/server-design"
echo.
echo Ttok server design is running. Keep this window open.
echo If the browser loaded before the server, refresh the page.
echo.
node build\server.cjs
pause
