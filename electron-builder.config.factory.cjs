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
    files: [
      'dist/**/*',
      'electron/**/*',
      'shared/**/*',
      'build/icon.ico',
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
    },
  }
}

module.exports = { createBuildConfig }
