import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fitPreviewCapsule } from '../src/consolePreviewFit.js'

const source = fs.readFileSync(new URL('../src/ConsoleWindow.jsx', import.meta.url), 'utf8')
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8')
const capsule = fs.readFileSync(new URL('../src/components/Capsule.jsx', import.meta.url), 'utf8')

test('preview capsule scales down to fit both available dimensions without enlarging small pills', () => {
  assert.equal(fitPreviewCapsule({ stageWidth: 400, stageHeight: 160, pillWidth: 500, pillHeight: 90 }), 0.768)
  assert.equal(fitPreviewCapsule({ stageWidth: 400, stageHeight: 120, pillWidth: 240, pillHeight: 160 }), 0.65)
  assert.equal(fitPreviewCapsule({ stageWidth: 400, stageHeight: 160, pillWidth: 240, pillHeight: 80 }), 1)
})

test('preview fit keeps the first render visible when dimensions are not ready', () => {
  assert.equal(fitPreviewCapsule({ stageWidth: 0, stageHeight: 160, pillWidth: 240, pillHeight: 80 }), 1)
})

test('console preview establishes a contained fixed-position stage and observes both sizes', () => {
  assert.match(source, /import \{ fitPreviewCapsule \} from '\.\/consolePreviewFit\.js'/)
  assert.match(source, /className="console-capsule-preview__fit"/)
  assert.match(source, /<Capsule[\s\S]*innerRef=\{capsuleRef\}/)
  assert.match(source, /new ResizeObserver\(schedule\)/)
  assert.match(css, /\.console-capsule-preview\s*\{[\s\S]*position:\s*relative[\s\S]*overflow:\s*clip/)
  assert.match(css, /\.console-capsule-preview__fit\s*\{[\s\S]*position:\s*absolute[\s\S]*transform:\s*scale\(var\(--preview-scale,\s*1\)\)/)
})

test('preview positions the real glass in the stage center instead of the desktop viewport', () => {
  assert.match(capsule, /style=\{preview \? \{ position: 'absolute', top: '50%', left: '50%' \} : \{ position: 'fixed' \}\}/)
})
