const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')

const root = path.resolve(__dirname, '..')

// 這組測試補的是一個很現實的漏洞：main.cjs 曾經 require 一個不存在的路徑，
// 程式完全開不起來 —— 而當時 600 多個測試「全部通過」，因為沒有任何一個
// 測試真的去載入主行程模組或檢查它的 require 解析得開。
// 靜態斷言看的是字串，看不出檔案在不在。

function localRequires(file) {
  const source = fs.readFileSync(file, 'utf8')
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  return [...code.matchAll(/require\(\s*'(\.[^']+)'\s*\)/g)].map((m) => m[1])
}

const ENTRY_POINTS = ['electron/main.cjs', 'electron/preload.cjs']

for (const entry of ENTRY_POINTS) {
  test(`${entry} 的每一個相對 require 都真的解析得開`, () => {
    const file = path.join(root, entry)
    const dir = path.dirname(file)
    const missing = []
    for (const spec of localRequires(file)) {
      try {
        Module.createRequire(path.join(dir, 'x.cjs')).resolve(spec)
      } catch {
        missing.push(spec)
      }
    }
    assert.deepEqual(missing, [], `${entry} require 不到：${missing.join(', ')}`)
  })
}

test('主行程依賴的 shared 模組彼此的 require 也解析得開', () => {
  const dir = path.join(root, 'shared')
  const missing = []
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.cjs'))) {
    const file = path.join(dir, name)
    for (const spec of localRequires(file)) {
      try {
        Module.createRequire(file).resolve(spec)
      } catch {
        missing.push(`${name} -> ${spec}`)
      }
    }
  }
  assert.deepEqual(missing, [], `解析不到：${missing.join(', ')}`)
})

test('shared 模組可以實際載入，不只是路徑存在', () => {
  // 路徑對但檔案本身有語法錯誤時，require 一樣會炸掉主行程
  const dir = path.join(root, 'shared')
  const broken = []
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.cjs'))) {
    try {
      require(path.join(dir, name))
    } catch (error) {
      broken.push(`${name}: ${error.message}`)
    }
  }
  assert.deepEqual(broken, [], `載入失敗：${broken.join(' | ')}`)
})
