const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const { readBundledUpdateConfig } = require('../shared/updateConfig.cjs')

test('unpackaged builds never enable bundled auto updates', () => {
  const result = readBundledUpdateConfig({
    isPackaged: false,
    resourcesPath: 'C:/Lucent/resources',
    existsSync: () => true,
  })
  assert.deepEqual(result, { enabled: false, reason: '開發模式不執行自動更新' })
})

test('packaged installs require app-update.yml', () => {
  const result = readBundledUpdateConfig({
    isPackaged: true,
    resourcesPath: 'C:/Lucent/resources',
    existsSync: () => false,
  })
  assert.deepEqual(result, { enabled: false, reason: '安裝包沒有更新設定' })
})

test('packaged installs enable updates when app-update.yml is bundled', () => {
  const result = readBundledUpdateConfig({
    isPackaged: true,
    resourcesPath: 'C:/Lucent/resources',
    existsSync: (file) => file === path.join('C:/Lucent/resources', 'app-update.yml'),
  })
  assert.deepEqual(result, { enabled: true, reason: '' })
})
