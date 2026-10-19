; Simple per-user "close the running app" step instead of electron-builder's GetProcessInfo/System-plugin
; check, which intermittently crashed silent installs (0xC0000005) on Windows Server 2025 runners.
!macro customCheckAppRunning
  nsExec::Exec '"$SYSDIR\cmd.exe" /c taskkill /f /im "${APP_EXECUTABLE_FILENAME}" /fi "USERNAME eq %USERNAME%"'
  Pop $0
  Sleep 500
!macroend
