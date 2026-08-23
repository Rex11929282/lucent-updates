function unavailableProvider() {
  const unavailable = async () => { throw new Error('商用版尚未接入已授權的音樂 Provider') }
  return {
    kind: 'unavailable',
    available: false,
    setCookie() {},
    getCookie() { return '' },
    loginStatus: async () => null,
    logout: async () => true,
    searchSongs: unavailable,
    getSongDetail: unavailable,
    getLyric: unavailable,
    getLyricPair: unavailable,
    getSongUrl: unavailable,
    getPlayableSong: unavailable,
    getArtistAvatar: unavailable,
    getUserPlaylists: unavailable,
    getPlaylistTracks: unavailable,
    loginQr: unavailable,
    loginCheck: unavailable,
  }
}

function createMusicProvider({
  isPackaged,
  allowUnofficial = false,
  loadUnofficial = () => require('./netease.cjs'),
} = {}) {
  if (!isPackaged || allowUnofficial) return loadUnofficial()
  return unavailableProvider()
}

module.exports = { createMusicProvider }
