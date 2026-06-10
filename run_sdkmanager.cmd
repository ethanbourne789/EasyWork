@echo off
set JAVA_HOME=C:\Program Files\AdoptOpenJDK\jdk-17.0.0.20-hotspot
set ANDROID_SDK_ROOT=C:\Users\JA Solar\AppData\Local\Android\Sdk
set _JAVA_OPTIONS=-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=7890 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=7890
"%ANDROID_SDK_ROOT%\cmdline-tools\latest\cmdline-tools\bin\sdkmanager.bat" --sdk_root="%ANDROID_SDK_ROOT%" %*
