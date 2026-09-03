# 璃音 Lucent 安全自動安裝更新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 已簽署的 Windows NSIS 安裝版在更新下載完成後，於未播放且未主持房間時自動重新啟動並安裝，不中斷使用中的音樂或房間。

**Architecture:** 保留 `electron-updater` 讀取封裝內 `app-update.yml` 的更新來源。`updateService` 自己維護「已下載、等待安全時機安裝」狀態與單次安裝保護；主程序在播放來源或房間模式改變時通知服務重新評估。Renderer 只顯示進度與延後原因，不直接操作 updater。

**Tech Stack:** Electron 43、electron-updater 6、Node test、React 19。

## Global Constraints

- 只作用於已封裝、非 Portable、且有 `app-update.yml` 的安裝版。
- 開發版維持停用；Portable 維持手動下載。
- 不變更 Provider、歌詞、房間同步、播放來源優先級或帳號邏輯。
- 不中斷播放或主持中的房間；安全狀態才安裝。
- 不封裝或部署，除非既有 `release:check` 在使用者提供的 Provider、HTTPS、簽章與頻道設定下通過。

---

### Task 1: 更新服務的背景下載與安全安裝狀態機

**Files:**
- Modify: `electron/updateService.cjs`
- Modify: `tests/updateService.test.cjs`

**Interfaces:**
- `createUpdateService(...).installIfSafe()`：僅在 `status === 'ready'` 且 `canRestart()` 為真時呼叫一次 `quitAndInstall(false, true)`。
- `createUpdateService(...).notifySafetyChanged()`：安全狀態切換後重新評估待安裝更新。
- `snapshot().deferred`：更新已下載但不可安全重啟時為 `true`。

- [x] **Step 1: 寫入背景下載與安全安裝的失敗測試**

在 `tests/updateService.test.cjs` 的 `FakeUpdater` 使用既有 `downloads` 與 `installs` 計數，加入：

```js
test('automatic installs download in background and install once when safe', async () => {
  const updater = new FakeUpdater()
  let safe = false
  const service = createUpdateService({
    autoUpdater: updater, currentVersion: '1.0.0', capability: { mode: 'automatic' },
    canRestart: () => safe,
    setTimeoutFn: () => 1, setIntervalFn: () => 2, clearTimeoutFn: () => {}, clearIntervalFn: () => {},
  })
  service.start({ autoCheck: false, channel: 'stable' })
  assert.equal(updater.autoDownload, true)
  assert.equal(updater.autoInstallOnAppQuit, true)
  updater.emit('update-downloaded', { version: '1.1.0' })
  assert.equal(service.snapshot().deferred, true)
  assert.equal(updater.installs, 0)
  safe = true
  assert.deepEqual(service.notifySafetyChanged(), { ok: true })
  assert.equal(updater.installs, 1)
  assert.deepEqual(service.notifySafetyChanged(), { ok: true })
  assert.equal(updater.installs, 1)
})
```

Also change the existing available-update assertion to prove that `autoDownload` is true and the service does not require a Renderer download request.

- [x] **Step 2: 執行紅燈**

Run: `node --test tests/updateService.test.cjs`

Expected: FAIL because `autoDownload` is false and `notifySafetyChanged` does not exist.

- [x] **Step 3: 實作最小狀態機**

In `electron/updateService.cjs`:

```js
let installStarted = false

function installIfSafe() {
  if (state.status !== 'ready') return { ok: false, error: '更新尚未下載完成' }
  if (installStarted) return { ok: true }
  if (!canRestart()) {
    publish({ deferred: true })
    return { ok: false, deferred: true, error: '播放中或正在主持房間，已延後安裝' }
  }
  installStarted = true
  publish({ deferred: false })
  autoUpdater.quitAndInstall(false, true)
  return { ok: true }
}
```

Set `autoUpdater.autoDownload = true` and `autoUpdater.autoInstallOnAppQuit = true` in `start()`. In the `update-downloaded` listener, call `installIfSafe()` after publishing `ready`. Expose both `installIfSafe` and `notifySafetyChanged: installIfSafe`; retain `install()` as an explicit UI alias for `installIfSafe`.

- [x] **Step 4: 執行綠燈**

Run: `node --test tests/updateService.test.cjs`

Expected: PASS; the existing manual UI command still receives a safe deferred result while background install no longer needs a click.

### Task 2: 主程序安全狀態通知與控制台文案

**Files:**
- Modify: `electron/main.cjs`
- Modify: `src/ConsoleWindow.jsx`
- Modify: `tests/updateWiring.test.mjs`

**Interfaces:**
- `electron/main.cjs` calls `updateService?.notifySafetyChanged()` after the selected playback snapshot changes and after successful `room:host`／`room:leave` mode changes.
- The update page distinguishes automatic background download and safe-install waiting from manual Portable behaviour.

- [x] **Step 1: 寫入接線失敗測試**

Add to `tests/updateWiring.test.mjs`:

```js
test('main rechecks a downloaded update when playback or room authority changes', () => {
  assert.match(main, /updateService\?\.notifySafetyChanged\(\)/)
  assert.match(main, /ipcMain\.handle\('room:leave'[\s\S]*?notifySafetyChanged/)
})

test('update UI explains background download and safe automatic install', () => {
  assert.match(ui, /背景自動下載/)
  assert.match(ui, /安全時機自動安裝/)
})
```

- [x] **Step 2: 執行紅燈**

Run: `node --test tests/updateWiring.test.mjs`

Expected: FAIL because the notification and wording are absent.

- [x] **Step 3: 實作最小主程序與 UI 接線**

In `electron/main.cjs`, add the notification at the end of the existing `playback.subscribe` callback and after state-changing host／leave IPC handlers:

```js
updateService?.notifySafetyChanged()
```

In `src/ConsoleWindow.jsx`, change the automatic-update hint to:

```jsx
<div className="hint">安裝版會背景自動下載更新，並在未播放、未主持房間的安全時機自動安裝；Portable 版本只提示手動下載。</div>
```

- [x] **Step 4: 執行綠燈**

Run: `node --test tests/updateWiring.test.mjs tests/updateService.test.cjs`

Expected: PASS.

### Task 3: 完整回歸與有條件的 EXE 封裝

**Files:**
- Modify: `package.json` only if new tests are not already in the `test` script.
- Modify: `docs/release/update-feed.md` to document that the signed installer self-installs only at a safe time.

- [x] **Step 1: 加入完整測試與補充發佈說明**

Ensure `tests/updateService.test.cjs` and `tests/updateWiring.test.mjs` stay in `npm.cmd test`. Add this sentence to `docs/release/update-feed.md` after the static-file list:

```markdown
已簽署的 NSIS 安裝版會背景下載更新；只有未播放且未主持房間時才自動重新啟動安裝。
```

- [x] **Step 2: 完整驗證**

Run:

```powershell
npm.cmd test
npm.cmd run build
```

Expected: all tests pass and Vite build succeeds.

- [ ] **Step 3: 僅在正式前檢通過後封裝**

Run:

```powershell
npm.cmd run release:check
```

Only if it exits 0, run:

```powershell
npm.cmd run dist
```

Expected: a signed NSIS installer and portable executable in `release/`, with `app-update.yml` embedded in the NSIS installation resources. Do not run a public deployment; stage the feed only after the user provides the owned HTTPS host and deployment credentials.

## Self-Review

- Scope coverage: Task 1 implements automatic background download and one-shot safe installation; Task 2 rechecks safety on the only two state classes that block installation; Task 3 verifies and conditionally packages.
- Safety: no forced restart during playback or hosting, no new credentials, no external upload, and no Provider bypass.
- Placeholder scan: no unspecified behaviour remains; downloaded-update, unsafe, safe, and repeated-notification outcomes are explicit.
