import { useEffect, useRef, useState } from 'react'
import { ov } from './overlayBridge.js'
import { applyScheduledState, positionMsOf, shouldScheduleVisualTick } from './roomClockRuntime.js'

export { applyScheduledState, positionMsOf, shouldScheduleVisualTick }

// 房間狀態 + 播放時鐘（成員/主持人共用）。
// clockRef 存 {positionMs, playing, at}；用本地時鐘內插出平滑進度。
export function useRoom() {
  const [status, setStatus] = useState({ mode: null })
  const [members, setMembers] = useState([])
  const [state, setState] = useState(null) // { song, lines, timed }
  const [playing, setPlaying] = useState(false)
  const [queue, setQueue] = useState([])
  const [capabilities, setCapabilities] = useState({ 'song.request': true, 'queue.manage': false, 'playback.control': false })
  const [commandResult, setCommandResult] = useState(null)
  const [clockRevision, setClockRevision] = useState(0)
  const clockRef = useRef({ positionMs: 0, playing: false, at: 0 })

  useEffect(() => {
    let mounted = true
    const setClock = (positionMs, nextPlaying) => {
      const active = !!nextPlaying
      clockRef.current = { positionMs: positionMs || 0, playing: active, at: performance.now() }
      setPlaying((previous) => previous === active ? previous : active)
      if (!active) setClockRevision((revision) => revision + 1)
    }
    ov.room.snapshot().then((snap) => {
      if (!mounted || !snap) return
      setStatus({ mode: snap.mode, roomName: snap.roomName, code: snap.code, ip: snap.ip, selfId: snap.selfId, capabilities: snap.capabilities })
      setMembers(snap.members || [])
      setQueue(snap.queue || [])
      if (snap.capabilities) setCapabilities(snap.capabilities)
      if (snap.state) { setState(snap.state); setClock(snap.state.positionMs, snap.state.playing) }
    })
    const offState = ov.room.onState((s) => {
      if (!s) {
        setState(null)
        setClock(0, false)
        return
      }
      setState(s)
      setClock(s.positionMs, s.playing)
    })
    const offTick = ov.room.onTick((t) => setClock(t.positionMs, t.playing))
    const offMembers = ov.room.onMembers((m) => setMembers(m || []))
    const offStatus = ov.room.onStatus((s) => setStatus((prev) => ({ ...prev, ...s })))
    const offQueue = ov.room.onQueue((items) => setQueue(items || []))
    const offCapabilities = ov.room.onCapabilities((value) => {
      setCapabilities(value || {})
      setStatus((previous) => ({ ...previous, capabilities: value || {} }))
    })
    const offCommandResult = ov.room.onCommandResult(setCommandResult)
    return () => { mounted = false; offState(); offTick(); offMembers(); offStatus(); offQueue(); offCapabilities(); offCommandResult() }
  }, [])

  return { status, members, state, setState, clockRef, clockRevision, playing, queue, capabilities, commandResult }
}
