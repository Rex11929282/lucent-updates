import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import {
  HOME_CAT_ACTIONS,
  HOME_CAT_ACTION_SPEC,
  HOME_CAT_SLEEP_AFTER_MS,
  clampHomeCatX,
  homeCatActionSpec,
  nextHomeCatAction,
} from '../src/homeCat.js'

test('首頁未顯示時不排程任何貓咪動作', () => {
  assert.equal(nextHomeCatAction({ homeVisible: false, appVisible: true, inactiveMs: 0, roll: 0.2 }), 'idle')
  assert.equal(nextHomeCatAction({ homeVisible: true, appVisible: false, inactiveMs: 0, roll: 0.2 }), 'idle')
})

test('閒置達門檻才進入睡覺狀態', () => {
  assert.notEqual(
    nextHomeCatAction({ homeVisible: true, appVisible: true, inactiveMs: HOME_CAT_SLEEP_AFTER_MS - 1, roll: 0.8 }),
    'sleep',
  )
  assert.equal(
    nextHomeCatAction({ homeVisible: true, appVisible: true, inactiveMs: HOME_CAT_SLEEP_AFTER_MS, roll: 0.1 }),
    'sleep',
  )
})

test('跑跳位置永遠限制在首頁活動區內', () => {
  assert.equal(clampHomeCatX(-0.4), 0)
  assert.equal(clampHomeCatX(1.4), 1)
  assert.equal(clampHomeCatX(0.42), 0.42)
})

test('走路、跑步、跳、吃、理毛、伸懶腰都排得到', () => {
  const seen = new Set()
  for (let roll = 0; roll < 1; roll += 0.01) {
    seen.add(nextHomeCatAction({ homeVisible: true, appVisible: true, inactiveMs: 0, roll }))
  }
  for (const action of ['walk', 'run', 'jump', 'eat', 'groom', 'stretch', 'idle']) {
    assert.ok(seen.has(action), `${action} 應該有機會被排到`)
  }
  // 睡覺只在閒置久了才出現，不該被隨機抽到
  assert.equal(seen.has('sleep'), false)
})

test('每個動作都有完整的播放參數，且只有移動類動作會換位置', () => {
  for (const action of HOME_CAT_ACTIONS) {
    const spec = HOME_CAT_ACTION_SPEC[action]
    assert.ok(spec, `${action} 缺少參數`)
    assert.equal(typeof spec.row, 'number')
    assert.equal(spec.frames, 8, `${action} 的格數必須與 sprite sheet 的每列格數一致`)
    assert.ok(spec.ms > 0 && spec.hold > 0, `${action} 的時間必須是正數`)
  }
  assert.deepEqual(
    HOME_CAT_ACTIONS.filter((a) => HOME_CAT_ACTION_SPEC[a].moves),
    ['walk', 'run', 'jump'],
  )
  assert.equal(homeCatActionSpec('不存在的動作').row, HOME_CAT_ACTION_SPEC.idle.row)
})

test('動作列順序與骨架產生器一致', async () => {
  const { ORDER } = await import('../scripts/catPoses.cjs')
  assert.deepEqual(ORDER, HOME_CAT_ACTIONS)
  HOME_CAT_ACTIONS.forEach((action, index) => {
    assert.equal(HOME_CAT_ACTION_SPEC[action].row, index, `${action} 的列號要對上 sheet 的第 ${index} 列`)
  })
})

test('每個動作的 8 格骨架都不一樣（舊版每格畫同一隻，看起來是靜止的）', async () => {
  const { ACTIONS, ORDER } = await import('../scripts/catPoses.cjs')
  for (const action of ORDER) {
    const frames = ACTIONS[action]
    assert.equal(frames.length, 8, `${action} 應該有 8 格`)
    const shapes = new Set(frames.map((pose) => JSON.stringify(pose)))
    assert.ok(shapes.size > 1, `${action} 的 8 格不能全部相同，否則動畫看起來不會動`)
  }
})

test('sprite sheet 是 512×512 的 PNG，對得上 8×8 的排列', () => {
  const png = fs.readFileSync(new URL('../public/lucent-cat-sprite.png', import.meta.url))
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], '應該是 PNG')
  // IHDR 緊接在檔頭之後：長度(4) + 'IHDR'(4) + 寬(4) + 高(4)
  assert.equal(png.readUInt32BE(16), 8 * 64, '寬 = 8 格 × 64px')
  assert.equal(png.readUInt32BE(20), 8 * 64, '高 = 8 個動作 × 64px')
})
