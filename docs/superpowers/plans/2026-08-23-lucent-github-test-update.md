# 璃音 Lucent GitHub 測試更新站 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 封裝可從 `Rex11929282/lucent-updates` 公開 GitHub Releases 自動更新的非商用 Windows 測試版。

**Architecture:** 封裝設定使用公開 GitHub provider；封裝前檢只驗證更新倉庫與頻道。本機永遠以 `--publish never` 建置，Release 資產經人工確認後才上傳至 GitHub，避免 Token 出現在程式或儲存庫。

**Tech Stack:** Electron 43、electron-builder 25、electron-updater 6、Node test、GitHub Releases。

## Global Constraints

- 更新倉庫為公開 `Rex11929282/lucent-updates`，不傳送原始碼。
- 測試發佈不要求 Provider 或簽章，但不得宣稱為正式商用版。
- 不在程式、設定檔或 EXE 保存 GitHub Token。
- `dist` 必須使用 `--publish never`，GitHub 上傳是完成本機驗證後的獨立操作。
- 不改動歌詞、播放器、房間、外觀與既有更新安全安裝邏輯。

---

### Task 1: 公開 GitHub 更新來源與測試前檢

**Files:**
- Modify: `electron-builder.config.cjs`
- Modify: `scripts/releasePreflight.cjs`
- Modify: `tests/releasePreflight.test.cjs`

**Interfaces:**
- `createBuildConfig({ LUCENT_UPDATE_REPOSITORY, LUCENT_RELEASE_CHANNEL })` 回傳公開 GitHub provider 或 `undefined`。
- `checkReleaseEnvironment(env)` 僅接受合法 `owner/repo` 與 `stable`／`beta`。

- [x] **Step 1: 寫入失敗測試**

在 `tests/releasePreflight.test.cjs` 將 generic HTTPS 測試換成：

```js
test('test builds embed the selected public GitHub update repository', () => {
  const config = createBuildConfig({
    LUCENT_UPDATE_REPOSITORY: 'Rex11929282/lucent-updates',
    LUCENT_RELEASE_CHANNEL: 'beta',
  })
  assert.deepEqual(config.publish, [{
    provider: 'github', owner: 'Rex11929282', repo: 'lucent-updates',
    private: false, releaseType: 'release', channel: 'beta',
  }])
})

test('test release requires repository and channel but not provider approval or signing', () => {
  const result = checkReleaseEnvironment({
    LUCENT_UPDATE_REPOSITORY: 'Rex11929282/lucent-updates',
    LUCENT_RELEASE_CHANNEL: 'stable',
  })
  assert.deepEqual(result, { ok: true, errors: [] })
})
```

保留一個測試，確認無效 `owner/repo` 不會嵌入 publish 設定，且前檢錯誤不輸出 secret。

- [x] **Step 2: 執行失敗測試**

Run: `node --test tests/releasePreflight.test.cjs`

Expected: FAIL，因目前仍要求 Provider、HTTPS URL 與簽章。

- [x] **Step 3: 實作最小設定**

在 `electron-builder.config.cjs` 新增僅接受單一 `owner/repo` 的解析函式，並設定：

```js
publish: source ? [{
  provider: 'github', owner: source.owner, repo: source.repo,
  private: false, releaseType: 'release', channel,
}] : undefined
```

在 `scripts/releasePreflight.cjs` 移除 Provider、HTTPS、簽章要求，只檢查 repository 和頻道。不得將環境變數值加入錯誤訊息。

- [x] **Step 4: 執行通過測試**

Run: `node --test tests/releasePreflight.test.cjs`

Expected: PASS。

### Task 2: 防止本機建置意外上傳

**Files:**
- Modify: `package.json`
- Modify: `tests/releasePreflight.test.cjs`
- Modify: `docs/release/update-feed.md`

**Interfaces:**
- `npm.cmd run dist` 必須包含 `--publish never`。
- 文件列出測試版環境變數與手動 GitHub Release 上傳資產。

- [x] **Step 1: 寫入失敗測試**

```js
test('distribution build is explicitly local and never uploads release assets', () => {
  const pkg = require('../package.json')
  assert.match(pkg.scripts.dist, /--publish never/)
})
```

- [x] **Step 2: 執行失敗測試**

Run: `node --test tests/releasePreflight.test.cjs`

Expected: FAIL，因 `dist` 尚未明確禁止 upload。

- [x] **Step 3: 實作最小設定與文件**

將 `dist` 改為：

```json
"dist": "npm run release:check && vite build && electron-builder --config electron-builder.config.cjs --publish never"
```

將 `docs/release/update-feed.md` 改為 GitHub Releases 流程，包含：

```powershell
$env:LUCENT_UPDATE_REPOSITORY = 'Rex11929282/lucent-updates'
$env:LUCENT_RELEASE_CHANNEL = 'stable'
npm.cmd run dist
```

並要求 Release `v<package version>` 上傳 `latest.yml`、NSIS Setup EXE 與其 `.blockmap`；不需要、也不可把 Token 寫入程式。

- [x] **Step 4: 執行通過測試**

Run: `node --test tests/releasePreflight.test.cjs`

Expected: PASS。

### Task 3: 本機封裝與 GitHub Release 發佈

**Files:**
- Output: `release/`
- External: `https://github.com/Rex11929282/lucent-updates/releases`

- [x] **Step 1: 執行完整回歸與建置**

Run:

```powershell
npm.cmd test
npm.cmd run build
$env:LUCENT_UPDATE_REPOSITORY = 'Rex11929282/lucent-updates'
$env:LUCENT_RELEASE_CHANNEL = 'stable'
npm.cmd run release:check
npm.cmd run dist
```

Expected: 全部測試通過，且 `release/` 出現 NSIS Setup EXE、portable EXE、`latest.yml`、NSIS `.blockmap`。

- [x] **Step 2: 檢查封裝的更新設定**

確認 NSIS 安裝資源中的 `app-update.yml` 指向 `Rex11929282/lucent-updates`，且安裝包沒有 Token 或簽章憑證。

- [x] **Step 3: 建立公開 GitHub Release**

在 `Rex11929282/lucent-updates` 建立 tag `v<package version>` 的公開 Release，並上傳 `latest.yml`、NSIS Setup EXE 與其 `.blockmap`。上傳前確認版本與三個檔案名稱一致；Portable EXE 可作手動備用下載，但不作自動更新目標。

- [ ] **Step 4: 驗證公開更新資產**

在 GitHub Release 頁面確認三個必要資產、公開狀態與 tag；再以新版本號的後續建置進行實際下載與安全自動安裝測試。

## Self-Review

- Scope coverage: Task 1 移除商用前檢並改為公開 GitHub provider；Task 2 防止誤上傳並記錄流程；Task 3 建置、檢查、發佈及後續驗證。
- 安全性: 不包含 Token、不推送原始碼、不假裝簽章，且不在播放／主持時中斷安裝。
- Placeholder scan: 每一個 build、release 與檔案驗證條件均已具體列出。

## Release verification — 2026-08-23

- [x] Published public GitHub Release `v1.0.0` at `Rex11929282/lucent-updates`.
- [x] Verified public assets: `latest.yml`, `Lucent-Setup-1.0.0.exe`, its `.blockmap`, and `Lucent-Portable-1.0.0.exe`.
- [x] Verified the release is marked Latest and uses the embedded public GitHub updater configuration.
- [ ] A later higher-version release is required for a live download-and-install cycle; `v1.0.0` cannot update itself.
