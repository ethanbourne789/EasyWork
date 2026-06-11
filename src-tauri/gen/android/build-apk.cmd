@echo off
setlocal enabledelayedexpansion

:: Android APK build script - uses ANDROID_HOME env var or defaults
if "%JAVA_HOME%"=="" set JAVA_HOME=C:\Program Files\AdoptOpenJDK\jdk-17.0.0.20-hotspot
if "%ANDROID_HOME%"=="" set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk

set PATH=%JAVA_HOME%\bin;%PATH%
set _JAVA_OPTIONS=-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7890 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7890

:: Change to the Android project directory (script is in gen\android\)
cd /d "%~dp0"

echo ===== Building Android APK =====
echo JAVA_HOME=%JAVA_HOME%
echo ANDROID_HOME=%ANDROID_HOME%

call .\gradlew.bat --no-daemon app:assembleRelease

if %ERRORLEVEL% EQU 0 (
    echo ===== BUILD SUCCESSFUL =====
    dir /s /b app\build\outputs\apk\release\*.apk 2>nul
) else (
    echo ===== BUILD FAILED (ErrorLevel: %ERRORLEVEL%) =====
)

endlocal
pause
