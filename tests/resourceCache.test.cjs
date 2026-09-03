const test = require('node:test')
const assert = require('node:assert/strict')

const { createAsyncResourceCache } = require('../shared/resourceCache.cjs')

test('resource cache reuses completed values and one in-flight request', async () => {
  let calls = 0
  const cache = createAsyncResourceCache({ ttlMs: 1000 })
  const loader = async () => { calls += 1; return 'artwork.jpg' }
  const [first, second] = await Promise.all([cache.get('track', loader), cache.get('track', loader)])
  assert.equal(first, 'artwork.jpg')
  assert.equal(second, 'artwork.jpg')
  assert.equal(await cache.get('track', loader), 'artwork.jpg')
  assert.equal(calls, 1)
})

test('invalid resources and timeouts fail without becoming successful cache hits', async () => {
  const cache = createAsyncResourceCache({ timeoutMs: 15, failureTtlMs: 10 })
  await assert.rejects(() => cache.get('bad', async () => 'javascript:bad', {
    validate: (value) => /^https:/.test(value),
  }), /invalid resource/i)
  await assert.rejects(() => cache.get('slow', () => new Promise(() => {})), /timed out/i)
})

test('cache remains bounded and exposes cleanup', async () => {
  const cache = createAsyncResourceCache({ maxEntries: 2 })
  await cache.get('a', async () => 'a')
  await cache.get('b', async () => 'b')
  await cache.get('c', async () => 'c')
  assert.equal(cache.size(), 2)
  cache.clear()
  assert.equal(cache.size(), 0)
})

test('cache refreshes a recently used resource before bounded eviction', async () => {
  const calls = { a: 0, b: 0, c: 0 }
  const cache = createAsyncResourceCache({ maxEntries: 2 })
  const load = (key) => async () => { calls[key] += 1; return key }

  await cache.get('a', load('a'))
  await cache.get('b', load('b'))
  await cache.get('a', load('a'))
  await cache.get('c', load('c'))

  assert.equal(await cache.get('a', load('a')), 'a')
  assert.equal(calls.a, 1)
  assert.equal(await cache.get('b', load('b')), 'b')
  assert.equal(calls.b, 2)
})

test('clearing the cache prevents an older in-flight result from being stored again', async () => {
  let resolveOld
  let calls = 0
  const cache = createAsyncResourceCache({ maxEntries: 2 })
  const old = cache.get('track', () => new Promise((resolve) => { resolveOld = resolve }))

  cache.clear()
  const fresh = cache.get('track', async () => { calls += 1; return 'fresh' })
  assert.equal(await fresh, 'fresh')

  resolveOld('old')
  assert.equal(await old, 'old')
  assert.equal(await cache.get('track', async () => { calls += 1; return 'unexpected' }), 'fresh')
  assert.equal(calls, 1)
})
