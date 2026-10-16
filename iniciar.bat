@echo off
title Botonera Virtual Multi-Dispositivo
cd /d "%~dp0"

echo ========================================================
echo   Iniciando Botonera Virtual para PC y Telefonos...
echo ========================================================
echo.

REM Iniciar el servidor con Node
start "" http://localhost:3000/pc
node server.js

pause
