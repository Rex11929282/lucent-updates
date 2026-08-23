const test = require('node:test')
const assert = require('node:assert/strict')

const api = require('NeteaseCloudMusicApi')
const modulePath = require.resolve('../electron/netease.cjs')

async function withProvider(stubs, run) {
  const originals = {}
  for (const [name, stub] of Object.entries(stubs)) {
    originals[name] = api[name]
    api[name] = stub
  }
  delete require.cache[modulePath]
  const netease = require(modulePath)
  try { return await run(netease) }
  finally {
    for (const [name, original] of Object.entries(originals)) api[name] = original
    delete require.cache[modulePath]
  }
}

test('user playlists expose only the read-only fields used by Lucent', async () => {
  let request = null
  await withProvider({
    user_playlist: async (options) => {
      request = options
      return { body: { playlist: [{
        id: 12, name: '我的最愛', coverImgUrl: 'https://example.test/list.jpg', trackCount: 8,
        creator: { nickname: '使用者' }, subscribed: false, ignoredSecret: 'must-not-leak',
      }] } }
    },
  }, async (netease) => {
    netease.setCookie('private-cookie')
    const playlists = await netease.getUserPlaylists(99)
    assert.deepEqual(playlists, [{
      id: 12, name: '我的最愛', cover: 'https://example.test/list.jpg', trackCount: 8,
      creator: '使用者', subscribed: false,
    }])
    assert.equal(request.uid, 99)
    assert.equal(request.cookie, 'private-cookie')
    assert.equal(Object.hasOwn(request, 'realIP'), false)
  })
})

test('playlist tracks use the same safe song metadata mapping as search and playback', async () => {
  await withProvider({
    playlist_track_all: async () => ({ body: { songs: [{
      id: 163, name: '歌曲', ar: [{ id: 7, name: '歌手' }], al: { name: '專輯', picUrl: 'https://example.test/cover.jpg' }, dt: 321000,
    }] } }),
  }, async (netease) => {
    assert.deepEqual(await netease.getPlaylistTracks(55), [{
      id: 163, name: '歌曲', artist: '歌手', artistId: 7, album: '專輯',
      cover: 'https://example.test/cover.jpg', durationMs: 321000,
    }])
  })
})
