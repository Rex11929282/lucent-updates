# 璃音 Lucent：歌詞填色、粒子重組與設定精簡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修復流動填色、粒子重組與透明模式唱片頭像，並從設定 UI 移除備用歌詞及液態玻璃參數，只保留移出的「滑鼠彈性」。

**Architecture:** 歌詞進度仍以網易雲鏡像列及真實 YRC/LRC 時間為來源；Renderer 只把進度轉成逐字樣式，不用計時器偽造唱速。粒子過場維持既有單一裁切 Canvas，藉由較密的有限粒子、終段覆蓋與內容漸顯達成「粒子凝聚成藥丸」，不建立額外全螢幕畫布。

**Tech Stack:** Electron 43、React 19、Vite 6、Node test runner、CSS custom properties、Canvas 2D。

## Global Constraints

- 只改本計畫列出的檔案；不要重設、清理、格式化或覆蓋現有工作區的其他變更。
- 不重寫外觀架構、不加相依套件、不新增遊戲功能、不封裝 EXE。
- 移除 UI 不等於清除設定：`glass` 既有欄位及現有值必須繼續從設定檔讀取並套用。
- 液態玻璃細節區整段移除；僅把 `glass.elasticity` 保留並顯示為「滑鼠彈性」。
- 備用歌詞與「桌面」背景來源不再有可見設定入口；舊設定可載入，`backdrop: 'desktop'` 必須安全回退到 `cover`。
- 歌詞不得用隨機值或牆鐘預估唱速；伴奏空檔必須保持當前句 100% 填色，直到鏡像列身分真的改變。
- 粒子數量必須有上限，且轉場結束以前不得讓完整新藥丸突然顯現。
- 此工作區沒有 Git repository；不要加入 commit 步驟。

---

## File Map

- `src/ConsoleWindow.jsx` — 外觀工作檯設定：移除兩個區塊，將滑鼠彈性放進既有滑鼠互動控制。
- `shared/stateMigration.cjs` — 載入舊設定時淘汰 `desktop` 背景來源，不影響其他 `glass` 值。
- `src/songDisplay.js` — 純函式：保留無新比率時已完成的流動填色，並把填色進度分配到逐字節點。
- `src/App.jsx` — 鏡像歌詞進度：只有取得同一列的有效新填色比率才覆寫 `lyricFillRef`。
- `src/components/Capsule.jsx` — 流動填色採逐字節點、透明模式尊重 `showVinyl`、不再以整段矩形偽覆蓋。
- `src/styles.css` — 移除 `.lyrics__txt::after` 整段遮罩；用每個 `.kchar` 的漸層填色；粒子重組期間內容漸顯。
- `src/songTransition.js` — 有限且較密的粒子佈局、連續的散開／凝聚曲線與較慢的重組時長。
- `src/components/SongTransitionLayer.jsx` — 將每次過場粒子數固定為安全高密度值，完成繪製兩個 animation frame 後才通知轉場結束。
- `tests/retiredAppearanceSettings.test.mjs`、`tests/stateMigration.test.cjs`、`tests/songDisplay.test.mjs`、`tests/songTransition.test.mjs` — 回歸測試。

---

### Task 1: 移除備用歌詞與液態玻璃參數 UI，搬移滑鼠彈性

**Files:**

- Modify: `src/ConsoleWindow.jsx:175-183, 236-249, 1002-1030, 1472-1475, 1558-1593`
- Modify: `shared/stateMigration.cjs:44-65`
- Test: `tests/retiredAppearanceSettings.test.mjs`
- Test: `tests/stateMigration.test.cjs`

**Interfaces:**

- Consumes: `setGlass(partialGlass)`, `setCfg(partialCfg)`, `migrateState(raw, schema)`.
- Produces: 唯一可見的玻璃值控制 `Slider label="滑鼠彈性"`；舊 `cfg.backdrop === 'desktop'` 載入後成為 `schema.cfg.backdrop`。

- [ ] **Step 1: 寫出失敗的設定 UI 測試。**

  在 `tests/retiredAppearanceSettings.test.mjs` 新增：

  ```js
  test('liquid glass and fallback lyric panels are removed while mouse elasticity remains', () => {
    const consoleWindow = read('src/ConsoleWindow.jsx')
    assert.doesNotMatch(consoleWindow, /進階：液態玻璃參數/)
    assert.doesNotMatch(consoleWindow, /備用歌詞（沒偵測到網易雲時）/)
    assert.doesNotMatch(consoleWindow, /value="desktop"/)
    assert.doesNotMatch(consoleWindow, /Slider label="Elasticity"/)
    assert.match(consoleWindow, /Slider label="滑鼠彈性"[\s\S]*setGlass\(\{ elasticity: v \}\)/)
  })
  ```

- [ ] **Step 2: 寫出失敗的舊設定遷移測試。**

  在 `tests/stateMigration.test.cjs` 新增：

  ```js
  test('legacy desktop backdrop safely falls back without changing saved glass values', () => {
    const result = migrateState({
      cfg: { backdrop: 'desktop' },
      glass: { elasticity: 0.75, blurAmount: 0.2 },
    }, schema)

    assert.equal(result.cfg.backdrop, schema.cfg.backdrop)
    assert.equal(result.glass.elasticity, 0.75)
    assert.equal(result.glass.blurAmount, 0.2)
  })
  ```

- [ ] **Step 3: 驗證新測試確實失敗。**

  Run:

  ```powershell
  node --test tests/retiredAppearanceSettings.test.mjs tests/stateMigration.test.cjs
  ```

  Expected: FAIL，原因是目前仍存在兩個 Section、英文 `Elasticity` 與 `desktop` 選項。

- [ ] **Step 4: 做最小 UI 與遷移修改。**

  在 `src/ConsoleWindow.jsx`：

  ```jsx
  // 放在「滑鼠 3D 傾斜」與「滑鼠感應距離」相鄰的位置。
  <Slider label="滑鼠彈性" value={glass.elasticity} min={0} max={1} step={0.05}
    onChange={(v) => setGlass({ elasticity: v })} fmt={(v) => v.toFixed(2)} />
  ```

  然後完整移除：

  ```jsx
  <Section title="⚙ 進階：液態玻璃參數" ...>...</Section>
  <Section title="📄 備用歌詞（沒偵測到網易雲時）">...</Section>
  ```

  同時移除已因上述區塊失去用途的 `GLASS_DEFAULTS`、`setLyricsRaw`、`onLyricFile`、`FileReader` 路徑與向 `LiquidWorkbench` / `LookTab` 傳遞的同名 prop；不可移除 `state.glass` 或 `setGlass`。

  在 `shared/stateMigration.cjs` 的 `sanitizeCfg` 中，保留所有既有 `glass` 合併值並加上唯一的舊值處理：

  ```js
  if (result.backdrop === 'desktop') result.backdrop = defaults.backdrop || 'cover'
  ```

- [ ] **Step 5: 驗證設定與遷移測試通過。**

  Run:

  ```powershell
  node --test tests/retiredAppearanceSettings.test.mjs tests/stateMigration.test.cjs
  ```

  Expected: PASS。

---

### Task 2: 讓流動填色逐字推進並在伴奏空檔保持完成

**Files:**

- Modify: `src/songDisplay.js:60-130`
- Modify: `src/App.jsx:226-236`
- Modify: `src/components/Capsule.jsx:34-81, 332-340`
- Modify: `src/styles.css:330-365`
- Test: `tests/songDisplay.test.mjs`

**Interfaces:**

- Add: `applyFlowFillStyles(element, ratio, text) -> number`，將 `--flow-fill` 寫到每個已渲染的 `.kchar`。
- Add: `holdFlowFillRatio(previous, next) -> number`，`next` 不是有限數字時保留 `previous`。
- Consumes: `mirrorFlowFillRatio(...)`、`lyricLineIdentity(...)`、`lyricFillRef`。
- Produces: 同一文字即使自動換行，填色只依字元次序前進；新列身分改變時既有 `useLayoutEffect` 仍重設為 0。

- [ ] **Step 1: 寫出失敗的逐字填色與伴奏空檔測試。**

  在 `tests/songDisplay.test.mjs` 新增：

  ```js
  test('flow fill assigns colour in character order instead of one rectangular text overlay', () => {
    const fills = []
    const element = {
      children: Array.from({ length: 4 }, () => ({
        style: { setProperty: (_, value) => fills.push(value) },
      })),
    }

    songDisplay.applyFlowFillStyles(element, 0.5, 'ABCD')
    assert.deepEqual(fills, ['100.00%', '100.00%', '0.00%', '0.00%'])
  })

  test('flow fill remains complete while the active mirrored lyric has an instrumental gap', () => {
    assert.equal(songDisplay.holdFlowFillRatio(1, null), 1)
    assert.equal(songDisplay.holdFlowFillRatio(1, undefined), 1)
    assert.equal(songDisplay.holdFlowFillRatio(1, 0.25), 0.25)
  })
  ```

  將既有 CSS 原始碼測試改成斷言沒有 `.lyrics__txt::after` 和 `content: attr(data-lyric)`，並斷言存在 `.highlight-fill .kchar`。

- [ ] **Step 2: 驗證新測試確實失敗。**

  Run:

  ```powershell
  node --test tests/songDisplay.test.mjs
  ```

  Expected: FAIL，原因是兩個 helper 尚未匯出，且目前仍用 `::after` 整段覆蓋文字。

- [ ] **Step 3: 寫出最小純函式實作。**

  在 `src/songDisplay.js` 加入：

  ```js
  export function holdFlowFillRatio(previous, next) {
    if (!Number.isFinite(next)) return Math.max(0, Math.min(1, Number(previous) || 0))
    return Math.max(0, Math.min(1, next))
  }

  export function applyFlowFillStyles(element, ratio, text) {
    if (!element) return 0
    const total = Math.max(1, Array.from(text || '').length)
    const exact = Math.max(0, Math.min(1, Number(ratio) || 0)) * total
    Array.from(element.children || []).forEach((child, index) => {
      const fill = Math.max(0, Math.min(1, exact - index))
      child.style.setProperty('--flow-fill', `${(fill * 100).toFixed(2)}%`)
    })
    return exact
  }
  ```

- [ ] **Step 4: 接上真實鏡像資料與 Renderer。**

  在 `src/App.jsx` 將鏡像分支改成先算候選值再保留最後有效值：

  ```js
  const fillRatio = mirrorFlowFillRatio({
    lines,
    mirrorText: m.text,
    mirrorIndex: m.i,
    position: posSec,
  })
  lyricFillRef.current = holdFlowFillRatio(lyricFillRef.current, fillRatio)
  ```

  在 `Capsule.jsx`：

  ```jsx
  const needsCharacterSpans = characterHighlight || fillHighlight
  // ...
  {needsCharacterSpans
    ? Array.from(text).map((character, index) => (
      <span className="kchar" key={index}>{character === ' ' ? ' ' : character}</span>
    ))
    : text}
  ```

  `fillHighlight` 更新時呼叫 `applyFlowFillStyles(txtRef.current, roundedFill, text)`；只在 `characterHighlight` 時呼叫 `applyKaraokeClasses`。

  在 `src/styles.css` 刪除 `.lyrics__cur.highlight-fill .lyrics__txt::after`。改為每個 `.kchar` 的文字漸層，底色必須一路使用 `--lyric-fill-base`，高亮部分使用 `--glow`；不可使用黑色或透明背景作為未填色。

- [ ] **Step 5: 驗證歌詞測試通過。**

  Run:

  ```powershell
  node --test tests/songDisplay.test.mjs
  ```

  Expected: PASS。

---

### Task 3: 修正透明模式關閉唱片頭像無效

**Files:**

- Modify: `src/components/Capsule.jsx:41-43`
- Test: `tests/songDisplay.test.mjs`

**Interfaces:**

- Consumes: `cfg.showVinyl`。
- Produces: 所有外觀模式均由同一個 `showVinyl` 開關決定是否渲染 `.vinyl`。

- [ ] **Step 1: 寫出失敗的 Renderer 接線測試。**

  在 `tests/songDisplay.test.mjs` 新增：

  ```js
  test('transparent appearance respects the vinyl toggle', () => {
    assert.match(capsuleSource, /const showVinyl = !!cfg\.showVinyl/)
    assert.doesNotMatch(capsuleSource, /isAvatar \|\| !!cfg\.showVinyl/)
  })
  ```

- [ ] **Step 2: 驗證測試失敗。**

  Run:

  ```powershell
  node --test tests/songDisplay.test.mjs
  ```

  Expected: FAIL，因目前透明模式以 `isAvatar || !!cfg.showVinyl` 強制顯示頭像。

- [ ] **Step 3: 寫入最小修正。**

  在 `Capsule.jsx` 改為：

  ```js
  const showVinyl = !!cfg.showVinyl
  ```

  保留 `isAvatar` 作為背景材質判斷，不再把它當作顯示唱片的隱性條件。

- [ ] **Step 4: 驗證測試通過。**

  Run:

  ```powershell
  node --test tests/songDisplay.test.mjs
  ```

  Expected: PASS。

---

### Task 4: 提升粒子密度並讓新藥丸在凝聚中漸顯

**Files:**

- Modify: `src/songTransition.js:5-31, 33-80`
- Modify: `src/components/SongTransitionLayer.jsx:89-154`
- Modify: `src/styles.css` 的 `.content--shatter-in` / `particleContentIn` 規則
- Test: `tests/songTransition.test.mjs`

**Interfaces:**

- Consumes: `createShatterParticles({ width, height, seed, count })`、`particleMotion(amount, rebuilding)`、`onInFinished()`。
- Produces: 每次轉場使用 112 個粒子、最多 128 個；散開與凝聚使用同一隨機 seed 的軌跡；新內容僅在粒子已開始收攏時漸顯。

- [ ] **Step 1: 寫出失敗的粒子密度與完成時序測試。**

  在 `tests/songTransition.test.mjs` 調整／新增：

  ```js
  test('particle layout permits dense but bounded reconstruction coverage', () => {
    const particles = createShatterParticles({ width: 320, height: 92, seed: 3, count: 200 })
    assert.equal(particles.length, 128)
    assert.ok(particleMotion(1, true).opacity >= 0.98)
    assert.ok(particleMotion(1, true).radiusScale > 1)
  })

  test('particle reconstruction runs longer than the outward shatter at normal speed', () => {
    assert.equal(particleTransitionDuration('shatter-out', 1), 1000)
    assert.equal(particleTransitionDuration('shatter-in', 1), 1200)
  })

  test('transition layer uses bounded dense particles and delays completion past its final paint', async () => {
    const layer = await readFile(new URL('../src/components/SongTransitionLayer.jsx', import.meta.url), 'utf8')
    assert.match(layer, /count: 112/)
    assert.match(layer, /completionRef/)
  })
  ```

- [ ] **Step 2: 驗證測試失敗。**

  Run:

  ```powershell
  node --test tests/songTransition.test.mjs
  ```

  Expected: FAIL，因目前上限為 72、重組時長為 850ms，且完成回呼在最終 draw 當幀執行。

- [ ] **Step 3: 寫出最小粒子與完成時序實作。**

  在 `songTransition.js` 使用：

  ```js
  return (phase === 'shatter-out' ? 1000 : 1200) / safeSpeed
  // total: Math.max(16, Math.min(128, Math.round(Number(count) || 16)))
  ```

  讓 `particleMotion(1, true)` 回到完整不透明且略大於原單元的半徑；`particleMotion(0, true)` 必須與散開結束時的半徑與透明度連續，避免切相瞬間閃爍。

  在 `SongTransitionLayer.jsx`：

  ```js
  const completionRef = useRef(0)
  // createShatterParticles({ ..., count: 112 })
  // amount === 1 時：連續排兩次 requestAnimationFrame，第二次才呼叫 onInFinished。
  ```

  取消 effect 時必須取消 `animationRef` 和 `completionRef`。不可增加每粒子 timer、不可新增第二個 Canvas。

  在 CSS 將 `.content--shatter-in` 的透明度從重組中後段開始平滑提升至 1；重組起始與中段保持 0，避免新封面直接跳出。Canvas 粒子仍在上層，直到 `onInFinished` 才回到正常藥丸。

- [ ] **Step 4: 驗證粒子測試通過。**

  Run:

  ```powershell
  node --test tests/songTransition.test.mjs
  ```

  Expected: PASS。

---

### Task 5: 整合驗證與實際 Overlay 檢查

**Files:**

- Verify only: `src/App.jsx`, `src/components/Capsule.jsx`, `src/components/SongTransitionLayer.jsx`, `src/ConsoleWindow.jsx`
- Test: `tests/retiredAppearanceSettings.test.mjs`, `tests/stateMigration.test.cjs`, `tests/songDisplay.test.mjs`, `tests/songTransition.test.mjs`

- [ ] **Step 1: 執行聚焦回歸測試。**

  Run:

  ```powershell
  node --test tests/retiredAppearanceSettings.test.mjs tests/stateMigration.test.cjs tests/songDisplay.test.mjs tests/songTransition.test.mjs
  ```

  Expected: PASS，且沒有新增 console warning。

- [ ] **Step 2: 建置 Renderer。**

  Run:

  ```powershell
  npm.cmd run build
  ```

  Expected: Vite build 成功。若失敗，先修正本計畫造成的錯誤；不要以重設其他變更來取得綠燈。

- [ ] **Step 3: 實機檢查。**

  在開啟網易雲歌詞頁的情況下檢查：

  1. 將一個長句自動換成兩行，確認流動填色按字順序進入第二行。
  2. 選有句尾伴奏的歌曲，確認已唱完的當句保持完整填色，直到網易雲高亮換列。
  3. 設為透明模式並關閉「唱片頭像」，確認唱片與封面完全不渲染。
  4. 選粒子破碎，換歌時確認舊藥丸慢慢散開；新封面／頭像 ready 前沒有新藥丸憑空出現；後續粒子凝聚並帶出新藥丸。
  5. 開啟設定，確認不存在液態玻璃細節、桌面折射來源和備用歌詞；「滑鼠彈性」位於滑鼠互動附近，調整後仍立即影響藥丸互動。

- [ ] **Step 4: 記錄限制。**

  若沒有網易雲實際高亮列或 YRC/LRC 時間戳，流動填色應保持原文／最後已確認狀態，不得自行推測唱速。粒子過場是有限粒子 Canvas，不是音訊驅動特效。

## Self-review

- Coverage: 任務 1 覆蓋 UI 移除、滑鼠彈性搬移與 `desktop` 舊設定；任務 2 覆蓋雙行流動填色與伴奏空檔；任務 3 覆蓋透明模式頭像；任務 4 覆蓋多粒子慢速散開／重組與不憑空出現；任務 5 覆蓋測試、建置與真實 Overlay。
- No-placeholder check: 每個任務均列出檔案、失敗測試、命令、最小實作與驗收結果。
- Type consistency: `applyFlowFillStyles`、`holdFlowFillRatio`、`completionRef` 與「滑鼠彈性」名稱在所有任務中一致。
