# 璃音 Lucent 自動更新 Implementation Plan

**Goal:** 提供可簽署 NSIS 安裝版使用的更新檢查、下載、延後安裝與穩定／測試頻道；Portable 僅提示手動下載。

**Architecture:** 主程序 `UpdateService` 包裝 `electron-updater`。Renderer 只讀取公開進度並送出檢查／下載／安裝命令。更新來源由部署環境 `LUCENT_UPDATE_URL` 注入；未設定、開發模式或 Portable 時安全停用自動安裝。

## Constraints

- 更新器只在正式封裝的 NSIS 安裝版啟用。
- 播放中或主持房間時不呼叫 `quitAndInstall`，只標記等待使用者稍後確認。
- 不使用未簽署測試包作為穩定更新，不硬編碼假更新網址。
- 更新失敗不刪除現有版本，也不影響 Overlay 啟動。
- 穩定版與測試版頻道可切換並保存；啟動延遲檢查、每四小時再檢查。
- 本階段不宣稱已完成更新伺服器、簽章憑證或兩版本實際升級。

## Tasks

1. 建立更新能力／延後安裝純策略測試。
2. 建立可注入 `autoUpdater` 的 UpdateService 與事件測試。
3. 接入主程序 IPC、設定保存與繁中「更新」分頁。
4. 將 Windows target 擴充為 NSIS + Portable，保留 runtime feed URL 注入。
5. 執行完整測試、Build 與未配置環境的安全 runtime smoke。
