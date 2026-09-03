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

test('lyric loading prefers the NetEase word-timed YRC response', async () => {
  let legacyCalls = 0
  await withProvider({
    lyric_new: async () => ({ body: {
      yrc: { lyric: '[1000,800](1000,400,0)逐(1400,400,0)字' },
      lrc: { lyric: '[00:01.00]逐字' },
      tlyric: { lyric: '[00:01.00]Word timed' },
    } }),
    lyric: async () => { legacyCalls += 1; return { body: {} } },
  }, async (netease) => {
    assert.deepEqual(await netease.getLyricPair(101), {
      yrc: '[1000,800](1000,400,0)逐(1400,400,0)字',
      lrc: '[00:01.00]逐字',
      trans: '[00:01.00]Word timed',
    })
    assert.equal(legacyCalls, 0)
  })
})

test('lyric loading falls back to legacy LRC when the word-timed endpoint fails', async () => {
  await withProvider({
    lyric_new: async () => { throw new Error('new lyric endpoint unavailable') },
    lyric: async () => ({ body: {
      lrc: { lyric: '[00:02.00]降級歌詞' },
      tlyric: { lyric: '[00:02.00]Fallback lyric' },
    } }),
  }, async (netease) => {
    assert.deepEqual(await netease.getLyricPair(202), {
      yrc: '',
      lrc: '[00:02.00]降級歌詞',
      trans: '[00:02.00]Fallback lyric',
    })
  })
})

test('an empty word-timed response also falls back to legacy LRC', async () => {
  let legacyCalls = 0
  await withProvider({
    lyric_new: async () => ({ body: {} }),
    lyric: async () => {
      legacyCalls += 1
      return { body: { lrc: { lyric: '[00:03.00]仍有歌詞' } } }
    },
  }, async (netease) => {
    assert.deepEqual(await netease.getLyricPair(303), {
      yrc: '',
      lrc: '[00:03.00]仍有歌詞',
      trans: '',
    })
    assert.equal(legacyCalls, 1)
  })
})

test('a no-lyrics track does not repeat the legacy request after fallback', async () => {
  let legacyCalls = 0
  await withProvider({
    lyric_new: async () => { throw new Error('new lyric endpoint unavailable') },
    lyric: async () => { legacyCalls += 1; return { body: {} } },
  }, async (netease) => {
    assert.deepEqual(await netease.getLyricPair(404), { yrc: '', lrc: '', trans: '' })
    assert.equal(legacyCalls, 1)
  })
})
