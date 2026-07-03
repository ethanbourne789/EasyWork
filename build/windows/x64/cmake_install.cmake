# Install script for directory: E:/Dev/EasyWork070101/windows

# Set the install prefix
if(NOT DEFINED CMAKE_INSTALL_PREFIX)
  set(CMAKE_INSTALL_PREFIX "$<TARGET_FILE_DIR:easy_work>")
endif()
string(REGEX REPLACE "/$" "" CMAKE_INSTALL_PREFIX "${CMAKE_INSTALL_PREFIX}")

# Set the install configuration name.
if(NOT DEFINED CMAKE_INSTALL_CONFIG_NAME)
  if(BUILD_TYPE)
    string(REGEX REPLACE "^[^A-Za-z0-9_]+" ""
           CMAKE_INSTALL_CONFIG_NAME "${BUILD_TYPE}")
  else()
    set(CMAKE_INSTALL_CONFIG_NAME "Release")
  endif()
  message(STATUS "Install configuration: \"${CMAKE_INSTALL_CONFIG_NAME}\"")
endif()

# Set the component getting installed.
if(NOT CMAKE_INSTALL_COMPONENT)
  if(COMPONENT)
    message(STATUS "Install component: \"${COMPONENT}\"")
    set(CMAKE_INSTALL_COMPONENT "${COMPONENT}")
  else()
    set(CMAKE_INSTALL_COMPONENT)
  endif()
endif()

# Is this installation the result of a crosscompile?
if(NOT DEFINED CMAKE_CROSSCOMPILING)
  set(CMAKE_CROSSCOMPILING "FALSE")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  # Include the install script for the subdirectory.
  include("E:/Dev/EasyWork070101/build/windows/x64/flutter/cmake_install.cmake")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  # Include the install script for the subdirectory.
  include("E:/Dev/EasyWork070101/build/windows/x64/runner/cmake_install.cmake")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  # Include the install script for the subdirectory.
  include("E:/Dev/EasyWork070101/build/windows/x64/plugins/connectivity_plus/cmake_install.cmake")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  # Include the install script for the subdirectory.
  include("E:/Dev/EasyWork070101/build/windows/x64/plugins/file_selector_windows/cmake_install.cmake")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  # Include the install script for the subdirectory.
  include("E:/Dev/EasyWork070101/build/windows/x64/plugins/flutter_secure_storage_windows/cmake_install.cmake")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  # Include the install script for the subdirectory.
  include("E:/Dev/EasyWork070101/build/windows/x64/plugins/permission_handler_windows/cmake_install.cmake")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  # Include the install script for the subdirectory.
  include("E:/Dev/EasyWork070101/build/windows/x64/plugins/screen_retriever_windows/cmake_install.cmake")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  # Include the install script for the subdirectory.
  include("E:/Dev/EasyWork070101/build/windows/x64/plugins/sqlite3_flutter_libs/cmake_install.cmake")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  # Include the install script for the subdirectory.
  include("E:/Dev/EasyWork070101/build/windows/x64/plugins/system_tray/cmake_install.cmake")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  # Include the install script for the subdirectory.
  include("E:/Dev/EasyWork070101/build/windows/x64/plugins/url_launcher_windows/cmake_install.cmake")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  # Include the install script for the subdirectory.
  include("E:/Dev/EasyWork070101/build/windows/x64/plugins/window_manager/cmake_install.cmake")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  # Include the install script for the subdirectory.
  include("E:/Dev/EasyWork070101/build/windows/x64/plugins/jni/cmake_install.cmake")
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Runtime" OR NOT CMAKE_INSTALL_COMPONENT)
  if(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Dd][Ee][Bb][Uu][Gg])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/easy_work.exe")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Debug" TYPE EXECUTABLE FILES "E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/easy_work.exe")
  elseif(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Pp][Rr][Oo][Ff][Ii][Ll][Ee])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/easy_work.exe")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Profile" TYPE EXECUTABLE FILES "E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/easy_work.exe")
  elseif(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Rr][Ee][Ll][Ee][Aa][Ss][Ee])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Release/easy_work.exe")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Release" TYPE EXECUTABLE FILES "E:/Dev/EasyWork070101/build/windows/x64/runner/Release/easy_work.exe")
  endif()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Runtime" OR NOT CMAKE_INSTALL_COMPONENT)
  if(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Dd][Ee][Bb][Uu][Gg])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/data/icudtl.dat")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/data" TYPE FILE FILES "E:/Dev/EasyWork070101/windows/flutter/ephemeral/icudtl.dat")
  elseif(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Pp][Rr][Oo][Ff][Ii][Ll][Ee])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/data/icudtl.dat")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/data" TYPE FILE FILES "E:/Dev/EasyWork070101/windows/flutter/ephemeral/icudtl.dat")
  elseif(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Rr][Ee][Ll][Ee][Aa][Ss][Ee])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Release/data/icudtl.dat")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Release/data" TYPE FILE FILES "E:/Dev/EasyWork070101/windows/flutter/ephemeral/icudtl.dat")
  endif()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Runtime" OR NOT CMAKE_INSTALL_COMPONENT)
  if(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Dd][Ee][Bb][Uu][Gg])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/flutter_windows.dll")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Debug" TYPE FILE FILES "E:/Dev/EasyWork070101/windows/flutter/ephemeral/flutter_windows.dll")
  elseif(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Pp][Rr][Oo][Ff][Ii][Ll][Ee])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/flutter_windows.dll")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Profile" TYPE FILE FILES "E:/Dev/EasyWork070101/windows/flutter/ephemeral/flutter_windows.dll")
  elseif(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Rr][Ee][Ll][Ee][Aa][Ss][Ee])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Release/flutter_windows.dll")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Release" TYPE FILE FILES "E:/Dev/EasyWork070101/windows/flutter/ephemeral/flutter_windows.dll")
  endif()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Runtime" OR NOT CMAKE_INSTALL_COMPONENT)
  if(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Dd][Ee][Bb][Uu][Gg])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/connectivity_plus_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/file_selector_windows_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/flutter_secure_storage_windows_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/permission_handler_windows_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/screen_retriever_windows_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/sqlite3_flutter_libs_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/sqlite3.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/system_tray_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/url_launcher_windows_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/window_manager_plugin.dll")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Debug" TYPE FILE FILES
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/connectivity_plus/Debug/connectivity_plus_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/file_selector_windows/Debug/file_selector_windows_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/flutter_secure_storage_windows/Debug/flutter_secure_storage_windows_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/permission_handler_windows/Debug/permission_handler_windows_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/screen_retriever_windows/Debug/screen_retriever_windows_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/sqlite3_flutter_libs/Debug/sqlite3_flutter_libs_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/sqlite3_flutter_libs/Debug/sqlite3.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/system_tray/Debug/system_tray_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/url_launcher_windows/Debug/url_launcher_windows_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/window_manager/Debug/window_manager_plugin.dll"
      )
  elseif(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Pp][Rr][Oo][Ff][Ii][Ll][Ee])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/connectivity_plus_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/file_selector_windows_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/flutter_secure_storage_windows_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/permission_handler_windows_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/screen_retriever_windows_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/sqlite3_flutter_libs_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/sqlite3.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/system_tray_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/url_launcher_windows_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/window_manager_plugin.dll")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Profile" TYPE FILE FILES
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/connectivity_plus/Profile/connectivity_plus_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/file_selector_windows/Profile/file_selector_windows_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/flutter_secure_storage_windows/Profile/flutter_secure_storage_windows_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/permission_handler_windows/Profile/permission_handler_windows_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/screen_retriever_windows/Profile/screen_retriever_windows_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/sqlite3_flutter_libs/Profile/sqlite3_flutter_libs_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/sqlite3_flutter_libs/Profile/sqlite3.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/system_tray/Profile/system_tray_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/url_launcher_windows/Profile/url_launcher_windows_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/window_manager/Profile/window_manager_plugin.dll"
      )
  elseif(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Rr][Ee][Ll][Ee][Aa][Ss][Ee])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Release/connectivity_plus_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Release/file_selector_windows_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Release/flutter_secure_storage_windows_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Release/permission_handler_windows_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Release/screen_retriever_windows_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Release/sqlite3_flutter_libs_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Release/sqlite3.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Release/system_tray_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Release/url_launcher_windows_plugin.dll;E:/Dev/EasyWork070101/build/windows/x64/runner/Release/window_manager_plugin.dll")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Release" TYPE FILE FILES
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/connectivity_plus/Release/connectivity_plus_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/file_selector_windows/Release/file_selector_windows_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/flutter_secure_storage_windows/Release/flutter_secure_storage_windows_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/permission_handler_windows/Release/permission_handler_windows_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/screen_retriever_windows/Release/screen_retriever_windows_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/sqlite3_flutter_libs/Release/sqlite3_flutter_libs_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/sqlite3_flutter_libs/Release/sqlite3.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/system_tray/Release/system_tray_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/url_launcher_windows/Release/url_launcher_windows_plugin.dll"
      "E:/Dev/EasyWork070101/build/windows/x64/plugins/window_manager/Release/window_manager_plugin.dll"
      )
  endif()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Runtime" OR NOT CMAKE_INSTALL_COMPONENT)
  if(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Dd][Ee][Bb][Uu][Gg])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Debug" TYPE DIRECTORY FILES "E:/Dev/EasyWork070101/build/native_assets/windows/")
  elseif(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Pp][Rr][Oo][Ff][Ii][Ll][Ee])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Profile" TYPE DIRECTORY FILES "E:/Dev/EasyWork070101/build/native_assets/windows/")
  elseif(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Rr][Ee][Ll][Ee][Aa][Ss][Ee])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Release/")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Release" TYPE DIRECTORY FILES "E:/Dev/EasyWork070101/build/native_assets/windows/")
  endif()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Runtime" OR NOT CMAKE_INSTALL_COMPONENT)
  if(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Dd][Ee][Bb][Uu][Gg])$")
    
  file(REMOVE_RECURSE "E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/data/flutter_assets")
  
  elseif(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Pp][Rr][Oo][Ff][Ii][Ll][Ee])$")
    
  file(REMOVE_RECURSE "E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/data/flutter_assets")
  
  elseif(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Rr][Ee][Ll][Ee][Aa][Ss][Ee])$")
    
  file(REMOVE_RECURSE "E:/Dev/EasyWork070101/build/windows/x64/runner/Release/data/flutter_assets")
  
  endif()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Runtime" OR NOT CMAKE_INSTALL_COMPONENT)
  if(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Dd][Ee][Bb][Uu][Gg])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/data/flutter_assets")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Debug/data" TYPE DIRECTORY FILES "E:/Dev/EasyWork070101/build//flutter_assets")
  elseif(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Pp][Rr][Oo][Ff][Ii][Ll][Ee])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/data/flutter_assets")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/data" TYPE DIRECTORY FILES "E:/Dev/EasyWork070101/build//flutter_assets")
  elseif(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Rr][Ee][Ll][Ee][Aa][Ss][Ee])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Release/data/flutter_assets")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Release/data" TYPE DIRECTORY FILES "E:/Dev/EasyWork070101/build//flutter_assets")
  endif()
endif()

if(CMAKE_INSTALL_COMPONENT STREQUAL "Runtime" OR NOT CMAKE_INSTALL_COMPONENT)
  if(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Pp][Rr][Oo][Ff][Ii][Ll][Ee])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/data/app.so")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Profile/data" TYPE FILE FILES "E:/Dev/EasyWork070101/build/windows/app.so")
  elseif(CMAKE_INSTALL_CONFIG_NAME MATCHES "^([Rr][Ee][Ll][Ee][Aa][Ss][Ee])$")
    list(APPEND CMAKE_ABSOLUTE_DESTINATION_FILES
     "E:/Dev/EasyWork070101/build/windows/x64/runner/Release/data/app.so")
    if(CMAKE_WARN_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(WARNING "ABSOLUTE path INSTALL DESTINATION : ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    if(CMAKE_ERROR_ON_ABSOLUTE_INSTALL_DESTINATION)
      message(FATAL_ERROR "ABSOLUTE path INSTALL DESTINATION forbidden (by caller): ${CMAKE_ABSOLUTE_DESTINATION_FILES}")
    endif()
    file(INSTALL DESTINATION "E:/Dev/EasyWork070101/build/windows/x64/runner/Release/data" TYPE FILE FILES "E:/Dev/EasyWork070101/build/windows/app.so")
  endif()
endif()

string(REPLACE ";" "\n" CMAKE_INSTALL_MANIFEST_CONTENT
       "${CMAKE_INSTALL_MANIFEST_FILES}")
if(CMAKE_INSTALL_LOCAL_ONLY)
  file(WRITE "E:/Dev/EasyWork070101/build/windows/x64/install_local_manifest.txt"
     "${CMAKE_INSTALL_MANIFEST_CONTENT}")
endif()
if(CMAKE_INSTALL_COMPONENT)
  if(CMAKE_INSTALL_COMPONENT MATCHES "^[a-zA-Z0-9_.+-]+$")
    set(CMAKE_INSTALL_MANIFEST "install_manifest_${CMAKE_INSTALL_COMPONENT}.txt")
  else()
    string(MD5 CMAKE_INST_COMP_HASH "${CMAKE_INSTALL_COMPONENT}")
    set(CMAKE_INSTALL_MANIFEST "install_manifest_${CMAKE_INST_COMP_HASH}.txt")
    unset(CMAKE_INST_COMP_HASH)
  endif()
else()
  set(CMAKE_INSTALL_MANIFEST "install_manifest.txt")
endif()

if(NOT CMAKE_INSTALL_LOCAL_ONLY)
  file(WRITE "E:/Dev/EasyWork070101/build/windows/x64/${CMAKE_INSTALL_MANIFEST}"
     "${CMAKE_INSTALL_MANIFEST_CONTENT}")
endif()
