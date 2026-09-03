import test from 'node:test'
import assert from 'node:assert/strict'
import { createArtworkLoader } from '../src/artworkCache.js'

class FakeImage {
  static instances = []

  constructor() {
    this.complete = false
    this.naturalWidth = 0
    this.naturalHeight = 0
    FakeImage.instances.push(this)
  }

  resolve(width = 64) {
    this.naturalWidth = width
    this.naturalHeight = width
    this.complete = true
    this.onload?.()
  }
}

test('artwork loader deduplicates in-flight images and reuses successful results', async () => {
  FakeImage.instances = []
  const loader = createArtworkLoader({ ImageCtor: FakeImage })
  const first = loader.load('https://cdn.test/cover.jpg')
  const second = loader.load('https://cdn.test/cover.jpg')
  assert.equal(FakeImage.instances.length, 1)

  FakeImage.instances[0].resolve()
  const [a, b] = await Promise.all([first, second])
  assert.equal(a.ok, true)
  assert.equal(a.image, b.image)
  assert.equal((await loader.load('https://cdn.test/cover.jpg')).image, a.image)
  assert.equal(FakeImage.instances.length, 1)
})

test('artwork loader settles a hung request and lets later calls retry it', async () => {
  FakeImage.instances = []
  let now = 100
  const loader = createArtworkLoader({ ImageCtor: FakeImage, timeoutMs: 10, failureTtlMs: 5, now: () => now })
  const first = await loader.load('https://cdn.test/hung.jpg')
  assert.equal(first.ok, false)
  assert.equal(FakeImage.instances.length, 1)
  now = 102
  const cachedFailure = await loader.load('https://cdn.test/hung.jpg')
  assert.equal(cachedFailure.ok, false)
  assert.equal(FakeImage.instances.length, 1)
  now = 106
  const retry = loader.load('https://cdn.test/hung.jpg')
  assert.equal(FakeImage.instances.length, 2)
  FakeImage.instances[1].resolve()
  assert.equal((await retry).ok, true)
})

test('CORS palette loads use a separate cache key and uncached snapshots do not stay in the cache', async () => {
  FakeImage.instances = []
  const loader = createArtworkLoader({ ImageCtor: FakeImage, maxEntries: 1 })
  const plain = loader.load('https://cdn.test/cover.jpg')
  FakeImage.instances[0].resolve()
  await plain
  const cors = loader.load('https://cdn.test/cover.jpg', { crossOrigin: true })
  assert.equal(FakeImage.instances.length, 2)
  FakeImage.instances[1].resolve()
  await cors
  const uncached = loader.load('data:image/png;base64,snapshot', { cache: false })
  assert.equal(FakeImage.instances.length, 3)
  FakeImage.instances[2].resolve()
  assert.equal((await uncached).ok, true)
  assert.equal(loader.size(), 1)
})
