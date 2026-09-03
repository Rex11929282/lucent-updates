# GitHub 原始碼與自動更新拆分方案

## 已完成的拆分

- 原本含有完整原始碼的倉庫已改名為 [`Rex11929282/lucent-source`](https://github.com/Rex11929282/lucent-source)，並設定為 Private；原始碼歷史保留。
- 已重新建立公開 [`Rex11929282/lucent-updates`](https://github.com/Rex11929282/lucent-updates)，根目錄只保留更新站說明 README。
- 公開更新站的 `v1.1.0` Release 只包含 NSIS 安裝器、`.blockmap` 與 `latest.yml`。
- 已安裝版本的 `app-update.yml` 仍指向固定名稱 `Rex11929282/lucent-updates`，因此不需要更換更新網址。

## 驗證結果

- `lucent-source`: `private=true`。
- `lucent-updates`: `private=false`，根目錄只有 `README.md`。
- `v1.1.0`: 非 draft、非 prerelease，資產名稱與本機一致。
- 遠端安裝器大小 `117,971,881` bytes，SHA-256 與本機一致。
- 遠端 blockmap 與 `latest.yml` SHA-256、大小與本機一致。
- 遠端 `latest.yml` 內容與本機一致。
- 封裝後的更新設定仍使用 `owner: Rex11929282`、`repo: lucent-updates`。

## 不採用的做法

- 不在目前公開倉庫新增一個刪除原始碼的 commit：Git 歷史仍公開，不能達到閉源目的。
- 不把 GitHub Token 放入安裝器：公開使用者無法安全共用私人 Release 憑證。
- 不在沒有新的公開 feed 前直接把現有倉庫設為 Private：這會讓目前已安裝版本無法讀取更新。

## 後續維護注意

- 新版本仍只把安裝器、對應 `.blockmap` 與 `latest.yml` 上傳到 `lucent-updates`。
- 原始碼、測試與開發文件只推送到私有 `lucent-source`。
- 不要把私人倉庫憑證放入安裝器或公開更新資產。
