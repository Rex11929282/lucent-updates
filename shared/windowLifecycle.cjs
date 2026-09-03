function shouldHideWindowOnClose(explicitQuit) {
  return explicitQuit !== true
}

function resolveConsoleCloseAction(closeBehavior, explicitQuit) {
  if (explicitQuit === true) return 'quit'
  return ['pill', 'tray', 'quit'].includes(closeBehavior) ? closeBehavior : 'ask'
}

module.exports = { shouldHideWindowOnClose, resolveConsoleCloseAction }
