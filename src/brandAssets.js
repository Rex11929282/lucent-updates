// 璃音自己的美術資源。
//
// 封面與唱片頭像是兩種完全不同的用途：封面是方形、當藥丸底材被玻璃模糊；
// 頭像是圓形、會跟著唱片旋轉，而且實際只有 40~50px。
// 以前兩邊共用同一張 promo 圖，縮到唱片大小就只剩一團看不出是什麼的色塊，
// 所以拆成兩張各自為用途設計的圖。
//
// 一定要用 import 而不是寫死 '/xxx.svg'：
// 專案 base 是 './'，打包後是用 file:// 開的。JS 裡的字串 Vite 不會改寫，
// '/lucent-avatar.svg' 會被瀏覽器解讀成 file:///D:/lucent-avatar.svg，
// 圖就永遠載不到（舊的唱片頭像看起來是一團糊，就是這個原因）。
import coverAsset from './assets/lucent-cover.svg'
import avatarAsset from './assets/lucent-avatar.png'

export const LUCENT_COVER_ASSET = coverAsset
export const LUCENT_AVATAR_ASSET = avatarAsset
