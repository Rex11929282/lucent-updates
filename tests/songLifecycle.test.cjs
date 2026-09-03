const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { isNaturalSongEnd, isReadyToRebuild } = require('../shared/songLifecycle.cjs')

const song = { id: '101', revision: 8, durationMs: 240000, loading: false }

test('only a stopped tail or a tail-end incoming song is a natural end', () => {
  assert.equal(isNaturalSongEnd({ song, positionMs: 120000, playing: false }), false)
  assert.equal(isNaturalSongEnd({ song, positionMs: 239500, playing: true }), false)
  assert.equal(isNaturalSongEnd({ song, positionMs: 239500, playing: false }), true)
  assert.equal(isNaturalSongEnd({ song, positionMs: 239500, playing: true, incomingSongId: '102' }), true)
  assert.equal(isNaturalSongEnd({ song, positionMs: 237000, playing: false }), true)
  assert.equal(isNaturalSongEnd({ song, positionMs: 237000, playing: true, incomingSongId: '102' }), true)
})

test('only a different loaded and playing song can rebuild an active end lifecycle', () => {
  const lifecycle = { token: 3, endedSongRevision: 8, readySongRevision: 0 }
  assert.equal(isReadyToRebuild(lifecycle, { ...song, revision: 9, loading: true, artworkReady: false }, true), false)
  assert.equal(isReadyToRebuild(lifecycle, { ...song, revision: 9, loading: false, artworkReady: false }, true), false)
  assert.equal(isReadyToRebuild(lifecycle, { ...song, revision: 9, loading: false, artworkReady: true }, false), false)
  assert.equal(isReadyToRebuild(lifecycle, { ...song, revision: 9, loading: false, artworkReady: true }, true), true)
  assert.equal(isReadyToRebuild(lifecycle, { ...song, revision: 9, loading: false }, true), true)
})

test('unknown duration and repeated song revisions never fabricate a transition', () => {
  assert.equal(isNaturalSongEnd({ song: { ...song, durationMs: 0 }, positionMs: 999999, playing: false }), false)
  assert.equal(isReadyToRebuild({ token: 1, endedSongRevision: 8 }, song, true), false)
})

test('main broadcasts lifecycle tokens and the renderer freezes effects during shatter', () => {
  const root = path.resolve(__dirname, '..')
  const main = fs.readFileSync(path.join(root, 'electron', 'main.cjs'), 'utf8')
  const app = fs.readFileSync(path.join(root, 'src', 'App.jsx'), 'utf8')
  const capsule = fs.readFileSync(path.join(root, 'src', 'components', 'Capsule.jsx'), 'utf8')

  assert.match(main, /transition: np\.transition/)
  assert.match(main, /markNaturalSongEnd\(nextId\)/)
  assert.match(main, /markNextSongReady\(\)/)
  assert.match(main, /artworkReady: !!\(identity\.avatar \|\| identity\.cover\)/)
  assert.match(main, /artworkReady: !needsArtistAvatar/)
  assert.match(main, /artworkReady: true/)
  assert.match(main, /overlay:capturePill/)
  assert.match(app, /roomState\?\.transition\?\.token/)
  assert.match(app, /isTransitionEffectsPaused/)
  assert.match(app, /artworkReadyRevision/)
  assert.match(app, /preloadArtwork\(url\)/)
  assert.match(capsule, /effectsPaused/)
  assert.match(capsule, /playing && !effectsPaused/)
})

test('a stopped CDP progress source updates both clocks so natural-end shatter can fire', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')
  assert.match(
    main,
    /else\s*\{\s*clk\.playing\s*=\s*playing[^\n]*\n\s*np\.playing\s*=\s*playing/,
  )
})

test('an SMTC song replacement starts the transition before loading the new song', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')
  assert.match(
    main,
    /if \(smtcChanged && !hasAuthoritativeCdpId\) \{\s*markSongReplacement\(\)\s*beginSong\(/,
  )
})
