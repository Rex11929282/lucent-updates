# 璃音 Lucent 封裝版更新來源 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓已簽署的 Windows NSIS 安裝版從封裝內的更新設定取得 HTTPS 更新來源，不依賴終端使用者的環境變數；同時產出可部署到靜態 HTTPS 主機的更新檔案清單。

**Architecture:** 電子安裝包的 `app-update.yml` 由 electron-builder 的 generic publish 設定在封裝時生成。主程序只在已封裝、非 portable、且資源目錄存在有效 `app-update.yml` 時啟用更新服務，並讓 `electron-updater` 直接讀取封裝設定；開發版與 portable 保持既有安全行為。發佈準備腳本只建立靜態站所需檔案清單與部署說明，不嘗試登入或建立外部帳號。

**Tech Stack:** Electron 43、electron-updater 6、electron-builder 25、Node test、PowerShell。

## Global Constraints

- 不變更音樂 Provider、帳號、歌詞、房間或播放邏輯。
- 開發版不能執行自動更新；portable 版只能手動下載。
- 正式 NSIS 發佈仍必須通過既有 Provider、HTTPS、簽章與頻道 preflight。
- 不將任何帳號權杖、憑證或私人更新 URL 寫入來源控制檔。
- 不部署至任何公開網路，直到使用者提供網域或託管帳號。

---

### Task 1: 封裝內更新設定偵測

**Files:**
- Create: `shared/updateConfig.cjs`
- Create: `tests/updateConfig.test.cjs`
- Modify: `electron/main.cjs`

**Interfaces:**
- Produces: `readBundledUpdateConfig({ isPackaged, resourcesPath, existsSync })`。
- Returns: `{ enabled: boolean, reason: string }`。
- `electron/main.cjs` passes the returned values into existing `updateCapability`.

- [x] **Step 1: 寫入失敗測試**

```js
const result = readBundledUpdateConfig({
  isPackaged: true,
  resourcesPath: 'C:/Lucent/resources',
  existsSync: (file) => file === 'C:/Lucent/resources/app-update.yml',
})
assert.deepEqual(result, { enabled: true, reason: '' })
```

Also assert unpackaged builds return `{ enabled: false, reason: '開發模式不執行自動更新' }` and a packaged build without `app-update.yml` returns `{ enabled: false, reason: '安裝包沒有更新設定' }`.

- [x] **Step 2: 確認紅燈**

Run: `node --test tests/updateConfig.test.cjs`

Expected: FAIL because `shared/updateConfig.cjs` does not exist.

- [x] **Step 3: 實作最小偵測函式與主程序接線**

```js
function readBundledUpdateConfig({ isPackaged, resourcesPath, existsSync }) {
  if (!isPackaged) return { enabled: false, reason: '開發模式不執行自動更新' }
  const configPath = path.join(String(resourcesPath || ''), 'app-update.yml')
  if (!existsSync(configPath)) return { enabled: false, reason: '安裝包沒有更新設定' }
  return { enabled: true, reason: '' }
}
```

Use `readBundledUpdateConfig` in `restartUpdateService()` and remove the runtime dependency on `LUCENT_UPDATE_URL` and `LUCENT_UPDATE_ENABLED`. `electron-updater` reads the bundled `app-update.yml`; the service must not call dynamic `setFeedURL`.

- [x] **Step 4: 確認綠燈**

Run: `node --test tests/updateConfig.test.cjs tests/updateService.test.cjs`

Expected: all tests PASS; `updateService` still disables development and manual-only portable modes.

### Task 2: 封裝時 generic HTTPS 更新設定

**Files:**
- Create: `electron-builder.config.cjs`
- Modify: `package.json`
- Modify: `scripts/releasePreflight.cjs`
- Modify: `tests/releasePreflight.test.cjs`

**Interfaces:**
- `electron-builder.config.cjs` reads only build-time `LUCENT_UPDATE_URL` and `LUCENT_RELEASE_CHANNEL`.
- A valid HTTPS URL produces `{ provider: 'generic', url, channel }` as the first publish target.
- `npm run dist` uses the external builder config after preflight passes.

- [x] **Step 1: 寫入失敗測試**

```js
const { createBuildConfig } = require('../electron-builder.config.cjs')
const config = createBuildConfig({
  LUCENT_UPDATE_URL: 'https://updates.example.test/lucent',
  LUCENT_RELEASE_CHANNEL: 'beta',
})
assert.deepEqual(config.publish, [{ provider: 'generic', url: 'https://updates.example.test/lucent', channel: 'beta' }])
```

Also assert an absent URL produces no `publish` section and does not embed an invalid URL.

- [x] **Step 2: 確認紅燈**

Run: `node --test tests/releasePreflight.test.cjs`

Expected: FAIL because `electron-builder.config.cjs` and `createBuildConfig` do not exist.

- [x] **Step 3: 建立 builder 設定並移出 package.json inline build 設定**

```js
function createBuildConfig(env = process.env) {
  const url = String(env.LUCENT_UPDATE_URL || '').trim().replace(/\/$/, '')
  const channel = env.LUCENT_RELEASE_CHANNEL === 'beta' ? 'beta' : 'latest'
  return {
    appId: 'com.diowmow.lucentlyrics',
    productName: 'Lucent',
    publish: url ? [{ provider: 'generic', url, channel }] : undefined,
    win: { target: [{ target: 'nsis', arch: ['x64'] }, { target: 'portable', arch: ['x64'] }] },
  }
}
module.exports = createBuildConfig()
module.exports.createBuildConfig = createBuildConfig
```

Copy all existing files, icon, directories and NSIS properties exactly into the external config. Set package script `dist` to call `electron-builder --config electron-builder.config.cjs`.

- [x] **Step 4: 確認綠燈**

Run: `node --test tests/releasePreflight.test.cjs tests/updateConfig.test.cjs && npm.cmd run build`

Expected: tests PASS and Vite build succeeds.

### Task 3: 靜態 HTTPS 更新站發佈產物

**Files:**
- Create: `scripts/stageUpdateFeed.cjs`
- Create: `tests/stageUpdateFeed.test.cjs`
- Create: `docs/release/update-feed.md`
- Modify: `package.json`

**Interfaces:**
- `stageUpdateFeed({ releaseDir, outputDir })` copies only `latest.yml`, NSIS installer `.exe`, and matching `.blockmap` from one release directory.
- It rejects missing `latest.yml`, zero installers, or more than one installer rather than deploying an ambiguous feed.
- `npm run stage:update-feed -- <release-dir> <output-dir>` produces a static directory ready for HTTPS hosting.

- [x] **Step 1: 寫入失敗測試**

```js
const result = stageUpdateFeed({ releaseDir, outputDir })
assert.deepEqual(result.files.sort(), [
  'Lucent Setup 1.0.1.exe',
  'Lucent Setup 1.0.1.exe.blockmap',
  'latest.yml',
])
```

Add a separate test requiring a clear error when an installer or `latest.yml` is missing.

- [x] **Step 2: 確認紅燈**

Run: `node --test tests/stageUpdateFeed.test.cjs`

Expected: FAIL because `scripts/stageUpdateFeed.cjs` does not exist.

- [x] **Step 3: 實作最小 staging 腳本與部署說明**

```js
function stageUpdateFeed({ releaseDir, outputDir }) {
  const metadata = path.join(releaseDir, 'latest.yml')
  const installers = fs.readdirSync(releaseDir).filter((name) => /Setup .*\.exe$/i.test(name))
  if (!fs.existsSync(metadata) || installers.length !== 1) throw new Error('更新產物不完整或不明確')
  // copy latest.yml, the one installer, and its .blockmap
}
```

Document that the output must be served verbatim over HTTPS, with public read access to the three files and immutable caching disabled for `latest.yml`.

- [x] **Step 4: 確認綠燈與完整回歸**

Run: `node --test tests/stageUpdateFeed.test.cjs tests/updateConfig.test.cjs tests/updateService.test.cjs tests/releasePreflight.test.cjs && npm.cmd test && npm.cmd run build`

Expected: all tests PASS, Vite build succeeds, and no installer or public network deployment is performed.

## Self-Review

- Scope coverage: Task 1 removes end-user runtime environment requirements; Task 2 embeds the generic HTTPS feed in packaged installer metadata; Task 3 creates exactly the static files a HTTPS host needs.
- Security: No credentials, private feed URL, Provider code, or runtime update bypass is introduced.
- Deployment boundary: The plan prepares artifacts only. A public deployment still requires a domain or hosting credentials supplied by the user.
