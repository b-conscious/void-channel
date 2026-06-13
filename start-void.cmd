@echo off
REM VOIDtv local dev stack — spine (:3002) then backend (:3001), each in its OWN persistent
REM window so they survive Claude sessions / background-shell reaping. Close a window to
REM stop that service. Expo web (:8081) is usually already running; uncomment to include.
REM If a port is already in use the new window shows EADDRINUSE — close the old one first.

REM stderr -> a logfile so a SILENT CRASH leaves a trace (P8: the spine died mid-session and
REM the reason vanished with the window). Window still shows normal stdout; on crash, read
REM spine-error.log / backend-error.log. Logs are gitignored + baseline-excluded.
start "VOID spine :3002" cmd /k "cd /d %~dp0spine && set SPINE_ADMIN_KEY=void-spine-dev&& node spine.js 2>%~dp0spine-error.log"
timeout /t 3 /nobreak >nul
start "VOID backend :3001" cmd /k "cd /d %~dp0backend && node server.js 2>%~dp0backend-error.log"

REM start "VOID web :8081" cmd /k "cd /d %~dp0mobile && npx expo start --web"
