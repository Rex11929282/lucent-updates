import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as appearance from '../src/appearanceModel.js'

const capsule = fs.readFileSync(new URL('../src/components/Capsule.jsx', import.meta.url), 'utf8')
const styles = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const consoleSource = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')

test('lyric layout presets keep a distinct safe presentation contract', () => {
  assert.equal(typeof appearance.lyricLayoutValues, 'function')
  assert.deepEqual(Object.keys(appearance.LYRIC_LAYOUTS), [
    'balanced', 'concert', 'bilingual', 'compact', 'album',
  ])

  const balanced = appearance.lyricLayoutValues('balanced', 'auto')
  const concert = appearance.lyricLayoutValues('concert', 'auto')
  const bilingual = appearance.lyricLayoutValues('bilingual', 'auto')
  const compact = appearance.lyricLayoutValues('compact', 'auto')
  const album = appearance.lyricLayoutValues('album', 'auto')

  assert.equal(balanced.align, 'center')
  assert.equal(concert.mainScale > balanced.mainScale, true)
  assert.equal(bilingual.align, 'left')
  assert.equal(compact.translationVisible, false)
  assert.equal(album.nameScale > balanced.nameScale, true)
  assert.equal(appearance.lyricLayoutValues('unknown', 'right').align, 'right')
})

test('lyric font choices always resolve to a safe installed-font fallback', () => {
  assert.equal(typeof appearance.lyricFontStack, 'function')
  assert.equal(appearance.LYRIC_FONT_OPTIONS.some((option) => option.id === 'system'), true)
  assert.match(appearance.lyricFontStack('system'), /Microsoft JhengHei/)
  assert.match(appearance.lyricFontStack('modern'), /Segoe UI/)
  assert.equal(appearance.lyricFontStack('missing-font'), appearance.lyricFontStack('system'))
})

test('Capsule and settings share the layout/font variables instead of a second preview renderer', () => {
  assert.match(capsule, /layout-\$\{lyricLayout\.id\}/)
  assert.match(capsule, /--lyrics-font/)
  assert.match(capsule, /--translation-font/)
  assert.match(capsule, /--lyric-main-size/)
  assert.match(styles, /--lyric-align-items/)
  assert.match(styles, /--translation-size/)
  assert.match(consoleSource, /t\('look\.layout\.title'\)/)
  assert.match(consoleSource, /t\('look\.font\.lyric'\)/)
})
