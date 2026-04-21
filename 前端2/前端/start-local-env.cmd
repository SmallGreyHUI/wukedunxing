@echo off
set "PROJECT_ROOT=%~dp0"
if "%PROJECT_ROOT:~-1%"=="\" set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"

set "TEMP=%PROJECT_ROOT%\.tmp"
set "TMP=%PROJECT_ROOT%\.tmp"
set "npm_config_cache=%PROJECT_ROOT%\.npm-cache"

if not exist "%TEMP%" mkdir "%TEMP%"
if not exist "%npm_config_cache%" mkdir "%npm_config_cache%"

echo TEMP=%TEMP%
echo TMP=%TMP%
echo npm_config_cache=%npm_config_cache%
echo.
echo Examples:
echo   npm install
echo   npm run dev
echo   npm run build
echo.
echo This window now uses project-local temp and npm cache directories.
cmd /k
