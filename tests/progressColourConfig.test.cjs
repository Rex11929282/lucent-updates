const test = require('node:test')
const assert = require('node:assert/strict')
const schema = require('../shared/defaults.json')
const { migrateState } = require('../shared/stateMigration.cjs')

test('current schema supplies a safe custom progress colour and rejects malformed values', () => {
  const legacy = migrateState({ schemaVersion: 20, cfg: {} }, schema)
  const custom = migrateState({ schemaVersion: 20, cfg: { barFillColor: '#12ab34' } }, schema)
  const malformed = migrateState({ schemaVersion: 20, cfg: { barFillColor: 'not-a-colour' } }, schema)

  assert.equal(schema.schemaVersion, 22)
  assert.equal(legacy.cfg.barFillColor, '#ffffff')
  assert.equal(custom.cfg.barFillColor, '#12ab34')
  assert.equal(malformed.cfg.barFillColor, '#ffffff')
})
