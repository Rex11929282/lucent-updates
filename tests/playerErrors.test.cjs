const test = require('node:test')
const assert = require('node:assert/strict')
const { PLAYER_ERROR_CODES, playerErrorCode, createPlayerError } = require('../shared/playerErrors.cjs')

test('player errors have stable codes and map legacy messages', () => {
  assert.equal(playerErrorCode(PLAYER_ERROR_CODES.NO_PLAYABLE_SOURCE), PLAYER_ERROR_CODES.NO_PLAYABLE_SOURCE)
  assert.equal(playerErrorCode('請先登入網易雲'), PLAYER_ERROR_CODES.LOGIN_REQUIRED)
  assert.equal(playerErrorCode('電腦上的網易雲正在播放'), PLAYER_ERROR_CODES.NETEASE_ACTIVE)
  assert.equal(playerErrorCode('歌曲目前無法播放'), PLAYER_ERROR_CODES.MEDIA_LOAD_FAILED)
})

test('createPlayerError keeps a stable code on the Error object', () => {
  const error = createPlayerError(PLAYER_ERROR_CODES.NO_PLAYABLE_SOURCE)
  assert.equal(error.code, PLAYER_ERROR_CODES.NO_PLAYABLE_SOURCE)
  assert.equal(error.message, PLAYER_ERROR_CODES.NO_PLAYABLE_SOURCE)
})
