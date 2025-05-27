@echo off
echo Starting City Wave Multiplayer Server...
echo.
cd /d "%~dp0"
echo Current directory: %CD%
echo.
echo Installing dependencies...
call npm install
echo.
echo Starting server...
echo Server will be available at: ws://localhost:8080
echo Press Ctrl+C to stop the server
echo.
call npm start
