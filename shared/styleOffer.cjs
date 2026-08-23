const { sharedAppearanceStyle } = require('./roomStyle.cjs')
const { mergeSharedStyle } = require('./stateMigration.cjs')

function canSendStyleOffer(mode, target) {
  if (mode === 'host') return target === 'all' || (typeof target === 'string' && target.startsWith('member-'))
  return mode === 'member' && target === 'host'
}

function createStyleOffer({ id, sender, target, style, name, createdAt = Date.now() }) {
  if (!id || !sender?.id || !sender?.name || !target) throw new Error('invalid style offer')
  return {
    id: String(id),
    sender: { id: String(sender.id), name: String(sender.name).slice(0, 40) },
    target: String(target),
    name: String(name || '外觀參數').trim().slice(0, 40) || '外觀參數',
    createdAt: Number(createdAt) || Date.now(),
    style: sharedAppearanceStyle(style || {}),
  }
}

function handleStyleOfferOnce(handled, id) {
  if (!id || handled.has(id)) return false
  handled.add(id)
  return true
}

function applyAcceptedStyleOffer(state, offer, { profileId, now, profileName, defaults } = {}) {
  const next = mergeSharedStyle(state, offer.style, defaults || {})
  const stamp = now || new Date().toISOString()
  return {
    ...next,
    profiles: [...(state.profiles || []), {
      id: String(profileId),
      name: String(profileName),
      createdAt: stamp,
      updatedAt: stamp,
      glass: { ...offer.style.glass },
      cfg: { ...offer.style.cfg },
    }],
  }
}

module.exports = { canSendStyleOffer, createStyleOffer, handleStyleOfferOnce, applyAcceptedStyleOffer }
