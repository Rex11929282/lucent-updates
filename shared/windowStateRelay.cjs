function createWindowStateRelay() {
  const latest = new Map()

  return {
    remember(channel, payload) {
      latest.set(channel, payload)
    },
    replay(send) {
      for (const channel of ['room:state', 'np:info']) {
        if (latest.has(channel)) send(channel, latest.get(channel))
      }
    },
  }
}

module.exports = { createWindowStateRelay }
