@echo off
setlocal
set JAVA_HOME=C:\Program Files\AdoptOpenJDK\jdk-17.0.0.20-hotspot
set ANDROID_HOME=C:\Users\JA Solar\AppData\Local\Android\Sdk
set PATH=%JAVA_HOME%\bin;%PATH%
set _JAVA_OPTIONS=-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7890 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7890

cd /d "C:\Users\JA Solar\WorkBuddy\2026-06-10-18-04-32\EasyWork"

echo [%date% %time%] Building Android APK...
echo ============================================
call src-tauri\gen\android\gradlew.bat --no-daemon -p src-tauri\gen\android app:assembleRelease

if %ERRORLEVEL% EQU 0 (
    echo ===== BUILD SUCCESS =====
    echo APK location: src-tauri\gen\android\app\build\outputs\apk\release\
) else (
    echo ===== BUILD FAILED (ErrorLevel: %ERRORLEVEL%) =====
)

echo [%date% %time%] Putting computer to sleep...
rundll32.exe powrprof.dll,SetSuspendState 0,1,0
