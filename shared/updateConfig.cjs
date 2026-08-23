const path = require('path')

function readBundledUpdateConfig({ isPackaged, resourcesPath, existsSync }) {
  if (!isPackaged) return { enabled: false, reason: '開發模式不執行自動更新' }
  const configPath = path.join(String(resourcesPath || ''), 'app-update.yml')
  if (!existsSync(configPath)) return { enabled: false, reason: '安裝包沒有更新設定' }
  return { enabled: true, reason: '' }
}

module.exports = { readBundledUpdateConfig }
