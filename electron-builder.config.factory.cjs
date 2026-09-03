function githubRepository(value) {
  const match = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9_.-]+)$/.exec(String(value || '').trim())
  return match ? { owner: match[1], repo: match[2] } : null
}

function createBuildConfig(env = process.env) {
  const source = githubRepository(env.LUCENT_UPDATE_REPOSITORY)
  const channel = env.LUCENT_RELEASE_CHANNEL === 'beta' ? 'beta' : 'latest'
  return {
    appId: 'com.diowmow.lucentlyrics',
    productName: 'Lucent',
    icon: 'build/icon.ico',
    compression: 'normal',
    files: [
      'dist/**/*',
      'electron/**/*',
      'shared/**/*',
      'build/icon.ico',
      // 璃音只使用 API 模組，不會啟動該套件內附的 Web 伺服器；排除其示範與靜態網站素材。
      '!node_modules/NeteaseCloudMusicApi/public/**/*',
      '!**/*.map',
      '!**/*.md',
      '!**/*.MD',
      '!**/*.markdown',
      '!**/test/**/*',
      '!**/tests/**/*',
    ],
    directories: { output: 'release' },
    publish: source ? [{
      provider: 'github',
      owner: source.owner,
      repo: source.repo,
      private: false,
      releaseType: 'release',
      channel,
    }] : undefined,
    win: {
      target: [
        { target: 'nsis', arch: ['x64'] },
      ],
    },
    nsis: {
      artifactName: '${productName}-Setup-${version}.${ext}',
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      include: 'build/installer.nsh',
    },
  }
}

module.exports = { createBuildConfig }
