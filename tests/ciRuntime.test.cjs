const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')

test('CI uses a Node runtime that provides the local SQLite API', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8')
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

  assert.match(workflow, /node-version:\s*22(?:\.x)?\b/, 'CI must use Node 22 or newer')
  assert.equal(pkg.engines?.node, '>=22.12.0')
})

test('CI validates the public release configuration before building', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8')

  assert.match(workflow, /run:\s*npm ci --ignore-scripts --no-audit --no-fund/)
  assert.match(workflow, /run:\s*npm run release:check/)
  assert.match(workflow, /LUCENT_UPDATE_REPOSITORY:\s*Rex11929282\/lucent-updates/)
  assert.match(workflow, /LUCENT_RELEASE_CHANNEL:\s*stable/)
})
