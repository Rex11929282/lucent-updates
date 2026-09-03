import test from 'node:test'
import assert from 'node:assert/strict'
import { createFeedbackQueue } from '../src/consoleFeedback.js'

test('feedback queue keeps the latest actionable notice and dismisses it by id', () => {
  const queue = createFeedbackQueue()
  const first = queue.push({ tone: 'info', message: '正在連接' })
  const notice = queue.push({ tone: 'error', message: '無法加入房間' })

  assert.equal(queue.current().id, notice.id)
  queue.dismiss(first.id)
  assert.equal(queue.current().id, notice.id)
  queue.dismiss(notice.id)
  assert.equal(queue.current(), null)
})

test('feedback queue keeps one explicit confirmation request', () => {
  const queue = createFeedbackQueue()
  const request = queue.takeConfirm({ title: '刪除歌單', message: '無法復原', confirmLabel: '刪除' })

  assert.deepEqual(queue.currentConfirm(), request)
  queue.dismissConfirm(request.id)
  assert.equal(queue.currentConfirm(), null)
})
