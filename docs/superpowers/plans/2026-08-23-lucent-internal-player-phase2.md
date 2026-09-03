# 璃音 Lucent 內建音訊服務與來源接管 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在現有 Electron 應用加入不依賴設定視窗存活的網易雲單曲播放服務，並讓房間、桌面網易雲與內建播放器遵守已確認的權威來源順序。

**Architecture:** 主程序建立隱藏的 `#audio-service` Renderer 作為唯一 `<audio>` 擁有者；主程序負責歌曲資料、播放 URL、歌詞與播放仲裁，Renderer 只播放並回報原生 media events。現有 `PlaybackCoordinator` 新增不重送完整歌詞的 clock 更新介面，桌面網易雲開始播放時暫停內建播放器，停止後不自動恢復。

**Tech Stack:** Electron 43.4.1、React 19、HTMLMediaElement、IPC、Node.js `node:test`、Vite 6。

## Global Constraints

- 不把音訊放在控制台或 Overlay；關閉設定視窗不得停止播放。
- 正式 packaged build 預設停用非官方網易雲串流，只有未封裝開發版或 `LUCENT_ALLOW_UNOFFICIAL_NETEASE=1` 才可啟用。
- 不保存、不廣播、不寫日誌任何短效播放 URL。
- 房間成員永遠不能用本機播放器改寫主持人藥丸。
- 桌面網易雲播放時暫停內建播放器；桌面端停止後不自動恢復。
- 時間進度透過 media `timeupdate` 與現有 `room:tick` 傳輸，不每次重送完整歌詞、封面與 state。
- URL 401／403 或 media error 只允許一次重新解析，仍失敗就停止並顯示錯誤。
- 不下載、快取音樂或繞過 VIP／DRM／區域限制。
- 不新增房間音訊串流、歌單資料庫、點歌權限或自動更新；它們屬後續階段。
- 工作區沒有 Git；不得初始化 Git，本階段以測試與實際 Electron smoke 作檢查點。
- 不封裝 EXE。

---

## File Structure

**Create**

- `src/AudioService.jsx`：唯一 HTMLAudioElement、命令執行、原生事件回報及一次重試要求。
- `shared/internalPlayerState.cjs`：純狀態 reducer、歌曲 revision 與 media event 正規化。
- `tests/internalPlayerState.test.cjs`：載入、過期事件、播放／暫停／進度／結束／錯誤測試。
- `tests/audioServiceWiring.test.mjs`：路由、隱藏視窗、IPC 與 UI 接線靜態驗證。
- `tests/electronInternalPlayerSmoke.cjs`：以 data URL 音訊驗證隱藏服務在控制台關閉後仍存活；不呼叫網易雲播放 API。

**Modify**

- `shared/playbackCoordinator.cjs`：新增 `updateClock(source, clock)`，只有播放狀態改變才重新仲裁。
- `tests/playbackCoordinator.test.cjs`：clock 不重送完整 state、暫停內建來源讓桌面來源接管。
- `src/main.jsx`：加入 `audio-service` route。
- `electron/preload.cjs`：加入 player commands、snapshot、事件訂閱及 audio-service report／command。
- `src/overlayBridge.js`：加入非 Electron player fallback。
- `electron/main.cjs`：建立隱藏音訊視窗、內建歌曲載入、Provider gate、音訊事件處理、來源接管及 room tick。
- `src/ConsoleWindow.jsx`：播放頁加入搜尋、單曲播放、控制與來源提示；member 模式禁用控制。
- `src/App.jsx`：藥丸點擊與快捷鍵改呼叫權威 player toggle，不再切換假本地示範狀態。
- `src/styles.css`：補足內建播放搜尋與控制列樣式，不改藥丸外觀。
- `package.json`：把新增自動測試加入 `npm test`。

---

### Task 1: Clock 更新與內建播放純狀態模型

**Files:**

- Modify: `shared/playbackCoordinator.cjs`
- Create: `shared/internalPlayerState.cjs`
- Modify: `tests/playbackCoordinator.test.cjs`
- Create: `tests/internalPlayerState.test.cjs`

**Interfaces:**

- `PlaybackCoordinator.updateClock(source, { positionMs, playing, capturedAt })`。
- `createInternalPlayerState()`。
- `reduceInternalPlayer(state, event)`，event 類型為 `load-start`、`load-ready`、`playing`、`pause`、`time`、`ended`、`error`。

- [ ] **Step 1: 寫入失敗測試**

`tests/playbackCoordinator.test.cjs` 追加：

```js
test('clock updates do not publish a full snapshot while playback state is unchanged', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  const events = []
  coordinator.subscribe((value) => events.push(value))
  coordinator.update(SOURCE.INTERNAL, snap('77', true, 900))
  coordinator.updateClock(SOURCE.INTERNAL, { positionMs: 2500, playing: true, capturedAt: 1000 })
  assert.equal(events.length, 1)
  assert.equal(coordinator.current().positionMs, 2500)
})

test('a playback-state clock change re-runs source arbitration', () => {
  const coordinator = createPlaybackCoordinator({ now: () => 1000 })
  coordinator.update(SOURCE.DESKTOP, snap('22', false, 900))
  coordinator.update(SOURCE.INTERNAL, snap('77', true, 950))
  coordinator.updateClock(SOURCE.INTERNAL, { positionMs: 3000, playing: false, capturedAt: 1000 })
  assert.equal(coordinator.current().source, SOURCE.DESKTOP)
})
```

建立 `tests/internalPlayerState.test.cjs`，驗證：新 revision 清空舊資料、舊 revision event 被忽略、`time` 只更新 clock、`ended` 保留歌曲但停止、error 保存可讀訊息且停止。

- [ ] **Step 2: 確認測試失敗**

Run: `node --test tests/playbackCoordinator.test.cjs tests/internalPlayerState.test.cjs`  
Expected: FAIL，`updateClock` 與 internal state module 尚不存在。

- [ ] **Step 3: 實作 `updateClock`**

在 coordinator 保存 source clock；playing 未變時同步更新 `sources` 與 `selected` 但不呼叫 listeners，playing 改變時呼叫既有 `publish()` 重新仲裁。未知來源或不存在來源時回傳目前 selection，不建立空來源。

- [ ] **Step 4: 實作 internal reducer**

狀態固定包含：

```js
{
  revision: 0,
  trackId: null,
  song: null,
  lines: [],
  timed: false,
  positionMs: 0,
  durationMs: 0,
  playing: false,
  loading: false,
  assetsReady: false,
  urlRetryCount: 0,
  error: '',
}
```

所有非 `load-start` event 都必須帶相同 revision 才能提交。

- [ ] **Step 5: 驗證 Task 1**

Run: `node --test tests/playbackCoordinator.test.cjs tests/internalPlayerState.test.cjs`  
Expected: 全部 PASS。

---

### Task 2: 建立隱藏 Audio Service 與 IPC

**Files:**

- Create: `src/AudioService.jsx`
- Modify: `src/main.jsx`
- Modify: `electron/preload.cjs`
- Modify: `src/overlayBridge.js`
- Modify: `electron/main.cjs`
- Create: `tests/audioServiceWiring.test.mjs`

**Interfaces:**

- UI commands：`player.load(trackId)`、`play()`、`pause()`、`toggle()`、`seek(positionMs)`、`snapshot()`。
- Audio service：`player.onCommand(handler)`、`player.report(event)`。
- Main → service command：`{ type, revision, url?, positionMs? }`。
- Service → main event：`{ type, revision, positionMs?, durationMs?, code?, message? }`。

- [ ] **Step 1: 寫入接線失敗測試**

測試需斷言 `main.jsx` 有 `audio-service` route、主程序有 `audioServiceWin` 且 `show:false`／`backgroundThrottling:false`、preload 有 command/report 通道、AudioService 只有一個 `<audio>` 且沒有視覺 UI。

- [ ] **Step 2: 確認測試失敗**

Run: `node --test tests/audioServiceWiring.test.mjs`  
Expected: FAIL，相關檔案與 IPC 尚不存在。

- [ ] **Step 3: 建立 AudioService**

`AudioService.jsx` 使用一個 `useRef(new Audio())`；effect 註冊 `loadedmetadata`、`playing`、`pause`、`timeupdate`、`ended`、`error`，cleanup 完整移除。收到新 load command 時先 `pause()`、重設 `currentTime=0`、設定 `src`、`load()`，autoplay 時等待 `play()` promise 並回報拒絕。

- [ ] **Step 4: 建立隱藏視窗與 IPC**

主程序 `app.whenReady()` 建立 `audioServiceWin`，route 為 `audio-service`；視窗 `show:false`、`skipTaskbar:true`、`backgroundThrottling:false`，正常關閉由 app quit 管理。所有 player command 在 member 模式回傳 `{ ok:false, error:'目前跟隨房主' }`。

- [ ] **Step 5: 驗證 Task 2**

Run: `node --test tests/audioServiceWiring.test.mjs tests/internalPlayerState.test.cjs`  
Expected: 全部 PASS，Vite build PASS。

---

### Task 3: NetEase 單曲載入、來源接管與 UI

**Files:**

- Modify: `electron/main.cjs`
- Modify: `electron/netease.cjs`
- Modify: `src/ConsoleWindow.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Test: `tests/audioServiceWiring.test.mjs`
- Test: `tests/songSwitch.test.cjs`

**Interfaces:**

- `netease.getPlayableSong(id)` 回傳 `{ detail, url }`，url 不持久化。
- `player:snapshot` 回傳 `{ enabled, reason, source, song, positionMs, durationMs, playing, loading, error }`，不包含 URL。
- `player:changed` 與 `player:tick` 供控制台更新。

- [ ] **Step 1: 寫入 Provider gate、member lock 與接管失敗測試**

測試需覆蓋：packaged 且無明確環境旗標時內建串流 disabled；member command 被拒絕；desktop 由 paused → playing 時發送一次 `pause` 給 audio service；desktop 停止後沒有自動 `play` command。

- [ ] **Step 2: 實作單曲載入**

主程序建立 internal revision，依序取得 detail、LRC／翻譯、歌手頭像與 URL；每個 await 後檢查 revision。先發布 loading snapshot，素材與歌詞完成後發布 ready snapshot，再送 load command。歌曲資訊與歌詞可進 coordinator，URL 只送 audio service。

- [ ] **Step 3: 實作事件與一次 URL 重試**

media `playing`／`pause`／`ended` 更新完整 internal snapshot；`timeupdate` 使用 `updateClock` 並只發 tick。error 在 `urlRetryCount===0` 時重新解析一次同曲 URL；第二次失敗停止並顯示錯誤。

- [ ] **Step 4: 實作桌面接管**

desktop snapshot 變成 playing 且先前 selection 是 internal 時，只送一次 `{type:'pause', reason:'desktop-takeover'}`。後續 desktop pause 不送 play；使用者必須從控制台主動恢復內建歌曲。

- [ ] **Step 5: 實作控制台播放 UI**

PlayTab 加入搜尋框、搜尋結果「播放」按鈕、目前內建歌曲、播放／暫停與進度 Slider。member 模式保留瀏覽但禁用播放控制並顯示「目前跟隨房主」。正式 Provider gate 關閉時顯示原因，不顯示可用的播放按鈕。

- [ ] **Step 6: 實作藥丸控制**

Overlay 點擊與 `Ctrl+Alt+Space` 呼叫 `player.toggle()`；桌面來源或 member 模式由主程序拒絕，不再切換 demo timer 冒充真實播放。

- [ ] **Step 7: 驗證 Task 3**

Run: `npm.cmd test`、`npm.cmd run build`。  
Expected: 全部 PASS；搜尋、載入、接管與 member lock 靜態／純狀態測試皆通過。

---

### Task 4: 實際 Electron 音訊服務 Smoke Test

**Files:**

- Create: `tests/electronInternalPlayerSmoke.cjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: 執行中的 Electron CDP 及 player IPC。
- Produces: 不依賴網易雲授權的音訊服務生命週期證據。

- [ ] **Step 1: 建立 runtime smoke**

Smoke 透過測試專用 IPC 載入短 data URL 音訊，驗證 audio-service target 存在、playing／pause／seek 事件回主程序、關閉控制台後 audio-service target 仍存在。測試 IPC 僅在 `!app.isPackaged && process.env.LUCENT_RUNTIME_QA==='1'` 啟用。

- [ ] **Step 2: 執行完整自動測試與 build**

Run: `npm.cmd test`、`npm.cmd run build`。  
Expected: exit code 0。

- [ ] **Step 3: 重啟 Electron 並執行 smoke**

Run: `LUCENT_RUNTIME_QA=1` 啟動 Electron，再執行 `node tests/electronInternalPlayerSmoke.cjs`。  
Expected: audio service 在 console 關閉後仍存在；事件順序含 load → playing → time → pause；無未處理 promise rejection。

- [ ] **Step 4: 商用邊界掃描**

確認 room payload、Config、log 與 player snapshot 不包含 `url`／`cookie`，packaged build 預設不允許非官方串流。

- [ ] **Step 5: 回報第二階段**

列出測試、build、runtime smoke、未取得官方 Provider 授權因此尚未驗證的真實商用串流項目；不封裝 EXE，繼續帳號安全與歌單階段。

