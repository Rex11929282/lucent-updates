const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

test('CI uses a Node runtime that provides the local SQLite API', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8')
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

  assert.match(workflow, /node-version:\s*22(?:\.x)?\b/, 'CI must use Node 22 or newer')
  assert.equal(pkg.engines?.node, '>=22.5.0')
})
