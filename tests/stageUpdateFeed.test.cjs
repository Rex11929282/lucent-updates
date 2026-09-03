const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { stageUpdateFeed } = require('../scripts/stageUpdateFeed.cjs')

function fixture(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lucent-update-feed-'))
  const releaseDir = path.join(root, 'release')
  const outputDir = path.join(root, 'output')
  fs.mkdirSync(releaseDir)
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(releaseDir, name), content)
  return { root, releaseDir, outputDir }
}

test('staging copies only one NSIS installer, metadata, and its blockmap', () => {
  const { root, releaseDir, outputDir } = fixture({
    'latest.yml': 'version: 1.0.1',
    'Lucent Setup 1.0.1.exe': 'installer',
    'Lucent Setup 1.0.1.exe.blockmap': 'blockmap',
    'Lucent 1.0.1.exe': 'portable',
    'debug.log': 'ignore',
  })
  try {
    const result = stageUpdateFeed({ releaseDir, outputDir })
    assert.deepEqual(result.files.sort(), ['Lucent Setup 1.0.1.exe', 'Lucent Setup 1.0.1.exe.blockmap', 'latest.yml'])
    assert.deepEqual(fs.readdirSync(outputDir).sort(), result.files.sort())
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('staging accepts the configured hyphenated NSIS artifact name', () => {
  const { root, releaseDir, outputDir } = fixture({
    'latest.yml': 'version: 1.0.2',
    'Lucent-Setup-1.0.2.exe': 'installer',
    'Lucent-Setup-1.0.2.exe.blockmap': 'blockmap',
  })
  try {
    const result = stageUpdateFeed({ releaseDir, outputDir })
    assert.deepEqual(result.files.sort(), ['Lucent-Setup-1.0.2.exe', 'Lucent-Setup-1.0.2.exe.blockmap', 'latest.yml'])
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('staging rejects incomplete or ambiguous installers', () => {
  const missing = fixture({ 'latest.yml': 'version: 1.0.1' })
  const ambiguous = fixture({
    'latest.yml': 'version: 1.0.1',
    'Lucent Setup 1.0.1.exe': 'a', 'Lucent Setup 1.0.1.exe.blockmap': 'a',
    'Lucent Setup 1.0.2.exe': 'b', 'Lucent Setup 1.0.2.exe.blockmap': 'b',
  })
  try {
    assert.throws(() => stageUpdateFeed({ releaseDir: missing.releaseDir, outputDir: missing.outputDir }), /不完整或不明確/)
    assert.throws(() => stageUpdateFeed({ releaseDir: ambiguous.releaseDir, outputDir: ambiguous.outputDir }), /不完整或不明確/)
  } finally {
    fs.rmSync(missing.root, { recursive: true, force: true })
    fs.rmSync(ambiguous.root, { recursive: true, force: true })
  }
})

test('staging rejects an installer without its matching blockmap', () => {
  const { root, releaseDir, outputDir } = fixture({
    'latest.yml': 'version: 1.0.1',
    'Lucent Setup 1.0.1.exe': 'installer',
  })
  try {
    assert.throws(() => stageUpdateFeed({ releaseDir, outputDir }), /不完整或不明確/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})
