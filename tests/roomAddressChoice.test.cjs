const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { getLanIp, listLanIps } = require('../electron/room.cjs')

// A machine with a VPN adapter has more than one usable address. Whichever one
// is picked automatically is wrong for half the situations, so the host has to
// be able to choose. This suite pins that behaviour down.
const IFACES = {
  'Radmin VPN': [{ family: 'IPv4', internal: false, address: '26.233.18.34' }],
  '乙太網路': [{ family: 'IPv4', internal: false, address: '192.168.1.103' }],
  'Loopback': [{ family: 'IPv4', internal: true, address: '127.0.0.1' }],
}

test('列出所有可用位址，並標示是區網還是 VPN', () => {
  const list = listLanIps(IFACES)
  assert.equal(list.length, 2, '內部介面不該列進來')
  assert.deepEqual(list.map((e) => e.address), ['26.233.18.34', '192.168.1.103'])
  assert.deepEqual(list.map((e) => e.kind), ['radmin', 'lan'])
  assert.deepEqual(list.map((e) => e.adapter), ['Radmin VPN', '乙太網路'])
})

test('沒指定時維持原本的自動順序，不改變既有行為', () => {
  assert.equal(getLanIp(IFACES), '26.233.18.34')
})

test('主持人選了哪個就用哪個', () => {
  // 這是重點：同區網的朋友需要 192.168.x，選了就不能被自動排序蓋掉
  assert.equal(getLanIp(IFACES, '192.168.1.103'), '192.168.1.103')
  assert.equal(getLanIp(IFACES, '26.233.18.34'), '26.233.18.34')
})

test('選了一個已經不存在的位址時安全回退', () => {
  // 例如拔掉網路線或關掉 VPN 之後
  assert.equal(getLanIp(IFACES, '10.0.0.5'), '26.233.18.34')
})

test('完全沒有對外介面時回退到 loopback', () => {
  assert.equal(getLanIp({ Loopback: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }] }), '127.0.0.1')
  assert.deepEqual(listLanIps({}), [])
})

test('複製鈕永遠可以按，並且會把選到的位址交給房間', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'ConsoleWindow.jsx'), 'utf8')
  // 之前 myIp 還沒回來時按鈕是 disabled，使用者只會看到一顆按不動的按鈕
  assert.doesNotMatch(source, /disabled=\{!myIp\}/, '複製鈕不該因為位址還沒偵測到就停用')
  assert.match(source, /const copyRoomAddress = async \(\) => \{/)
  assert.match(source, /ip = await ov\.room\.lanIp\(\)/, '按下去當下要能補抓位址')
  assert.match(source, /advertiseIp: myIp/, '開房時要公告主持人選的位址')
  assert.match(source, /ov\.room\.lanIps\(\)/, '要列出所有可用位址供選擇')
})

test('複製後有明確回饋，而且回饋本身也會跟著語言走', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'ConsoleWindow.jsx'), 'utf8')
  assert.match(source, /message: t\('room\.copiedAddress', \{ address \}\)/)
  assert.match(source, /message: t\('room\.copyFailed'\)/)
  assert.match(source, /message: t\('room\.noAddress'\)/)
  // 複製成功的訊息要帶出實際位址，使用者才知道複製到什麼
  const en = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'locales', 'en-US.json'), 'utf8'))
  assert.match(en['room.copiedAddress'], /\{address\}/)
})

test('主行程與 preload 都把新的查詢接出去', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')
  const preload = fs.readFileSync(path.join(__dirname, '..', 'electron', 'preload.cjs'), 'utf8')
  assert.match(main, /ipcMain\.handle\('room:lanips'/)
  assert.match(preload, /lanIps: \(\) => ipcRenderer\.invoke\('room:lanips'\)/)
})
