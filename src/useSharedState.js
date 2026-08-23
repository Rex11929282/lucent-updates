import { useCallback, useEffect, useState } from 'react'
import { ov } from './overlayBridge.js'
import { DEFAULT_STATE } from './defaults.js'

// 兩個視窗（藥丸 / 設定）共用同一份狀態，透過主行程同步。
export function useSharedState() {
  const [state, setState] = useState(DEFAULT_STATE)

  useEffect(() => {
    let mounted = true
    ov.stateGet().then((s) => {
      if (mounted && s) setState(s)
    })
    const unsub = ov.onStateChanged((s) => s && setState(s))
    return () => {
      mounted = false
      unsub && unsub()
    }
  }, [])

  const setGlass = useCallback((p) => {
    setState((prev) => ({ ...prev, glass: { ...prev.glass, ...p } }))
    ov.stateSet({ glass: p })
  }, [])

  const setCfg = useCallback((p) => {
    setState((prev) => ({ ...prev, cfg: { ...prev.cfg, ...p } }))
    ov.stateSet({ cfg: p })
  }, [])

  const setLyricsRaw = useCallback((raw) => {
    setState((prev) => ({ ...prev, lyricsRaw: raw }))
    ov.stateSet({ lyricsRaw: raw })
  }, [])

  const setProfiles = useCallback((profiles) => {
    setState((prev) => ({ ...prev, profiles }))
    ov.stateSet({ profiles })
  }, [])

  const setUi = useCallback((patch) => {
    setState((prev) => ({ ...prev, ui: { ...prev.ui, ...patch } }))
    ov.stateSet({ ui: patch })
  }, [])

  const setUpdates = useCallback((patch) => {
    setState((prev) => ({ ...prev, updates: { ...prev.updates, ...patch } }))
    ov.updates.setSettings(patch)
  }, [])

  return { state, setGlass, setCfg, setLyricsRaw, setProfiles, setUi, setUpdates }
}
