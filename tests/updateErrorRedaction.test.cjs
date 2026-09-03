const test = require('node:test')
const assert = require('node:assert/strict')

const { publicError } = require('../electron/updateService.cjs')

// Update failures are rendered in the UI, and .github/ISSUE_TEMPLATE asks
// reporters to paste them into public issues. On Windows nearly every path
// embeds the account name (C:\Users\<name>\...), so a path that survives
// redaction becomes a real disclosure the moment someone files a bug.
const NAME = 'jsmith'

const CASES = [
  ['backslash drive path', `ENOENT: no such file, open 'C:\\Users\\${NAME}\\AppData\\Local\\lucent-updater\\p.exe'`],
  ['forward-slash drive path', `cannot stat C:/Users/${NAME}/AppData/Local/Temp/update.exe`],
  ['file:// URL', `file:///C:/Users/${NAME}/AppData/Local/Temp/update.exe not found`],
  ['file:// two-slash form', `file://C:/Users/${NAME}/Temp/update.exe missing`],
  ['extended-length prefix', `cannot resolve \\\\?\\C:\\Users\\${NAME}\\AppData\\Roaming\\lucent-lyrics`],
  ['UNC share', `EPERM: rename \\\\fileserver\\deploy\\${NAME}\\a -> b`],
  ['lowercase drive letter', `open 'd:\\builds\\${NAME}\\latest.yml' failed`],
  ['path inside a longer sentence', `Failed to move C:\\Users\\${NAME}\\x.exe into place, giving up`],
]

for (const [label, message] of CASES) {
  test(`the account name never survives redaction: ${label}`, () => {
    const out = publicError(message)
    assert.doesNotMatch(out, new RegExp(NAME, 'i'), `leaked through ${label}: ${out}`)
    assert.match(out, /本機檔案/, 'the path should be replaced, not just dropped')
  })
}

test('messages carrying no path are left readable', () => {
  // Over-redacting is its own failure: a user who cannot read the error cannot
  // act on it, and a maintainer cannot triage it.
  const network = 'failed to download update: connect ETIMEDOUT 140.82.121.4:443'
  assert.equal(publicError(network), network)

  const http = 'HTTP 404 while fetching latest.yml from the release feed'
  assert.equal(publicError(http), http)
})

test('http and https URLs survive intact', () => {
  // Regression: the drive-letter rule `[A-Za-z]:[\\/]` also matched the "s:/"
  // inside "https://", so every update URL became "http本機檔案" — deleting the
  // single detail a maintainer needs to diagnose a failed download. A drive
  // letter is one letter, so an alphanumeric immediately before it rules it out.
  const cases = [
    'HTTP 404 fetching https://github.com/owner/repo/releases/latest.yml',
    'connect ETIMEDOUT to https://objects.githubusercontent.com/abc',
    'redirect to http://example.com/update.exe failed',
    'ftp://mirror.example.com/lucent.exe refused',
  ]
  for (const message of cases) {
    assert.equal(publicError(message), message, `must not rewrite: ${message}`)
    assert.doesNotMatch(publicError(message), /本機檔案/, 'a remote URL is not a local path')
  }
})

test('a real drive path next to a URL is still redacted', () => {
  // The two rules have to coexist in one message.
  const out = publicError('failed to move C:\\Users\\jsmith\\a.exe after fetching https://example.com/a.exe')
  assert.doesNotMatch(out, /jsmith/, 'the local path must still be redacted')
  assert.match(out, /https:\/\/example\.com\/a\.exe/, 'the remote URL must survive')
})

test('surrounding words survive so the message still makes sense', () => {
  const out = publicError(`Failed to move C:\\Users\\${NAME}\\x.exe into place, giving up`)
  assert.match(out, /^Failed to move /, 'the leading text must remain')
  assert.match(out, /giving up$/, 'the trailing text must remain')
})

test('accepts Error objects, plain strings and nothing at all', () => {
  assert.match(publicError(new Error(`open C:\\Users\\${NAME}\\a`)), /本機檔案/)
  assert.equal(publicError(''), '更新失敗')
  assert.equal(publicError(null), '更新失敗')
  assert.equal(publicError(undefined), '更新失敗')
})

test('output stays bounded so a huge error cannot flood the UI', () => {
  assert.equal(publicError('x'.repeat(5000)).length, 300)
})
