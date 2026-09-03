export function createFeedbackQueue() {
  let nextId = 1
  let notice = null
  let confirmation = null

  return {
    push({ tone = 'info', message = '' } = {}) {
      notice = { id: nextId++, tone, message: String(message) }
      return notice
    },
    current() {
      return notice
    },
    dismiss(id) {
      if (notice?.id === id) notice = null
    },
    takeConfirm({ title = '請確認', message = '', confirmLabel = '確定' } = {}) {
      confirmation = { id: nextId++, title, message, confirmLabel }
      return confirmation
    },
    currentConfirm() {
      return confirmation
    },
    dismissConfirm(id) {
      if (confirmation?.id === id) confirmation = null
    },
  }
}
