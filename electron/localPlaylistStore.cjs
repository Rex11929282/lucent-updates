const { DatabaseSync } = require('node:sqlite')
const { randomUUID } = require('node:crypto')

function requiredText(value, label, max = 120) {
  const text = String(value || '').trim()
  if (!text) throw new Error(`${label}不可空白`)
  return text.slice(0, max)
}

function mapPlaylist(row) {
  return row && { id: row.id, name: row.name, createdAt: row.created_at, updatedAt: row.updated_at }
}

function mapItem(row) {
  return row && {
    id: row.id,
    playlistId: row.playlist_id,
    provider: row.provider,
    trackId: row.track_id,
    name: row.name,
    artist: row.artist,
    cover: row.cover,
    durationMs: row.duration_ms,
    position: row.position,
    addedAt: row.added_at,
  }
}

function mapQueueEntry(row) {
  return row && {
    id: row.id,
    roomId: row.room_id,
    provider: row.provider,
    trackId: row.track_id,
    name: row.name,
    artist: row.artist,
    cover: row.cover,
    durationMs: row.duration_ms,
    requesterId: row.requester_id,
    requesterName: row.requester_name,
    status: row.status,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function createLocalPlaylistStore(databasePath, { Database = DatabaseSync, now = () => new Date().toISOString(), uuid = randomUUID } = {}) {
  const db = new Database(databasePath)
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS db_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS local_playlists(
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS local_playlist_items(
      id TEXT PRIMARY KEY,
      playlist_id TEXT NOT NULL REFERENCES local_playlists(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      track_id TEXT NOT NULL,
      name TEXT NOT NULL,
      artist TEXT NOT NULL DEFAULT '',
      cover TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL,
      added_at TEXT NOT NULL,
      UNIQUE(playlist_id, provider, track_id)
    );
    CREATE INDEX IF NOT EXISTS local_playlist_items_order ON local_playlist_items(playlist_id, position);
    INSERT OR IGNORE INTO db_migrations(version, applied_at) VALUES(1, datetime('now'));
    CREATE TABLE IF NOT EXISTS room_queue_entries(
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      track_id TEXT NOT NULL,
      name TEXT NOT NULL,
      artist TEXT NOT NULL DEFAULT '',
      cover TEXT NOT NULL DEFAULT '',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      requester_id TEXT NOT NULL,
      requester_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'queued',
      position INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS room_queue_order ON room_queue_entries(room_id, position);
    CREATE UNIQUE INDEX IF NOT EXISTS room_queue_active_track
      ON room_queue_entries(room_id, provider, track_id) WHERE status IN ('queued', 'playing');
    INSERT OR IGNORE INTO db_migrations(version, applied_at) VALUES(2, datetime('now'));
  `)

  const getPlaylist = db.prepare('SELECT * FROM local_playlists WHERE id = ?')
  const getItem = db.prepare('SELECT * FROM local_playlist_items WHERE id = ?')
  const listItemRows = db.prepare('SELECT * FROM local_playlist_items WHERE playlist_id = ? ORDER BY position, added_at, id')
  const updatePosition = db.prepare('UPDATE local_playlist_items SET position = ? WHERE id = ?')
  const getQueueEntry = db.prepare('SELECT * FROM room_queue_entries WHERE id = ?')
  const listQueueRows = db.prepare('SELECT * FROM room_queue_entries WHERE room_id = ? ORDER BY position, created_at, id')
  const updateQueuePosition = db.prepare('UPDATE room_queue_entries SET position = ? WHERE id = ?')

  function requirePlaylist(id) {
    const playlist = getPlaylist.get(String(id || ''))
    if (!playlist) throw new Error('找不到本機歌單')
    return playlist
  }

  function normalizePositions(playlistId, preferredOrder = null) {
    const rows = preferredOrder || listItemRows.all(playlistId)
    rows.forEach((row, index) => updatePosition.run(index, row.id))
  }

  function normalizeQueuePositions(roomId, preferredOrder = null) {
    const rows = preferredOrder || listQueueRows.all(roomId)
    rows.forEach((row, index) => updateQueuePosition.run(index, row.id))
  }

  return {
    schemaVersion() {
      return Number(db.prepare('SELECT MAX(version) AS version FROM db_migrations').get()?.version || 0)
    },
    listPlaylists() {
      return db.prepare(`
        SELECT p.*, COUNT(i.id) AS item_count
        FROM local_playlists p LEFT JOIN local_playlist_items i ON i.playlist_id = p.id
        GROUP BY p.id ORDER BY p.created_at, p.id
      `).all().map((row) => ({ ...mapPlaylist(row), itemCount: Number(row.item_count || 0) }))
    },
    createPlaylist(name) {
      const stamp = now()
      const playlist = { id: uuid(), name: requiredText(name, '歌單名稱', 60), createdAt: stamp, updatedAt: stamp }
      db.prepare('INSERT INTO local_playlists(id,name,created_at,updated_at) VALUES(?,?,?,?)')
        .run(playlist.id, playlist.name, playlist.createdAt, playlist.updatedAt)
      return playlist
    },
    renamePlaylist(id, name) {
      requirePlaylist(id)
      db.prepare('UPDATE local_playlists SET name = ?, updated_at = ? WHERE id = ?')
        .run(requiredText(name, '歌單名稱', 60), now(), String(id))
      return mapPlaylist(getPlaylist.get(String(id)))
    },
    deletePlaylist(id) {
      db.prepare('DELETE FROM local_playlists WHERE id = ?').run(String(id || ''))
      return true
    },
    listItems(playlistId) {
      return listItemRows.all(String(playlistId || '')).map(mapItem)
    },
    addItem(playlistId, item = {}) {
      const playlist = requirePlaylist(playlistId)
      const provider = requiredText(item.provider, '音樂來源', 32)
      const trackId = requiredText(item.trackId, '歌曲 ID', 80)
      const position = Number(db.prepare('SELECT COUNT(*) AS count FROM local_playlist_items WHERE playlist_id = ?').get(playlist.id).count)
      const stamp = now()
      const row = {
        id: uuid(), playlistId: playlist.id, provider, trackId,
        name: requiredText(item.name, '歌曲名稱', 160),
        artist: String(item.artist || '').trim().slice(0, 160),
        cover: String(item.cover || '').trim().slice(0, 2048),
        durationMs: Math.max(0, Math.round(Number(item.durationMs) || 0)),
        position, addedAt: stamp,
      }
      try {
        db.prepare(`INSERT INTO local_playlist_items
          (id,playlist_id,provider,track_id,name,artist,cover,duration_ms,position,added_at)
          VALUES(?,?,?,?,?,?,?,?,?,?)`)
          .run(row.id, row.playlistId, row.provider, row.trackId, row.name, row.artist, row.cover, row.durationMs, row.position, row.addedAt)
      } catch (error) {
        if (/UNIQUE/i.test(String(error.message))) throw new Error('歌曲已在歌單中')
        throw error
      }
      db.prepare('UPDATE local_playlists SET updated_at = ? WHERE id = ?').run(stamp, playlist.id)
      return row
    },
    removeItem(id) {
      const row = getItem.get(String(id || ''))
      if (!row) return false
      db.exec('BEGIN')
      try {
        db.prepare('DELETE FROM local_playlist_items WHERE id = ?').run(row.id)
        normalizePositions(row.playlist_id)
        db.prepare('UPDATE local_playlists SET updated_at = ? WHERE id = ?').run(now(), row.playlist_id)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return true
    },
    moveItem(id, position) {
      const row = getItem.get(String(id || ''))
      if (!row) throw new Error('找不到歌單歌曲')
      const rows = listItemRows.all(row.playlist_id).filter((item) => item.id !== row.id)
      const nextPosition = Math.max(0, Math.min(rows.length, Math.round(Number(position) || 0)))
      rows.splice(nextPosition, 0, row)
      db.exec('BEGIN')
      try {
        normalizePositions(row.playlist_id, rows)
        db.prepare('UPDATE local_playlists SET updated_at = ? WHERE id = ?').run(now(), row.playlist_id)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return mapItem(getItem.get(row.id))
    },
    listRoomQueue(roomId) {
      return listQueueRows.all(requiredText(roomId, '房間 ID', 120)).map(mapQueueEntry)
    },
    addRoomQueueEntry(roomId, item = {}) {
      const normalizedRoomId = requiredText(roomId, '房間 ID', 120)
      const stamp = now()
      const row = {
        id: uuid(),
        roomId: normalizedRoomId,
        provider: requiredText(item.provider, '音樂來源', 32),
        trackId: requiredText(item.trackId, '歌曲 ID', 80),
        name: requiredText(item.name, '歌曲名稱', 160),
        artist: String(item.artist || '').trim().slice(0, 160),
        cover: String(item.cover || '').trim().slice(0, 2048),
        durationMs: Math.max(0, Math.round(Number(item.durationMs) || 0)),
        requesterId: requiredText(item.requesterId, '點歌者 ID', 120),
        requesterName: String(item.requesterName || '').trim().slice(0, 80),
        status: 'queued',
        position: Number(db.prepare('SELECT COUNT(*) AS count FROM room_queue_entries WHERE room_id = ?').get(normalizedRoomId).count),
        createdAt: stamp,
        updatedAt: stamp,
      }
      try {
        db.prepare(`INSERT INTO room_queue_entries
          (id,room_id,provider,track_id,name,artist,cover,duration_ms,requester_id,requester_name,status,position,created_at,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(row.id, row.roomId, row.provider, row.trackId, row.name, row.artist, row.cover, row.durationMs,
            row.requesterId, row.requesterName, row.status, row.position, row.createdAt, row.updatedAt)
      } catch (error) {
        if (/UNIQUE/i.test(String(error.message))) throw new Error('歌曲已在待播佇列')
        throw error
      }
      return row
    },
    updateRoomQueueStatus(id, status) {
      const allowed = new Set(['queued', 'playing', 'played', 'skipped', 'error'])
      if (!allowed.has(status)) throw new Error('佇列狀態無效')
      if (!getQueueEntry.get(String(id || ''))) throw new Error('找不到待播歌曲')
      db.prepare('UPDATE room_queue_entries SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), String(id))
      return mapQueueEntry(getQueueEntry.get(String(id)))
    },
    removeRoomQueueEntry(id) {
      const row = getQueueEntry.get(String(id || ''))
      if (!row) return false
      db.exec('BEGIN')
      try {
        db.prepare('DELETE FROM room_queue_entries WHERE id = ?').run(row.id)
        normalizeQueuePositions(row.room_id)
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
      return true
    },
    moveRoomQueueEntry(id, position) {
      const row = getQueueEntry.get(String(id || ''))
      if (!row) throw new Error('找不到待播歌曲')
      const rows = listQueueRows.all(row.room_id).filter((item) => item.id !== row.id)
      const nextPosition = Math.max(0, Math.min(rows.length, Math.round(Number(position) || 0)))
      rows.splice(nextPosition, 0, row)
      db.exec('BEGIN')
      try { normalizeQueuePositions(row.room_id, rows); db.exec('COMMIT') }
      catch (error) { db.exec('ROLLBACK'); throw error }
      return mapQueueEntry(getQueueEntry.get(row.id))
    },
    countPendingRoomRequests(roomId, requesterId) {
      return Number(db.prepare(`SELECT COUNT(*) AS count FROM room_queue_entries
        WHERE room_id = ? AND requester_id = ? AND status = 'queued'`).get(String(roomId || ''), String(requesterId || '')).count)
    },
    clearRoomQueue(roomId) {
      db.prepare('DELETE FROM room_queue_entries WHERE room_id = ?').run(String(roomId || ''))
      return true
    },
    close() { db.close() },
  }
}

module.exports = { createLocalPlaylistStore }
