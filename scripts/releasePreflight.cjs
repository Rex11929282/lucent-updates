function checkReleaseEnvironment(env = process.env) {
  const errors = []
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]+$/.test(String(env.LUCENT_UPDATE_REPOSITORY || '').trim())) {
    errors.push('缺少公開 GitHub 更新倉庫設定')
  }
  if (!['stable', 'beta'].includes(env.LUCENT_RELEASE_CHANNEL)) errors.push('發佈頻道必須是 stable 或 beta')
  return { ok: errors.length === 0, errors }
}

if (require.main === module) {
  const result = checkReleaseEnvironment()
  if (!result.ok) {
    console.error('璃音測試發佈前檢未通過：')
    for (const error of result.errors) console.error(`- ${error}`)
    process.exitCode = 1
  } else console.log('璃音測試發佈前檢通過。')
}

module.exports = { checkReleaseEnvironment }
