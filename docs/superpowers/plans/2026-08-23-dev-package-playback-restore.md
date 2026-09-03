# 璃音 Lucent 開發版點歌與自動更新恢復 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 讓非商用安裝版恢復網易雲搜尋、軟體內播放、專輯封面與歌手頭像，並只發行可自動更新的 Setup 安裝版。

**Architecture:** 使用 `package.json` 的明確非商用開發開關決定是否把既有 NetEase Provider 納入封裝。既有 `UpdateService` 保留自動檢查、背景下載與安全時自動安裝；只藉由發行新版本讓已安裝版本取得更新。

**Tech Stack:** Electron 43、electron-builder、electron-updater、Node test。

## Global Constraints

- 不產生 Portable 版本。
- 不新增遊戲相關功能。
- 網易雲資料與軟體內點歌只用於目前明確標示的非商用開發版。
- 不在播放或主持房間時強制重啟安裝更新。

### Task 1: 恢復非商用封裝的 Provider

**Files:**
- Modify: `package.json`
- Modify: `electron/main.cjs`
- Modify: `electron/musicProvider.cjs`
- Modify: `electron-builder.config.factory.cjs`
- Modify: `shared/playerPolicy.cjs`
- Modify: `tests/musicProvider.test.cjs`
- Modify: `tests/playerPolicy.test.cjs`

- [ ] 先改寫兩個既有測試，要求 packaged + allowUnofficial 時載入 Provider 並可啟用內建播放；要求 builder 不再排除 `electron/netease.cjs`。
- [ ] 執行 `node --test tests/musicProvider.test.cjs tests/playerPolicy.test.cjs`，確認測試因舊政策失敗。
- [ ] 在 `package.json` 加入明確 `lucent.nonCommercialDevelopment: true`；主程序把此旗標轉為既有 `allowUnofficial`；Provider 與播放政策尊重該旗標；builder 保留 Provider 檔案。
- [ ] 重跑兩個測試，確認通過。

### Task 2: 產生可自動更新的新安裝版

**Files:**
- Modify: `package.json`
- Modify: `release/latest.yml` (build 產物)

- [ ] 將版本升為 `1.0.1`，以新版本讓 `1.0.0` 安裝版可被更新器偵測。
- [ ] 執行完整 `npm.cmd test`、`npm.cmd run build`、`npm.cmd run release:check`。
- [ ] 僅在三項驗證成功後，建立 NSIS Setup 安裝包與 blockmap；檢查產物不含 Portable。
- [ ] 建立 GitHub `v1.0.1` Release，上傳 Setup、blockmap、latest.yml，並比對 `latest.yml` 的 SHA512、大小與安裝包一致。
