import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = path.join(root, 'src')

function sourceFiles() {
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(jsx?|mjs)$/.test(entry.name)) out.push(full)
    }
  }
  walk(srcDir)
  return out
}

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const read = (file) => stripComments(fs.readFileSync(file, 'utf8'))
const relative = (file) => path.relative(root, file).replace(/\\/g, '/')

// Song titles, artists, lyrics and artwork URLs all come from NetEase or from
// another machine in a LAN room. None of it is trustworthy.

test('no renderer code can turn external text into markup', () => {
  const offenders = []
  for (const file of sourceFiles()) {
    const code = read(file)
    for (const pattern of [/dangerouslySetInnerHTML/, /\.innerHTML\s*=/, /\.outerHTML\s*=/, /document\.write\(/, /\beval\(/, /new Function\(/]) {
      if (pattern.test(code)) offenders.push(`${relative(file)} :: ${pattern}`)
    }
  }
  assert.deepEqual(offenders, [], `external metadata could reach an HTML/JS sink:\n  ${offenders.join('\n  ')}`)
})

test('artwork URLs are never concatenated into a stylesheet', () => {
  // Interpolating a cover URL into a style *value* is safe: React assigns it
  // through element.style.setProperty, and CSSOM rejects a value with
  // unbalanced quotes or parens, so a breakout attempt is simply dropped.
  //
  // Building a stylesheet *string* removes that protection entirely — the CSS
  // parser would then see the attacker's tokens as syntax. Verified against a
  // live window: `url("x"),red;background:url("http://…` was rejected via
  // setProperty. This test exists so that guarantee cannot be refactored away.
  const offenders = []
  for (const file of sourceFiles()) {
    const code = read(file)
    for (const pattern of [
      /\.cssText\s*=/,
      /insertRule\s*\(/,
      /createElement\(\s*['"]style['"]\s*\)/,
      /<style[^>]*>\s*\{`/,
    ]) {
      if (pattern.test(code)) offenders.push(`${relative(file)} :: ${pattern}`)
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `a stylesheet built as a string would make artwork URLs injectable:\n  ${offenders.join('\n  ')}`,
  )
})

test('external song fields are coerced to strings before leaving the coordinator', () => {
  // A peer can send any JSON type. Objects or arrays reaching the renderer as a
  // "title" would render as [object Object] at best.
  const coordinator = fs.readFileSync(path.join(root, 'shared', 'playbackCoordinator.cjs'), 'utf8')
  for (const field of ['name', 'artist', 'album', 'cover', 'artistImageUrl', 'avatar']) {
    assert.match(
      coordinator,
      new RegExp(`${field}:\\s*String\\(`),
      `song.${field} must be coerced to a string`,
    )
  }
})

test('the capsule keeps artwork in a style value, not in raw CSS syntax', () => {
  const capsule = read(path.join(srcDir, 'components', 'Capsule.jsx'))
  // The cover is assigned as a custom property value through the style object.
  assert.match(capsule, /'--cover-img':/, 'the cover should stay a CSS custom property')
  // And it must not be spliced into a selector or a whole declaration block.
  assert.doesNotMatch(capsule, /`[^`]*\{[^`]*\$\{\s*coverUrl/, 'coverUrl must not be placed inside a CSS block')
})
