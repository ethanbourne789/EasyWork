@echo off
"%ANDROID_NDK_HOME%\toolchains\llvm\prebuilt\windows-x86_64\bin\clang.exe" --target=aarch64-linux-android24 %* -Wl,-z,max-page-size=16384 -Wl,-z,common-page-size=16384
