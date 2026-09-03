# 璃音 Lucent 房間點歌與權限 Implementation Plan

**Goal:** 讓房間成員可提交點歌，主持人保持唯一播放權威，並可逐人授予佇列管理或播放控制權。

**Architecture:** WebSocket 房間協議升級為 version 2。每個命令帶 `commandId`，主持人端去重並依能力驗證；佇列由主持人主程序維護、存入 SQLite，再以完整 snapshot 廣播。成員只送命令，不直接產生播放狀態。

## Constraints

- 預設成員只有 `song.request`；`queue.manage`、`playback.control` 由主持人逐人授權。
- Cookie、歌曲播放 URL、資料庫路徑不得進入任何房間封包。
- 房主仍是唯一播放來源；成員命令成功後由房主播放器執行。
- 點歌限流：10 秒最多 3 次、每人最多 5 筆未處理請求。
- 不做成員端音訊同步、不封裝 EXE、不加入遊戲功能。

## Tasks

1. 建立能力判斷、命令去重與點歌限流純函式測試。
2. SQLite schema 升級至 v2，加入房間佇列與排序／狀態操作。
3. 擴充 Room v2 協議：命令、結果、能力、佇列 snapshot、重連同步。
4. 主程序接線：驗證點歌、主持人播放、移除／排序、授權與撤銷。
5. Preload、bridge、useRoom 與繁中 UI：成員點歌、房主佇列與逐人權限。
6. 執行單元、WebSocket 整合、完整 Build 與雙實例 runtime smoke。
