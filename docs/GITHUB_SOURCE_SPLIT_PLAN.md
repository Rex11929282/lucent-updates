# GitHub 原始碼與自動更新單一倉庫方案

## 目前狀態

- [`Rex11929282/lucent-updates`](https://github.com/Rex11929282/lucent-updates) 是唯一的公開倉庫。
- 同一個倉庫保存完整原始碼、Git 歷史、文件與 GitHub Release 更新資產。
- 已刪除舊的純二進位更新倉庫，不再維護 `lucent-source`／`lucent-updates` 雙倉庫。
- 原始碼倉庫接管既有 `lucent-updates` 名稱，因此已安裝版本不需要更換更新網址。

## 驗證結果

- `lucent-updates`: `public`，預設分支是 `main`，包含 `package.json` 與 `src/`。
- 帳號下只剩一個以 `lucent` 開頭的倉庫。
- `v1.1.0`: 非 draft、非 prerelease，包含 NSIS 安裝器、`.blockmap` 與 `latest.yml`。
- 遠端安裝器大小 `117,971,881` bytes，SHA-256 為 `29bde3915d0ea99f4795c6bbd855d38e88525a9619096a5e4ce64c97f7135809`。
- `latest.yml` 可由公開 HTTPS 更新網址下載，SHA-256 為 `764cba4da495ee16363717d0afb6689b6cc6b3915f18ddd6a4df3deee0580603`。
- 封裝後的更新設定仍使用 `owner: Rex11929282`、`repo: lucent-updates`。

## 遷移方式

1. 先確認兩個倉庫的 v1.1.0 三項資產名稱、大小與 SHA-256 完全一致。
2. 將原始碼倉庫設為公開，並保留完整 Git 歷史及 Release。
3. 讓原始碼倉庫接管 `lucent-updates` 名稱，維持既有安裝版的更新端點。
4. 驗證公開原始碼、Release 與 `latest.yml` 後，刪除退役的純更新倉庫。

## 後續維護注意

- 原始碼、測試、文件與新 Release 全部推送到同一個 `lucent-updates` 倉庫。
- 每次 Release 仍須上傳同次建置產生的安裝器、對應 `.blockmap` 與 `latest.yml`。
- 不要把 GitHub Token、帳號密碼或簽章憑證提交到原始碼或 Release。
