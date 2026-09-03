const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const { checkReleaseEnvironment } = require('../scripts/releasePreflight.cjs')
const buildConfig = require('../electron-builder.config.cjs')
const { createBuildConfig } = require('../electron-builder.config.factory.cjs')
const pkg = require('../package.json')

test('builder configuration contains only serializable build options', () => {
  assert.equal(Object.hasOwn(buildConfig, 'createBuildConfig'), false)
})

test('test builds embed the selected public GitHub update repository', () => {
  const config = createBuildConfig({
    LUCENT_UPDATE_REPOSITORY: 'Rex11929282/lucent-updates',
    LUCENT_RELEASE_CHANNEL: 'beta',
  })

  assert.deepEqual(config.publish, [{
    provider: 'github',
    owner: 'Rex11929282',
    repo: 'lucent-updates',
    private: false,
    releaseType: 'release',
    channel: 'beta',
  }])
  assert.equal(config.artifactName, undefined)
  assert.equal(config.nsis.artifactName, '${productName}-Setup-${version}.${ext}')
  assert.equal(config.nsis.oneClick, false)
  assert.equal(config.nsis.allowToChangeInstallationDirectory, true)
  assert.equal(config.portable, undefined)
})

test('a build without a valid public GitHub repository does not embed a publish source', () => {
  assert.equal(createBuildConfig({ LUCENT_RELEASE_CHANNEL: 'stable' }).publish, undefined)
  assert.equal(createBuildConfig({ LUCENT_UPDATE_REPOSITORY: 'https://github.com/Rex11929282/lucent-updates' }).publish, undefined)
  assert.equal(createBuildConfig({ LUCENT_UPDATE_REPOSITORY: 'Rex11929282/lucent-updates/extra' }).publish, undefined)
})

test('test release requires repository and channel but not provider approval or signing', () => {
  const result = checkReleaseEnvironment({
    LUCENT_UPDATE_REPOSITORY: 'Rex11929282/lucent-updates',
    LUCENT_RELEASE_CHANNEL: 'stable',
  })

  assert.deepEqual(result, { ok: true, errors: [] })
})

test('test release errors do not include environment values', () => {
  const result = checkReleaseEnvironment({
    LUCENT_UPDATE_REPOSITORY: 'not a repository',
    LUCENT_RELEASE_CHANNEL: 'nightly',
  })

  assert.equal(result.ok, false)
  assert.match(result.errors.join('\n'), /GitHub/)
  assert.match(result.errors.join('\n'), /頻道/)
  assert.doesNotMatch(result.errors.join('\n'), /not a repository|nightly/)
})

test('distribution build is explicitly local and never uploads release assets', () => {
  assert.match(pkg.scripts.dist, /--publish never/)
})

test('package manifest and lockfile keep the application version in sync', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8'))
  assert.equal(lock.version, pkg.version)
  assert.equal(lock.packages?.['']?.version, pkg.version)
})

test('installer keeps one visible app exe while safely hiding required Electron support files', () => {
  const config = createBuildConfig({})
  const installerScript = path.join(__dirname, '..', 'build', 'installer.nsh')

  assert.equal(config.compression, 'normal')
  assert.ok(config.files.includes('!node_modules/NeteaseCloudMusicApi/public/**/*'))
  assert.equal(config.nsis.include, 'build/installer.nsh')
  assert.equal(fs.existsSync(installerScript), true)
  const source = fs.readFileSync(installerScript, 'utf8')
  assert.match(source, /!macro customInstall/)
  assert.match(source, /attrib\.exe.*\+H.*\$INSTDIR\\\*/)
  assert.match(source, /SetFileAttributes\s+"\$INSTDIR\\Lucent\.exe"\s+NORMAL/)
})

test('builder excludes non-runtime diagnostic and documentation artifacts without changing compression', () => {
  const config = createBuildConfig({})
  for (const pattern of ['!**/*.map', '!**/*.md', '!**/*.MD', '!**/*.markdown', '!**/test/**/*', '!**/tests/**/*']) {
    assert.ok(config.files.includes(pattern), pattern)
  }
  assert.equal(config.compression, 'normal')
})
