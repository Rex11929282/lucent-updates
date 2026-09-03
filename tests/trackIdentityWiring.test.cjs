const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')
const songSwitch = fs.readFileSync(path.join(__dirname, '..', 'shared', 'songSwitch.cjs'), 'utf8')
const coordinator = fs.readFileSync(path.join(__dirname, '..', 'shared', 'playbackCoordinator.cjs'), 'utf8')

test('song lifecycle and playback arbitration share TrackIdentity', () => {
  assert.match(main, /sameTrackIdentity\(current\.identity, next\)/)
  assert.match(main, /sameTrackIdentity\(lastSmtcIdentity, smtcIdentity\)/)
  assert.match(songSwitch, /trackIdentityKey\(/)
  assert.match(coordinator, /trackIdentityKey\(song\)/)
})

test('ordinary position updates are absent from the shared identity fields', () => {
  assert.doesNotMatch(songSwitch, /positionMs/)
})
