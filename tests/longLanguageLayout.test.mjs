import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8')

// Task document §32: no clipped text, no overlapping text, no controls too
// narrow to read. Both defects below were invisible to an automated DOM scan —
// a scrollWidth/getBoundingClientRect sweep reported the settings page as clean
// in all five languages. They were only found by looking at a screenshot in
// Russian and Japanese. These assertions pin the CSS that fixes them.

function rule(selector) {
  // Grab the declaration block for a selector, comments stripped.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = clean.match(new RegExp(`(^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'))
  return match ? match[2].replace(/\s+/g, ' ').trim() : null
}

test('§32: a settings hint never runs on from its own label', () => {
  // The hint is a <small> nested inside the label span, so it is inline by
  // default. In Chinese the label is short enough to hide it; in Russian it
  // rendered as "Язык интерфейсаИзменения применяются сразу…" and in Japanese
  // as "表示言語すぐに反映され…". The .row--hinted modifier makes the label a
  // grid, but it is not present on every hinted row, so the hint itself has to
  // break the line.
  const hint = rule('.row__hint')
  assert.ok(hint, '.row__hint rule should exist')
  assert.match(hint, /display:\s*block/, 'the hint must be block-level, not inline')
})

test('§32: the settings control column can grow past the Chinese-sized default', () => {
  // A hard 118px column fits Chinese option text and clips everything longer:
  // "Полностью (ходит по экрану)", "システムに合わせる", "Português (Brasil)".
  // A label can wrap; a native <select> cannot, so the label column gives way.
  const row = rule('.row')
  assert.ok(row, '.row rule should exist')
  assert.doesNotMatch(row, /grid-template-columns:\s*1fr 118px 52px/, 'the fixed control column is the bug')
  assert.match(row, /minmax\(\s*118px\s*,\s*max-content\s*\)/, 'the control column must grow to its content')
  assert.match(row, /minmax\(\s*0\s*,\s*1fr\s*\)/, 'the label column must be allowed to shrink and wrap')
})

test('§33: the font stack covers every script the UI ships in', () => {
  // Eleven locales span Latin, Cyrillic, Traditional and Simplified Chinese,
  // Japanese and Korean. A missing family shows tofu boxes.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const stack = clean.match(/font-family:[^;]*Segoe UI[^;]*;/)
  assert.ok(stack, 'the base font stack should be declared')
  const declared = stack[0]
  for (const [script, family] of [
    ['Traditional Chinese', /Microsoft JhengHei|Noto Sans TC/],
    ['Simplified Chinese', /Microsoft YaHei|Noto Sans SC/],
    ['Japanese', /Yu Gothic|Meiryo|Noto Sans JP/],
    ['Korean', /Malgun Gothic|Noto Sans KR/],
  ]) {
    assert.match(declared, family, `no font declared for ${script}`)
  }
  assert.match(declared, /system-ui|sans-serif/, 'a generic fallback must terminate the stack')
})
