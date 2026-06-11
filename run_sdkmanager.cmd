@echo off
:: Android SDK Manager wrapper - uses ANDROID_HOME or %LOCALAPPDATA%
if "%JAVA_HOME%"=="" set JAVA_HOME=C:\Program Files\AdoptOpenJDK\jdk-17.0.0.20-hotspot
if "%ANDROID_HOME%"=="" set ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
set ANDROID_SDK_ROOT=%ANDROID_HOME%
set _JAVA_OPTIONS=-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7890 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7890
"%ANDROID_HOME%\cmdline-tools\latest\cmdline-tools\bin\sdkmanager.bat" --sdk_root="%ANDROID_HOME%" %*
