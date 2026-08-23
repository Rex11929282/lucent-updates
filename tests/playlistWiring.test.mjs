import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const main = read('electron/main.cjs')
const preload = read('electron/preload.cjs')
const bridge = read('src/overlayBridge.js')
const netease = read('electron/netease.cjs')
const consoleSource = read('src/ConsoleWindow.jsx')

test('local playlist CRUD is available only through validated main-process IPC', () => {
  assert.match(main, /createLocalPlaylistStore/)
  for (const channel of ['list', 'create', 'rename', 'delete', 'items', 'add', 'remove', 'move']) {
    assert.match(main, new RegExp(`localPlaylist:${channel}`))
    assert.match(preload, new RegExp(`localPlaylist:${channel}`))
  }
  assert.match(bridge, /localPlaylists/)
})

test('NetEase playlists are read-only provider calls and fixed REAL_IP is absent', () => {
  assert.match(netease, /async function getUserPlaylists/)
  assert.match(netease, /async function getPlaylistTracks/)
  assert.doesNotMatch(netease, /REAL_IP/)
  assert.match(main, /netease:userPlaylists/)
  assert.match(main, /netease:playlistTracks/)
})

test('settings UI separates cloud playlists from Lucent local playlists', () => {
  assert.match(consoleSource, /網易雲歌單/)
  assert.match(consoleSource, /璃音本機歌單/)
  assert.match(consoleSource, /localPlaylists/)
  assert.doesNotMatch(consoleSource, /修改網易雲歌單|刪除網易雲歌單/)
})
