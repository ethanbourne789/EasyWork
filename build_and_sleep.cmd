@echo off
setlocal

:: Android build script - edit paths to match your system
:: Requires: Java 17+, Android SDK + NDK

if "%JAVA_HOME%"=="" set JAVA_HOME=C:\Program Files\AdoptOpenJDK\jdk-17.0.0.20-hotspot
if "%ANDROID_HOME%"=="" set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk

set PATH=%JAVA_HOME%\bin;%PATH%
set _JAVA_OPTIONS=-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7890 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7890

:: Change to project root (this script is in the project root)
cd /d "%~dp0"

echo [%date% %time%] Building Android APK...
echo JAVA_HOME=%JAVA_HOME%
echo ANDROID_HOME=%ANDROID_HOME%
echo ============================================
call src-tauri\gen\android\gradlew.bat --no-daemon -p src-tauri\gen\android app:assembleRelease

if %ERRORLEVEL% EQU 0 (
    echo ===== BUILD SUCCESS =====
    echo APK location: src-tauri\gen\android\app\build\outputs\apk\release\
) else (
    echo ===== BUILD FAILED (ErrorLevel: %ERRORLEVEL%) =====
)

echo [%date% %time%] Done.
