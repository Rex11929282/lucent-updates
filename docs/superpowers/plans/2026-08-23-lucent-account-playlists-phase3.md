# 璃音 Lucent 帳號安全與歌單 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把網易雲登入憑證改為 Windows 加密保存，加入唯讀網易雲歌單與不回寫雲端的璃音本機歌單。

**Architecture:** 主程序以獨立 CredentialStore 包裝 Electron safeStorage，啟動時一次性遷移舊明文 Cookie。LocalPlaylistStore 使用 Node 內建 SQLite 並維護獨立 migration；Renderer 只經過 IPC 讀寫歌單，不接觸 Cookie 或資料庫路徑。

**Tech Stack:** Electron 43、safeStorage、Node `node:sqlite`、React 19、IPC、Node test。

## Global Constraints

- 不把 Cookie、播放 URL 或資料庫路徑傳給 Renderer、房間或日誌。
- 網易雲歌單唯讀；璃音本機歌單不回寫網易雲。
- 移除固定 REAL_IP，不繞過 VIP、DRM 或區域限制。
- 舊明文 Cookie 只有在成功加密寫入後才刪除。
- 不新增房間點歌權限、自動更新或遊戲功能；不封裝 EXE。
- 工作區沒有 Git，不初始化 Git；每項以測試和 runtime smoke 驗證。

---

### Task 1: safeStorage 憑證庫與明文遷移

**Files:**
- Create: `electron/credentialStore.cjs`
- Create: `tests/credentialStore.test.cjs`
- Modify: `electron/main.cjs`

**Interfaces:**
- `createCredentialStore({ safeStorage, fs, encryptedPath, legacyPath })`
- `load()` 回傳解密 Cookie 或空字串。
- `save(cookie)` 加密後原子寫入；空值刪除加密與舊檔。

- [ ] 先寫測試，證明明文遷移、加密讀回、不可加密時不刪舊檔、登出清除。
- [ ] 執行 `node --test tests/credentialStore.test.cjs`，確認缺少模組而失敗。
- [ ] 實作 store 並接入 main；Renderer 回應不可含 Cookie。
- [ ] 執行 targeted tests，確認全部通過。

### Task 2: 本機 SQLite 歌單

**Files:**
- Create: `electron/localPlaylistStore.cjs`
- Create: `tests/localPlaylistStore.test.cjs`
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `src/overlayBridge.js`

**Interfaces:**
- `createPlaylist(name)`、`renamePlaylist(id,name)`、`deletePlaylist(id)`。
- `listPlaylists()`、`listItems(playlistId)`。
- `addItem(playlistId,{provider,trackId,name,artist,cover,durationMs})`、`removeItem(id)`、`moveItem(id,position)`。

- [ ] 先寫 migration、CRUD、排序、級聯刪除與重複歌曲測試。
- [ ] 執行測試確認失敗。
- [ ] 實作 schema version 1 與 transaction-based reorder。
- [ ] 接入 IPC，所有輸入由主程序驗證。
- [ ] 執行 targeted tests。

### Task 3: 網易雲唯讀歌單與繁中 UI

**Files:**
- Modify: `electron/netease.cjs`
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `src/overlayBridge.js`
- Modify: `src/ConsoleWindow.jsx`
- Modify: `src/styles.css`
- Create: `tests/playlistWiring.test.mjs`

**Interfaces:**
- `netease.getUserPlaylists(uid)`。
- `netease.getPlaylistTracks(id, limit, offset)`。
- UI 顯示「網易雲歌單」與「璃音本機歌單」；雲端操作只有瀏覽／播放／加入本機歌單。

- [ ] 先寫 Provider mapping、IPC 無敏感欄位與 UI 接線失敗測試。
- [ ] 實作 Provider 與 IPC；移除固定 REAL_IP。
- [ ] 加入歌單分頁 UI、建立／重新命名／刪除與項目播放。
- [ ] 執行 `npm.cmd test` 與 `npm.cmd run build`。
- [ ] 以隔離資料庫執行 Electron runtime smoke，確認重啟後本機歌單存在且網易雲列表未登入時安全回應。

