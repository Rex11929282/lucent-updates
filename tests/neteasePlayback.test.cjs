const test = require('node:test')
const assert = require('node:assert/strict')

const { getSongUrl } = require('../electron/netease.cjs')
const { PLAYER_ERROR_CODES } = require('../shared/playerErrors.cjs')
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

test('song URL lookup falls back to a playable lower quality', async () => {
  const levels = []
  const selected = await getSongUrl('123', {
    apiClient: {
      song_url_v1: async ({ id, level }) => {
        levels.push({ id, level })
        return {
          body: {
            data: [{ id: Number(id), code: level === 'standard' ? 200 : 404, url: level === 'standard' ? 'https://music.example/song.mp3' : '' }],
          },
        }
      },
    },
  })

  assert.equal(selected, 'https://music.example/song.mp3')
  assert.deepEqual(levels.map((entry) => entry.level), ['exhigh', 'higher', 'standard'])
})

test('song URL lookup ignores invalid response URLs and returns empty when every level is unavailable', async () => {
  const selected = await getSongUrl('123', {
    apiClient: {
      song_url_v1: async () => ({ body: { data: [{ code: 404, url: 'not-a-url' }] } }),
    },
  })

  assert.equal(selected, '')
})

test('song URL lookup falls back to the legacy endpoint when v1 returns no source', async () => {
  const calls = []
  const selected = await getSongUrl('456', {
    apiClient: {
      song_url_v1: async ({ level }) => {
        calls.push(`v1:${level}`)
        return { body: { data: [{ code: 404, url: '' }] } }
      },
      song_url: async ({ id }) => {
        calls.push(`legacy:${id}`)
        return { body: { data: [{ id: Number(id), url: 'http://music.example/legacy.mp3' }] } }
      },
    },
  })

  assert.equal(selected, 'http://music.example/legacy.mp3')
  assert.deepEqual(calls, ['v1:exhigh', 'v1:higher', 'v1:standard', 'legacy:456'])
})

test('playable song rejects missing metadata even when an orphan URL is returned', async () => {
  await withProvider({
    song_detail: async () => ({ body: { songs: [] } }),
    song_url_v1: async () => ({ body: { data: [{ url: 'https://music.example/orphan.mp3' }] } }),
  }, async (netease) => {
    const playable = await netease.getPlayableSong('missing-detail-901001')
    assert.equal(playable.detail, null)
    assert.equal(playable.url, 'https://music.example/orphan.mp3')
    assert.equal(playable.errorCode, PLAYER_ERROR_CODES.NO_PLAYABLE_SOURCE)
  })
})
