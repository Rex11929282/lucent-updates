const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createLocalPlaylistStore } = require('../electron/localPlaylistStore.cjs')

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucent-playlists-'))
  const store = createLocalPlaylistStore(path.join(dir, 'lucent.db'))
  const result = { dir, store }
  result.close = () => { result.store.close(); fs.rmSync(dir, { recursive: true, force: true }) }
  return result
}

test('schema migration creates a persistent versioned playlist database', () => {
  const fx = fixture()
  assert.equal(fx.store.schemaVersion(), 2)
  const created = fx.store.createPlaylist('睡前歌單')
  fx.store.close()
  fx.store = createLocalPlaylistStore(path.join(fx.dir, 'lucent.db'))
  assert.equal(fx.store.listPlaylists()[0].id, created.id)
  fx.close()
})

test('room queue persists metadata, requester and dense ordering', () => {
  const fx = fixture()
  const first = fx.store.addRoomQueueEntry('room-a', {
    provider: 'netease', trackId: '11', name: '第一首', artist: '甲', requesterId: 'member-1', requesterName: '小明',
  })
  const second = fx.store.addRoomQueueEntry('room-a', {
    provider: 'netease', trackId: '22', name: '第二首', artist: '乙', requesterId: 'member-2', requesterName: '小美',
  })
  assert.deepEqual(fx.store.listRoomQueue('room-a').map((item) => [item.trackId, item.position, item.status]), [
    ['11', 0, 'queued'], ['22', 1, 'queued'],
  ])
  fx.store.moveRoomQueueEntry(second.id, 0)
  assert.deepEqual(fx.store.listRoomQueue('room-a').map((item) => item.id), [second.id, first.id])
  fx.store.updateRoomQueueStatus(second.id, 'playing')
  assert.equal(fx.store.listRoomQueue('room-a')[0].status, 'playing')
  assert.throws(() => fx.store.addRoomQueueEntry('room-a', {
    provider: 'netease', trackId: '11', name: '重複', requesterId: 'member-1',
  }), /已在待播佇列/)
  fx.store.removeRoomQueueEntry(first.id)
  assert.deepEqual(fx.store.listRoomQueue('room-a').map((item) => item.position), [0])
  fx.close()
})

test('room queue pending counts and room isolation survive restart', () => {
  const fx = fixture()
  fx.store.addRoomQueueEntry('room-a', { provider: 'netease', trackId: '1', name: 'A', requesterId: 'member-1' })
  fx.store.addRoomQueueEntry('room-b', { provider: 'netease', trackId: '2', name: 'B', requesterId: 'member-1' })
  assert.equal(fx.store.countPendingRoomRequests('room-a', 'member-1'), 1)
  fx.store.close()
  fx.store = createLocalPlaylistStore(path.join(fx.dir, 'lucent.db'))
  assert.equal(fx.store.listRoomQueue('room-a').length, 1)
  fx.store.clearRoomQueue('room-a')
  assert.equal(fx.store.listRoomQueue('room-a').length, 0)
  assert.equal(fx.store.listRoomQueue('room-b').length, 1)
  fx.close()
})

test('playlist names are normalized and CRUD does not affect another playlist', () => {
  const fx = fixture()
  const first = fx.store.createPlaylist('  工作  ')
  const second = fx.store.createPlaylist('收藏')
  assert.equal(first.name, '工作')
  assert.equal(fx.store.renamePlaylist(first.id, '專注').name, '專注')
  fx.store.deletePlaylist(first.id)
  assert.deepEqual(fx.store.listPlaylists().map((playlist) => playlist.id), [second.id])
  assert.throws(() => fx.store.createPlaylist('   '), /歌單名稱/)
  fx.close()
})

test('items preserve metadata, reject duplicates and cascade when a playlist is deleted', () => {
  const fx = fixture()
  const playlist = fx.store.createPlaylist('本機')
  const song = fx.store.addItem(playlist.id, {
    provider: 'netease', trackId: '123', name: '歌曲', artist: '歌手', cover: 'https://example.test/a.jpg', durationMs: 3210,
  })
  assert.equal(song.position, 0)
  assert.equal(fx.store.listItems(playlist.id)[0].trackId, '123')
  assert.throws(() => fx.store.addItem(playlist.id, { provider: 'netease', trackId: '123', name: '重複' }), /已在歌單/)
  fx.store.deletePlaylist(playlist.id)
  assert.deepEqual(fx.store.listItems(playlist.id), [])
  fx.close()
})

test('moving and removing items keeps dense deterministic positions', () => {
  const fx = fixture()
  const playlist = fx.store.createPlaylist('排序')
  const a = fx.store.addItem(playlist.id, { provider: 'netease', trackId: '1', name: 'A' })
  const b = fx.store.addItem(playlist.id, { provider: 'netease', trackId: '2', name: 'B' })
  const c = fx.store.addItem(playlist.id, { provider: 'netease', trackId: '3', name: 'C' })
  fx.store.moveItem(c.id, 0)
  assert.deepEqual(fx.store.listItems(playlist.id).map((item) => [item.name, item.position]), [['C', 0], ['A', 1], ['B', 2]])
  fx.store.removeItem(a.id)
  assert.deepEqual(fx.store.listItems(playlist.id).map((item) => [item.name, item.position]), [['C', 0], ['B', 1]])
  fx.close()
})
