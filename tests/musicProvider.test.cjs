const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { createMusicProvider } = require('../electron/musicProvider.cjs')
const buildConfig = require('../electron-builder.config.cjs')

test('development may use the injected unofficial provider', () => {
  const provider = { searchSongs: async () => ['ok'] }
  const selected = createMusicProvider({ isPackaged: false, allowUnofficial: false, loadUnofficial: () => provider })
  assert.equal(selected, provider)
})

test('commercial package fails closed without an authorized provider', async () => {
  let loaded = false
  const selected = createMusicProvider({
    isPackaged: true, allowUnofficial: false,
    loadUnofficial: () => { loaded = true; return {} },
  })
  assert.equal(loaded, false)
  assert.equal(selected.kind, 'unavailable')
  assert.equal(await selected.loginStatus(), null)
  await assert.rejects(() => selected.searchSongs('歌'), /尚未接入已授權/)
  assert.equal(selected.getCookie(), '')
})

test('a non-commercial packaged app loads the enabled development provider', () => {
  const provider = { kind: 'development-netease' }
  const selected = createMusicProvider({ isPackaged: true, allowUnofficial: true, loadUnofficial: () => provider })
  assert.equal(selected, provider)
})

test('the non-commercial build includes the provider and its runtime API dependency', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'))
  assert.equal(typeof pkg.dependencies.NeteaseCloudMusicApi, 'string')
  assert.equal(pkg.devDependencies.NeteaseCloudMusicApi, undefined)
  assert.equal(buildConfig.files.includes('!electron/netease.cjs'), false)
})
