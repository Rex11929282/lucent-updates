import test from 'node:test'
import assert from 'node:assert/strict'

import { compactPlayerView } from '../src/consolePlayer.js'

test('desktop playback replaces stale internal-player metadata in the compact player', () => {
  const view = compactPlayerView({
    internalPlayer: { source: 'internal-player', song: { name: 'Old internal song' }, playing: false },
    roomState: {
      source: 'desktop-spotify',
      song: { name: 'Current Spotify song', artist: 'Artist' },
      playing: true,
      positionMs: 5000,
      durationMs: 180000,
    },
    roomMode: 'solo',
  })
  assert.equal(view.song.name, 'Current Spotify song')
  assert.equal(view.source, 'desktop-spotify')
  assert.equal(view.providerControllable, false)
})

test('desktop playback uses the live room clock instead of the stale room snapshot position', () => {
  const view = compactPlayerView({
    internalPlayer: { enabled: true, source: 'internal-player', positionMs: 0 },
    roomState: {
      source: 'desktop-spotify',
      song: { name: 'Current Spotify song' },
      playing: true,
      positionMs: 5000,
      durationMs: 180000,
    },
    roomClock: { positionMs: 9000, playing: true, at: 1000 },
    now: 1250,
    roomMode: 'solo',
  })
  assert.equal(view.positionMs, 9250)
})

test('internal playback keeps its queue and transport controls', () => {
  const internalPlayer = {
    source: 'internal-player',
    song: { name: 'Lucent song' },
    queue: { hasPrevious: true, hasNext: true },
  }
  const view = compactPlayerView({ internalPlayer, roomState: { source: 'internal-player' }, roomMode: 'solo' })
  assert.equal(view.song, internalPlayer.song)
  assert.equal(view.providerControllable, true)
})

test('room members see the host provider instead of their local player', () => {
  const view = compactPlayerView({
    internalPlayer: { source: 'internal-player', song: { name: 'Local' } },
    roomState: {
      source: 'room-host',
      originSource: 'desktop-youtube-music',
      song: { name: 'Host song' },
      playing: true,
    },
    roomMode: 'member',
  })
  assert.equal(view.song.name, 'Host song')
  assert.equal(view.source, 'desktop-youtube-music')
  assert.equal(view.providerControllable, false)
})
