# 璃音 Lucent 隱私資料控制與商用發佈防呆 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓使用者能從璃音移除本機帳號、歌單與設定資料，並阻止在未完成官方音樂授權、HTTPS 更新來源與 Windows 簽章前產出被誤當成商用正式版的安裝包。

**Architecture:** 主程序新增 `PrivacyService`，只處理三種明確資料範圍：加密登入憑證、SQLite 本機資料庫、設定 JSON。Renderer 經過受限 IPC 取得摘要與觸發刪除，永遠不收到檔案路徑或 Cookie。`releasePreflight` 在 `npm run dist` 前驗證正式發佈所需的環境訊號；未通過即停止封裝。

**Tech Stack:** Electron 43、Electron safeStorage、Node node:sqlite、React 19、electron-builder、Node test。

## Global Constraints

- 清除資料只影響璃音本機資料，絕不刪除網易雲帳號、雲端歌單或使用者電腦上的官方網易雲資料。
- Cookie、播放 URL、SQLite 路徑與完整使用者資料不可傳到 Renderer、房間封包或一般日誌。
- 刪除 SQLite 時只允許精確已驗證的 `lucent-data.db`、`-wal`、`-shm` 目標，先關閉資料庫再重新建立。
- 主持房間時不可清除本機歌單／房間佇列；帳號登出可立即執行。
- 只有 `npm run dist` 走商用發佈前檢查；開發與測試建置不得被阻塞。
- 未有正式授權 Provider 時不可將 `LUCENT_ALLOW_UNOFFICIAL_NETEASE` 用作商用通行條件。
- 不新增遊戲功能、不使用假音訊分析、不封裝 EXE 直到前檢通過。

---

### Task 1: 可測試的本機資料清除服務

**Files:**
- Create: `electron/privacyService.cjs`
- Create: `tests/privacyService.test.cjs`

**Interfaces:**
- `createPrivacyService({ credentialStore, fs, databasePath, configPath, closeDatabase, openDatabase, getRoomMode, getState, setState, saveState })`
- `summary()` 回傳 `{ accountStored, libraryStored, settingsStored }`，不含路徑、Cookie、歌單名稱。
- `erase(scope)` 只接受 `'account' | 'library' | 'settings'`，回傳 `{ ok, scope, error? }`。

- [x] **Step 1: 寫入失敗測試**

```js
test('privacy summary never exposes a cookie or local filesystem path', () => {
  const service = fixture().service
  const summary = service.summary()
  assert.deepEqual(Object.keys(summary).sort(), ['accountStored', 'libraryStored', 'settingsStored'])
  assert.equal(JSON.stringify(summary).includes('secret-cookie'), false)
})

test('library erase closes, removes exact SQLite sidecars, then recreates a store', () => {
  const fx = fixture()
  assert.deepEqual(fx.service.erase('library'), { ok: true, scope: 'library' })
  assert.deepEqual(fx.calls, ['close', 'open'])
})

test('library erase is rejected while hosting and account erase does not touch cloud data', () => {
  const fx = fixture({ roomMode: 'host' })
  assert.equal(fx.service.erase('library').ok, false)
  assert.deepEqual(fx.service.erase('account'), { ok: true, scope: 'account' })
  assert.equal(fx.cloudTouched, false)
})
```

- [x] **Step 2: 執行測試確認紅燈**

Run: `node --test tests/privacyService.test.cjs`

Expected: FAIL with `Cannot find module '../electron/privacyService.cjs'`.

- [x] **Step 3: 實作最小服務**

```js
const SCOPES = new Set(['account', 'library', 'settings'])
function createPrivacyService(deps) {
  function erase(scope) {
    if (!SCOPES.has(scope)) return { ok: false, error: '資料範圍無效' }
    if (scope === 'library' && deps.getRoomMode() === 'host') {
      return { ok: false, error: '主持房間時不能清除本機歌單' }
    }
    // account → credentialStore.save('')
    // library → close → unlink database / -wal / -shm → open
    // settings → setState(defaultState) → saveState()
    return { ok: true, scope }
  }
  return { summary, erase }
}
```

Use exact `databasePath`, `${databasePath}-wal`, `${databasePath}-shm`; ignore only `ENOENT`. `settings` resets only the persisted Lucent settings state and keeps the current process viable.

- [x] **Step 4: 執行測試確認綠燈**

Run: `node --test tests/privacyService.test.cjs`

Expected: all privacy tests PASS.

### Task 2: 主程序 IPC 與資料摘要

**Files:**
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `src/overlayBridge.js`
- Create: `tests/privacyWiring.test.mjs`

**Interfaces:**
- Main IPC: `privacy:summary`, `privacy:erase`.
- Preload API: `overlay.privacy.summary()` and `overlay.privacy.erase(scope)`.
- Renderer fallback must return safe false/empty data.

- [x] **Step 1: 寫入接線失敗測試**

```js
test('privacy control is main-process mediated and exposes no file paths', () => {
  assert.match(main, /createPrivacyService/)
  assert.match(main, /privacy:summary/)
  assert.match(main, /privacy:erase/)
  assert.match(preload, /privacy: \{/)
  assert.match(bridge, /privacy: \{/)
  assert.doesNotMatch(preload, /lucent-data\.db|netease-credential\.bin/)
})
```

- [x] **Step 2: 執行接線測試確認紅燈**

Run: `node --test tests/privacyWiring.test.mjs`

Expected: FAIL because `privacy:*` IPC and bridge are absent.

- [x] **Step 3: 接入服務與 IPC**

```js
const privacyService = createPrivacyService({
  credentialStore,
  databasePath: localDatabasePath,
  configPath: CONFIG_PATH,
  closeDatabase: () => localPlaylists?.close(),
  openDatabase: () => { localPlaylists = createLocalPlaylistStore(localDatabasePath) },
  getRoomMode: () => room.mode,
  getState: () => state,
  setState: (next) => { state = next },
  saveStateNow,
})
ipcMain.handle('privacy:summary', () => privacyService.summary())
ipcMain.handle('privacy:erase', (_event, scope) => privacyService.erase(scope))
```

After library reset, clear the active in-memory queue ID. After settings reset, broadcast state, recompute desktop capture, and clamp the overlay back onto its current display.

- [x] **Step 4: 執行接線測試確認綠燈**

Run: `node --test tests/privacyWiring.test.mjs tests/privacyService.test.cjs`

Expected: all tests PASS.

### Task 3: 繁中帳號與資料控制 UI

**Files:**
- Modify: `src/ConsoleWindow.jsx`
- Modify: `src/styles.css`
- Modify: `tests/privacyWiring.test.mjs`

**Interfaces:**
- `PrivacyBox` loads `ov.privacy.summary()` on mount and after any erase.
- User must confirm each destructive action.
- UI labels: `資料與隱私`, `移除本機登入資料`, `清除本機歌單與房間佇列`, `重設璃音設定`.

- [x] **Step 1: 擴充 UI 失敗測試**

```js
test('traditional Chinese privacy UI distinguishes local deletion from cloud account deletion', () => {
  assert.match(consoleSource, /資料與隱私/)
  assert.match(consoleSource, /只移除這台電腦上的璃音資料/)
  assert.match(consoleSource, /不會刪除網易雲帳號或雲端歌單/)
  assert.match(consoleSource, /主持房間時不能清除本機歌單/)
})
```

- [x] **Step 2: 實作 `PrivacyBox`**

```jsx
function PrivacyBox() {
  const [summary, setSummary] = useState({ accountStored: false, libraryStored: false, settingsStored: false })
  const erase = async (scope, label) => {
    if (!window.confirm(`確定要${label}？此操作只影響這台電腦。`)) return
    const result = await ov.privacy.erase(scope)
    // show returned human-readable error and refresh summary
  }
  return <Section title="資料與隱私">...</Section>
}
```

Place it directly beneath `AccountBox`. Do not add text that implies deletion of the remote NetEase account.

- [x] **Step 3: 執行 UI 與 build 驗證**

Run: `node --test tests/privacyWiring.test.mjs && npm.cmd run build`

Expected: PASS and Vite build succeeds.

### Task 4: 商用發佈前檢查與封裝防呆

**Files:**
- Create: `scripts/releasePreflight.cjs`
- Create: `tests/releasePreflight.test.cjs`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- `checkReleaseEnvironment(env, { existsSync })` returns `{ ok, errors }` without printing secrets.
- Required exact signals:
  - `LUCENT_OFFICIAL_PROVIDER_READY=1`
  - `LUCENT_UPDATE_URL` parses as `https:`
  - `CSC_LINK` or `WIN_CSC_LINK` is present
  - `LUCENT_RELEASE_CHANNEL` is `stable` or `beta`
- `npm run dist` must invoke `npm run release:check` before `vite build && electron-builder`.

- [x] **Step 1: 寫入發佈前檢查測試**

```js
test('commercial release is rejected when official provider, HTTPS feed or signing signal is absent', () => {
  const result = checkReleaseEnvironment({ LUCENT_RELEASE_CHANNEL: 'stable' })
  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /官方音樂 Provider/)
  assert.match(result.errors.join('\n'), /HTTPS/)
  assert.match(result.errors.join('\n'), /簽章/)
})

test('valid release signals pass and no secret values appear in errors', () => {
  const result = checkReleaseEnvironment({
    LUCENT_OFFICIAL_PROVIDER_READY: '1', LUCENT_UPDATE_URL: 'https://updates.example.test/lucent',
    CSC_LINK: 'file:///private/cert.pfx', LUCENT_RELEASE_CHANNEL: 'beta',
  })
  assert.deepEqual(result, { ok: true, errors: [] })
})
```

- [x] **Step 2: 實作前檢查與 script**

```json
{
  "scripts": {
    "release:check": "node scripts/releasePreflight.cjs",
    "dist": "npm run release:check && vite build && electron-builder"
  }
}
```

`releasePreflight.cjs` must print only user-actionable labels, never environment values, cookie values, URLs beyond the fact that HTTPS is required, or certificate paths.

- [x] **Step 3: 記錄營運者設定方式**

Add a `商用發佈前檢查` section to `README.md`. It must clearly state that the environment signals do not replace legal agreements; the official Provider implementation and written authorization remain prerequisites.

- [x] **Step 4: 執行驗證**

Run: `node --test tests/releasePreflight.test.cjs && npm.cmd run release:check`

Expected: tests PASS; the local `release:check` command exits non-zero with no secrets printed because required commercial inputs are intentionally unset.

### Task 5: 全面回歸與隔離 runtime 檢查

**Files:**
- Modify: `tests/electronPlaylistSmoke.cjs`
- Modify: `package.json`

- [x] **Step 1: 加入隔離 runtime privacy smoke**

```js
const summary = await overlay.evaluate('window.overlay.privacy.summary()')
assert.equal(Object.hasOwn(summary, 'databasePath'), false)
const cleared = await overlay.evaluate("window.overlay.privacy.erase('settings')")
assert.equal(cleared.ok, true)
assert.equal((await overlay.evaluate('window.overlay.privacy.summary()')).settingsStored, false)
```

Use only a dedicated QA `--user-data-dir` and database path; never erase production user data during test.

- [x] **Step 2: 執行完整驗證**

Run: `npm.cmd test`

Expected: all tests PASS.

Run: `npm.cmd run build`

Expected: Vite build succeeds.

Run: launch Electron with isolated QA user-data, then `node tests/electronPlaylistSmoke.cjs` with `LUCENT_PLAYLIST_SMOKE_PHASE=privacy`.

Expected: the three privacy summaries and reset action succeed without exposing a path or credential.

## Self-Review

- Coverage: Tasks 1–3 satisfy the spec's local data deletion and privacy disclosure requirements; Task 4 blocks accidental false-commercial packaging; Task 5 checks current runtime behavior.
- Scope: no official Provider, actual update server, code-sign certificate, game feature, audio download, or unrelated refactor is introduced.
- Ambiguity resolved: “delete account data” means deleting only Lucent's local encrypted credential, never deleting the NetEase account.
- Workspace has no Git repository, so this plan intentionally contains no commit steps.
