const fs = require('fs')
const path = require('path')

function stageUpdateFeed({ releaseDir, outputDir }) {
  const source = path.resolve(String(releaseDir || ''))
  const target = path.resolve(String(outputDir || ''))
  const metadata = path.join(source, 'latest.yml')
  const installers = fs.existsSync(source)
    ? fs.readdirSync(source).filter((name) => /(?:Setup[ .-]).*\.exe$/i.test(name))
    : []
  if (!fs.existsSync(metadata) || installers.length !== 1) throw new Error('更新產物不完整或不明確')

  const installer = installers[0]
  const blockmap = `${installer}.blockmap`
  if (!fs.existsSync(path.join(source, blockmap))) throw new Error('更新產物不完整或不明確')

  fs.mkdirSync(target, { recursive: true })
  const files = ['latest.yml', installer, blockmap]
  for (const file of files) fs.copyFileSync(path.join(source, file), path.join(target, file))
  return { files }
}

if (require.main === module) {
  const [, , releaseDir, outputDir] = process.argv
  try {
    const result = stageUpdateFeed({ releaseDir, outputDir })
    console.log(`已準備更新檔：${result.files.join(', ')}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = { stageUpdateFeed }
