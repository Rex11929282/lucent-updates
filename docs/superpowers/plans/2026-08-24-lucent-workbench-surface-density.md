# 璃音 Lucent 工作檯材質與資訊密度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除控制台深色外邊感，加入可保存的純白不透明材質，並以既有播放資料填補工作檯的空白區域。

**Architecture:** `state.ui.workbench.surface` 是唯一的控制台材質偏好，shared normalizer 在主行程與 renderer 同步驗證。`LiquidWorkbench` 只新增一個底部摘要列與兩個材質按鈕；CSS 依 modifier class 切換材質，不影響桌面藥丸。

**Tech Stack:** Electron、React 19、Vite 6、原生 CSS、node:test。

## Global Constraints

- 不新增依賴、不封裝 EXE、不改歌曲、歌詞、播放、房間、更新或桌面藥丸定位。
- UI 保持繁體中文；動畫只使用 transform / opacity；不增加 timer。
- 純白材質僅影響控制台，且可在重啟後恢復。

---

### Task 1: 可保存的控制台材質

**Files:**
- Modify: `shared/defaults.json`
- Modify: `shared/liquidWorkbench.cjs`
- Modify: `src/liquidWorkbenchModel.js`
- Test: `tests/liquidWorkbench.test.cjs`
- Test: `tests/stateMigration.test.cjs`

- [ ] **Step 1: 寫失敗測試**

```js
test('workbench surface accepts only glass or white and keeps the choice', () => {
  assert.equal(normalizeWorkbench({ surface: 'white' }).surface, 'white')
  assert.equal(normalizeWorkbench({ surface: 'invalid' }).surface, 'glass')
})
```

- [ ] **Step 2: 執行並確認失敗**

Run: `node --test tests/liquidWorkbench.test.cjs tests/stateMigration.test.cjs`

- [ ] **Step 3: 最小實作**

將 schema 升至 14，在 `ui.workbench` 增加 `surface: "glass"`。shared 與 renderer 的 `normalizeWorkbench` 都只接受 `glass` / `white`，並回傳 surface；既有 migration 已透過 normalizer 讀取舊設定，因此不另建平行遷移路徑。

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test tests/liquidWorkbench.test.cjs tests/stateMigration.test.cjs`

### Task 2: 摘要列與純白不透明材質

**Files:**
- Modify: `src/ConsoleWindow.jsx`
- Modify: `src/styles.css`
- Test: `tests/liquidWorkbenchRuntime.test.mjs`

- [ ] **Step 1: 寫失敗測試**

```js
test('workbench exposes a persisted white surface switch and real playback summary', () => {
  assert.match(source, /workbench--\$\{workbench\.surface\}/)
  assert.match(source, /workbench__summary/)
  assert.match(source, /setUi\(\{ workbench: \{ \.\.\.workbench, surface \} \}\)/)
  assert.match(css, /\.workbench--white[\s\S]*background:\s*#fff/)
})
```

- [ ] **Step 2: 執行並確認失敗**

Run: `node --test tests/liquidWorkbenchRuntime.test.mjs`

- [ ] **Step 3: 最小實作**

新增 `WorkbenchSummary`，使用現有 `roomState.song` 與 `roomState.playing`。在其內提供「冷白玻璃／純白不透明」按鈕，更新 `state.ui.workbench.surface`。CSS 增加摘要列、淺色外陰影與 `.workbench--white` 規則；聚焦設定時摘要列淡出。

- [ ] **Step 4: 執行測試確認通過**

Run: `node --test tests/liquidWorkbench.test.cjs tests/liquidWorkbenchRuntime.test.mjs tests/stateMigration.test.cjs`

### Task 3: 回歸與實機驗證

- [ ] **Step 1: 執行完整測試**

Run: `npm.cmd test`

- [ ] **Step 2: 建置 renderer**

Run: `npm.cmd run build`

- [ ] **Step 3: 隔離 Electron 驗證**

以新的 `--user-data-dir` 啟動 Electron；確認純白模式沒有桌面透入與深色外邊、材質切換更新 class 並可重啟恢復、摘要列出現且開啟設定時淡出。完成後只停止該 QA PID。
