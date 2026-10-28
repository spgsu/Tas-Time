@echo off
rem Opens Tas-Time.html (kept beside this file) in a dedicated Microsoft Edge app window.
rem No install, server, policy or profile change. "--check" prints what would run.
setlocal DisableDelayedExpansion
set "APP_FILE=%~dp0Tas-Time.html"
set "EDGE_EXE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE_EXE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE_EXE if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" set "EDGE_EXE=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
rem Edge set to clear browsing data on exit erases the recovery copy and file link; use Chrome then, if installed.
set "EDGE_CLEARS="
reg query "HKLM\Software\Policies\Microsoft\Edge" /v ClearBrowsingDataOnExit 2>nul | "%SystemRoot%\System32\find.exe" "0x1" >nul && set "EDGE_CLEARS=1"
reg query "HKCU\Software\Policies\Microsoft\Edge" /v ClearBrowsingDataOnExit 2>nul | "%SystemRoot%\System32\find.exe" "0x1" >nul && set "EDGE_CLEARS=1"
set "CHROME_EXE="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME_EXE if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME_EXE=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if defined EDGE_CLEARS if defined CHROME_EXE set "EDGE_EXE=%CHROME_EXE%"
setlocal EnableDelayedExpansion
set "APP_URL=!APP_FILE:\=/!"
set "APP_URL=!APP_URL:%%=%%25!"
set "APP_URL=!APP_URL:#=%%23!"
set "APP_URL=!APP_URL: =%%20!"
if /I "%~1"=="--check" goto check
if not defined EDGE_EXE goto notfound
if not exist "!APP_FILE!" goto noapp
start "" "!EDGE_EXE!" --app="file:///!APP_URL!" --new-window
exit /b 0
:check
if not defined EDGE_EXE echo Microsoft Edge was not found in standard locations.
if defined EDGE_CLEARS echo Edge clears browsing data on exit; Tas-Time cannot resume there.
if defined EDGE_EXE echo Browser: "!EDGE_EXE!"
echo App: file:///!APP_URL!
exit /b 0
:notfound
echo Microsoft Edge was not found. Open Tas-Time.html in an approved browser.
pause
exit /b 1
:noapp
echo Tas-Time.html is missing. Keep the launcher beside the HTML file.
pause
exit /b 1
