const WORKBENCH_MODULE_IDS = Object.freeze(['play', 'look', 'room', 'system'])
const WORKBENCH_SURFACES = Object.freeze(['glass', 'white'])

const DEFAULT_WORKBENCH = Object.freeze({
  activeModule: '',
  surface: 'glass',
  modules: Object.freeze({
    play: Object.freeze({ x: -0.34, y: -0.26 }),
    look: Object.freeze({ x: 0.34, y: -0.23 }),
    room: Object.freeze({ x: -0.28, y: 0.27 }),
    system: Object.freeze({ x: 0.29, y: 0.27 }),
  }),
})

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function point(value, fallback) {
  return {
    x: clamp(Number.isFinite(value?.x) ? value.x : fallback.x, -0.42, 0.42),
    y: clamp(Number.isFinite(value?.y) ? value.y : fallback.y, -0.34, 0.34),
  }
}

function normalizeWorkbench(raw) {
  const modules = Object.fromEntries(WORKBENCH_MODULE_IDS.map((id) => [
    id,
    point(raw?.modules?.[id], DEFAULT_WORKBENCH.modules[id]),
  ]))
  const activeModule = raw?.activeModule === '' || WORKBENCH_MODULE_IDS.includes(raw?.activeModule)
    ? raw.activeModule
    : DEFAULT_WORKBENCH.activeModule
  const surface = WORKBENCH_SURFACES.includes(raw?.surface) ? raw.surface : DEFAULT_WORKBENCH.surface
  return { activeModule, surface, modules }
}

function moveWorkbenchModule(workbench, moduleId, target) {
  const current = normalizeWorkbench(workbench)
  if (!WORKBENCH_MODULE_IDS.includes(moduleId)) return current
  return {
    ...current,
    modules: { ...current.modules, [moduleId]: point(target, current.modules[moduleId]) },
  }
}

module.exports = { WORKBENCH_MODULE_IDS, WORKBENCH_SURFACES, DEFAULT_WORKBENCH, normalizeWorkbench, moveWorkbenchModule }
