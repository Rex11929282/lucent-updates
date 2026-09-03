export function formatRoomInvite(
  { roomName = '我的房間', ip = '', port = 8787, code = '' } = {},
  { title = '璃音 Lucent 邀請', room = '房間', address = '位址', code: codeLabel = '房號', separator = '：' } = {},
) {
  const lines = [
    title,
    `${room}${separator}${roomName}`,
    `${address}${separator}${ip}:${port}`,
  ]
  if (String(code).trim()) lines.push(`${codeLabel}${separator}${String(code).trim()}`)
  return lines.join('\n')
}

export function nextLocalizedDefault(current, previousDefault, nextDefault) {
  return current === previousDefault ? nextDefault : current
}

export function mergeRecentMembers(previous = [], members = [], seenAt = Date.now()) {
  const byIp = new Map()
  for (const member of members) {
    const ip = String(member?.ip || '').trim()
    if (!ip || byIp.has(ip)) continue
    byIp.set(ip, { name: String(member?.name || '成員').slice(0, 60), ip, seenAt })
  }
  for (const member of previous) {
    const ip = String(member?.ip || '').trim()
    if (!ip || byIp.has(ip)) continue
    byIp.set(ip, { name: String(member?.name || '成員').slice(0, 60), ip, seenAt: Number(member?.seenAt) || seenAt })
  }
  return [...byIp.values()].sort((a, b) => b.seenAt - a.seenAt).slice(0, 12)
}
