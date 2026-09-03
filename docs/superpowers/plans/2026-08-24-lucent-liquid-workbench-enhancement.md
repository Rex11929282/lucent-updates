# 璃音 Lucent 液態工作檯外框與互動增強 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在既有冷白玻璃工作檯加入 B 雙層液態框、一次性焦點連結、真實播放狀態提示，以及可直接套用的最近外觀配置快捷列。

**Architecture:** 所有工作侷限於目前的 React 控制台與其 CSS。以現有 `useWorkbenchPointer` 保留唯一的指標 RAF；焦點連結、同步提示與外框均為一次性 CSS 視覺層。配置快捷列使用現有 `profiles`、`setGlass`、`setCfg` 和 `ov.closeConsole()`，不建立新資料或 IPC。

**Tech Stack:** Electron、React 19、Vite 6、CSS、Node 內建 test runner。

## Global Constraints

- 不修改 Electron 主程序、網易雲/CDP、歌詞元件、房間服務、桌面藥丸或封裝設定。
- 不新增 Canvas、第二個 `requestAnimationFrame`、`setInterval` 或偽造音訊／節拍資料。
- 新增動效必須受 `prefers-reduced-motion` 停用。
- 快捷操作僅重用既有外觀 profiles、材質切換與關閉控制台行為；沒有 profiles 時不可渲染空按鈕。
- 工作區不是 Git worktree；不要初始化 Git、不要建立 commit。每個任務以測試與建置輸出取代 commit 紀錄。

---

## File Structure

- `src/ConsoleWindow.jsx`：`LiquidWorkbench` 管理焦點狀態；`WorkbenchSummary` 顯示現有同步摘要與快捷列；`LookTab` 現有的 profile 套用流程會共用同一個小型 helper。
- `src/styles.css`：工作檯的雙層外框、一次性焦點光帶、真實播放狀態提示與 reduced-motion 回退。
- `tests/liquidWorkbenchRuntime.test.mjs`：從 renderer 與 CSS 原始碼驗證外框層、快捷操作、唯一指標控制器和 reduced-motion 規則。

### Task 1: 將既有外觀配置安全暴露為工作檯快捷列

**Files:**

- Modify: `src/ConsoleWindow.jsx:1-21`
- Modify: `src/ConsoleWindow.jsx:242-320`
- Modify: `src/ConsoleWindow.jsx:1049-1131`
- Test: `tests/liquidWorkbenchRuntime.test.mjs:1-170`

**Interfaces:**

- Consumes: `state.profiles`, `setGlass(patch)`, `setCfg(patch)`, `ov.closeConsole()`。
- Produces: `applyAppearanceProfile(profile, setGlass, setCfg)`；`WorkbenchSummary({ song, playing, surface, profiles, onSurfaceChange, onApplyProfile })`。

- [ ] **Step 1: 新增工作檯快捷列的失敗測試**

  在 `tests/liquidWorkbenchRuntime.test.mjs` 新增：

  ```js
  test('workbench quick rail reuses saved appearance profiles and never invents empty actions', () => {
    assert.match(source, /function applyAppearanceProfile\(profile, setGlass, setCfg\)/)
    assert.match(source, /const quickProfiles = \[\.\.\.\(state\.profiles \|\| \[\]\)\][\s\S]*?sort\([\s\S]*?updatedAt[\s\S]*?\)[\s\S]*?slice\(0, 3\)/)
    assert.match(source, /profiles=\{quickProfiles\}/)
    assert.match(source, /onApplyProfile=\{applyProfile\}/)
    assert.match(source, /profiles\.length > 0/)
    assert.match(source, /onClick=\{\(\) => ov\.closeConsole\(\)\}/)
  })
  ```

- [ ] **Step 2: 執行測試並確認目前失敗**

  Run:

  ```powershell
  node --test tests/liquidWorkbenchRuntime.test.mjs
  ```

  Expected: FAIL；`applyAppearanceProfile`、`quickProfiles` 與快捷列尚不存在。

- [ ] **Step 3: 寫入最小共用套用流程與快捷列**

  在 `ConsoleWindow.jsx`、`WorkbenchSummary` 之前新增：

  ```jsx
  function applyAppearanceProfile(profile, setGlass, setCfg) {
    setGlass(profile?.glass || {})
    setCfg(profile?.cfg || {})
  }
  ```

  將 `LookTab` 內的 `applyProfile` 改為：

  ```jsx
  const applyProfile = (profile) => applyAppearanceProfile(profile, setGlass, setCfg)
  ```

  在 `LiquidWorkbench` 建立、排序並限制快捷設定數量：

  ```jsx
  const applyProfile = (profile) => applyAppearanceProfile(profile, setGlass, setCfg)
  const quickProfiles = [...(state.profiles || [])]
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, 3)
  ```

  將 `profiles={quickProfiles}` 和 `onApplyProfile={applyProfile}` 傳給 `WorkbenchSummary`。以完整 JSX 取代原本的 `WorkbenchSummary`：

  ```jsx
  function WorkbenchSummary({ song, playing, surface, profiles, onSurfaceChange, onApplyProfile }) {
    const title = song?.name || '尚未偵測到歌曲'
    const artist = song?.artist || (playing ? '正在讀取歌曲資訊' : '從播放或房間開始')
    return (
      <section className="workbench__summary" aria-label="目前工作檯狀態">
        <div className="workbench__now">
          <span>目前播放</span>
          <strong title={title}>{title}</strong>
          <small>{artist}</small>
        </div>
        <div className="workbench__metrics">
          <span>同步</span>
          <b className={playing ? 'on' : ''}>{playing ? '精準同步中' : '等待播放'}</b>
        </div>
        <div className="workbench__surface-switch" role="group" aria-label="控制台背景材質">
          <button type="button" className={surface === 'glass' ? 'active' : ''} onClick={() => onSurfaceChange('glass')}>冷白玻璃</button>
          <button type="button" className={surface === 'white' ? 'active' : ''} onClick={() => onSurfaceChange('white')}>純白不透明</button>
        </div>
        {profiles.length > 0 && <div className="workbench__quick-profiles" aria-label="最近外觀配置">
          {profiles.map((profile) => <button key={profile.id} type="button" onClick={() => onApplyProfile(profile)}>{profile.name}</button>)}
        </div>}
        <button className="workbench__return" type="button" onClick={() => ov.closeConsole()}>回到桌面藥丸</button>
      </section>
    )
  }
  ```

- [ ] **Step 4: 執行測試並確認通過**

  Run:

  ```powershell
  node --test tests/liquidWorkbenchRuntime.test.mjs
  ```

  Expected: PASS；快捷列只從儲存的 profiles 取最多三筆，關閉動作仍是現有 `ov.closeConsole()`。

- [ ] **Step 5: 記錄任務驗證，不建立 commit**

  工作區沒有 `.git`；不要執行 `git init`。保留本任務的測試輸出，進入下一個任務。

### Task 2: 加入 B 雙層液態框與一次性焦點回饋

**Files:**

- Modify: `src/ConsoleWindow.jsx:226-320`
- Modify: `src/styles.css:1154-1475`
- Test: `tests/liquidWorkbenchRuntime.test.mjs:1-170`

**Interfaces:**

- Consumes: `focused` 與 `roomState?.playing`，以及既有 `.workbench`、`.workbench__focus-card`、`.workbench__sync`。
- Produces: `.workbench::before`、`.workbench::after`、`.workbench__focus-link`、`.workbench__sync.is-playing` 和 `workbenchFocusLink`。

- [ ] **Step 1: 新增視覺層與減少動態效果的失敗測試**

  在 `tests/liquidWorkbenchRuntime.test.mjs` 新增：

  ```js
  test('workbench has the approved dual frame, one-shot focus link, and reduced-motion fallback', () => {
    assert.match(source, /className=\{`workbench__sync \$\{roomState\?\.playing \? 'is-playing' : ''\}`\}/)
    assert.match(source, /focused && <div className="workbench__focus-link" aria-hidden \/>/)
    assert.match(css, /\.workbench::before[\s\S]*border:/)
    assert.match(css, /\.workbench::after[\s\S]*border:/)
    assert.match(css, /\.workbench__focus-link[\s\S]*animation:\s*workbenchFocusLink/)
    assert.match(css, /@keyframes workbenchFocusLink/)
    const reducedMotion = css.match(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/g).at(-1) || ''
    assert.match(reducedMotion, /\.workbench__focus-link[\s\S]*animation:\s*none/)
    assert.match(reducedMotion, /\.workbench__sync[\s\S]*animation:\s*none/)
  })
  ```

- [ ] **Step 2: 執行測試並確認目前失敗**

  Run:

  ```powershell
  node --test tests/liquidWorkbenchRuntime.test.mjs
  ```

  Expected: FAIL；雙層外框、焦點連結與同步提示類別尚不存在。

- [ ] **Step 3: 寫入最小視覺層與既有狀態綁定**

  在 `LiquidWorkbench` 的 `<main>` 內、設定面板之前加入：

  ```jsx
  {focused && <div className="workbench__focus-link" aria-hidden />}
  ```

  將 header 同步標記改為：

  ```jsx
  <span className={`workbench__sync ${roomState?.playing ? 'is-playing' : ''}`}>
    ● {roomState?.playing ? '精準同步中' : '等待播放'}
  </span>
  ```

  在 `src/styles.css` 的 `.workbench` 後加入：

  ```css
  .workbench::before,
  .workbench::after {
    content: "";
    position: absolute;
    z-index: 4;
    pointer-events: none;
    border-radius: inherit;
  }
  .workbench::before {
    inset: 0;
    border: 1px solid rgba(255,255,255,.94);
    box-shadow: inset 0 1px rgba(255,255,255,.82), inset 0 -1px rgba(94,126,141,.14);
  }
  .workbench::after {
    inset: 7px;
    border: 1px solid rgba(100,164,191,.40);
    box-shadow: inset 0 1px rgba(255,255,255,.5);
  }
  .workbench--white::after { border-color: rgba(100,164,191,.24); }
  .workbench__focus-link {
    position: absolute;
    z-index: 2;
    top: 50%;
    left: 150px;
    right: 424px;
    height: 1px;
    pointer-events: none;
    transform-origin: left;
    background: linear-gradient(90deg, rgba(92,165,196,.62), rgba(142,204,224,.12));
    box-shadow: 0 0 12px rgba(95,173,205,.34);
    animation: workbenchFocusLink 260ms cubic-bezier(.2,.8,.2,1) both;
  }
  @keyframes workbenchFocusLink {
    from { opacity: 0; transform: scaleX(.2); }
    to { opacity: .8; transform: scaleX(1); }
  }
  .workbench__sync.is-playing { animation: workbenchSyncPulse 520ms ease-out both; }
  @keyframes workbenchSyncPulse {
    from { color: #1f6f8f; text-shadow: 0 0 0 rgba(98,185,220,0); }
    45% { color: #2f98bc; text-shadow: 0 0 12px rgba(98,185,220,.48); }
    to { color: rgba(27,75,94,.72); text-shadow: 0 0 0 rgba(98,185,220,0); }
  }
  ```

  在既有最後一個 `@media (prefers-reduced-motion: reduce)` 區塊加入：

  ```css
  .workbench__focus-link,
  .workbench__sync { animation: none; }
  ```

  在 `@media (max-width: 760px)` 區塊加入：

  ```css
  .workbench__focus-link { display: none; }
  ```

  不要在 `.workbench` 根節點重新加入 `border` 或 `box-shadow`；雙層外框只能由 pseudo-elements 形成。

- [ ] **Step 4: 執行測試並確認通過**

  Run:

  ```powershell
  node --test tests/liquidWorkbenchRuntime.test.mjs
  ```

  Expected: PASS；根工作檯仍沒有舊式外框宣告，雙層視覺框、焦點連結與 reduced-motion 回退都可由測試辨識。

- [ ] **Step 5: 記錄任務驗證，不建立 commit**

  工作區沒有 `.git`；不要執行 `git init`。保留本任務的測試輸出，進入最終驗證。

### Task 3: 完整回歸、建置與隔離 Electron 視覺檢查

**Files:**

- Verify only: `src/ConsoleWindow.jsx`
- Verify only: `src/styles.css`
- Verify only: `tests/liquidWorkbenchRuntime.test.mjs`

**Interfaces:**

- Consumes: Tasks 1–2 的現有 renderer 和 CSS。
- Produces: 新鮮的測試、建置、隔離 Electron computed-style 與互動驗證紀錄。

- [ ] **Step 1: 執行完整測試**

  Run:

  ```powershell
  npm.cmd test
  ```

  Expected: 全部測試通過，包含既有歌詞鏡像、房間同步、設定遷移與工作檯測試。

- [ ] **Step 2: 建置 renderer**

  Run:

  ```powershell
  npm.cmd run build
  ```

  Expected: Vite 成功輸出 `dist/index.html`、CSS 與 JavaScript bundles。

- [ ] **Step 3: 啟動隔離 Electron，檢查雙層外框和快捷列**

  Run:

  ```powershell
  $electron = (Resolve-Path 'node_modules\electron\dist\electron.exe').Path
  $qaDir = 'C:\Users\DIOWMOW\AppData\Local\Temp\LucentWorkbenchEnhancementQA'
  $qa = Start-Process -FilePath $electron -ArgumentList '.', '--remote-debugging-port=9240', "--user-data-dir=$qaDir" -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
  ```

  以 CDP 對 overlay 執行 `window.overlay.openConsole()`；在 console target 評估：

  ```js
  (() => {
    const root = document.querySelector('.workbench')
    const card = document.querySelector('.workbench__module')
    return {
      rootBorder: getComputedStyle(root).border,
      rootBoxShadow: getComputedStyle(root).boxShadow,
      rootBefore: getComputedStyle(root, '::before').border,
      rootAfter: getComputedStyle(root, '::after').border,
      cardBorder: getComputedStyle(card).border,
      profileButtons: document.querySelectorAll('.workbench__quick-profiles button').length,
      returnButton: !!document.querySelector('.workbench__return')
    }
  })()
  ```

  Expected: `rootBorder` 是 `none`、`rootBoxShadow` 是 `none`、兩個 pseudo-elements 均有細框、卡片邊界仍存在；有 profiles 才會有 1–3 顆快捷按鈕，並且回到桌面藥丸按鈕存在。

- [ ] **Step 4: 檢查選取模組與 reduced-motion 規則**

  在同一 console target 點選：

  ```js
  document.querySelector('[data-workbench-module="look"]')?.click()
  ```

  再確認 `.workbench__focus-link` 出現且 `.workbench__inspector` 可見。使用 DevTools emulate reduced motion 或將 `prefers-reduced-motion` 覆寫後，確認連結與同步標記沒有 animation。

- [ ] **Step 5: 停止隔離 Electron，不封裝、不提交**

  Run:

  ```powershell
  Stop-Process -Id $qa.Id -ErrorAction Stop
  ```

  Expected: 僅停止本任務啟動的 QA PID；不影響使用者現有的 Lucent 執行個體。不要封裝 EXE，因本階段僅修改控制台 UI。
