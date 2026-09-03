# 璃音 Lucent GitHub 測試更新站設計

## 目標

以公開 GitHub Releases 倉庫 `Rex11929282/lucent-updates` 作為非商用 Windows 測試版的 HTTPS 更新來源；已安裝的 NSIS 版本可背景下載更新，並只在未播放、未主持房間時自動重新啟動安裝。

## 範圍與邊界

- 此階段是測試發佈，不要求官方音樂 Provider 確認或 Windows 簽章憑證。
- 未簽章 EXE 僅供測試；Windows 可能顯示信任警告，不能宣稱為正式商用發行。
- 更新倉庫只存放 GitHub Release 產物：NSIS 安裝程式、`.blockmap` 與 `latest.yml`；不推送原始碼。
- 不把 GitHub Token、帳號密碼或任何憑證放入專案、設定檔或 EXE。
- 不改動播放器、歌詞、房間或更新下載／安全安裝的既有行為。

## 發佈架構

`electron-builder` 在封裝時讀取 `LUCENT_UPDATE_REPOSITORY=owner/repo` 與發布頻道，將公開 GitHub provider 寫入安裝版的 `app-update.yml`。程式啟動後的 `electron-updater` 直接向 GitHub Releases 查詢更新；下載完成後沿用既有的播放／房間安全檢查再呼叫安裝。

本機封裝一律使用 `--publish never`，避免建置時意外上傳。驗證過的 `latest.yml`、NSIS `Setup.exe` 與同名 `.blockmap` 再由 GitHub 網頁手動上傳至對應的公開 Release。第一個 `1.0.0` Release 是安裝起點；只有之後版本號較高的 Release 才會觸發已安裝程式的更新。

## 失敗處理與驗證

封裝前檢只接受格式正確的公開 `owner/repo` 與 `stable`／`beta` 頻道；錯誤訊息不可含 Token 或簽章路徑。建立後檢查 release 目錄含 NSIS、portable、`latest.yml` 與 `.blockmap`，並確認安裝版含 `app-update.yml`。GitHub Release 上傳後檢查資產齊全及標籤版本一致。

