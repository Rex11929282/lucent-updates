; Electron 的 DLL、resources 與 locales 必須留在 Lucent.exe 同層，否則程式無法啟動。
; 安裝完成後僅把它們設為「隱藏」：檔案總管預設只會顯示 Lucent.exe，程式與自動更新仍可正常讀取。
!macro customInstall
  ExecWait '"$SYSDIR\attrib.exe" +H "$INSTDIR\*" /S /D'
  SetFileAttributes "$INSTDIR\Lucent.exe" NORMAL
!macroend
