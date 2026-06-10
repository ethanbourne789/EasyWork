@echo off
setlocal enabledelayedexpansion

set JAVA_HOME=C:\Program Files\AdoptOpenJDK\jdk-17.0.0.20-hotspot
set ANDROID_HOME=C:\Users\JA Solar\AppData\Local\Android\Sdk
set PATH=%JAVA_HOME%\bin;%PATH%
set _JAVA_OPTIONS=-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7890 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7890

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
