export function createPlayer({ frames, states, preview, activeFrame, hoverFrame,
                               emitSelectSequence, emitCurrent, handleHover }) {
  function listStateNames() {
    return Object.keys(states.value)
  }

  function normalizeLoop(loop) {
    if (loop === 'once' || loop === 'repeat' || loop === 'alternate') return loop
    const n = Number(loop)
    if (Number.isFinite(n) && n > 0) return Math.floor(n)
    return 'repeat'
  }

  function buildPingPongIndices(n) {
    if (n <= 1) return [0]
    const fwd = Array.from({ length: n }, (_, i) => i)
    const back = Array.from({ length: n - 2 }, (_, i) => n - 2 - i)
    return fwd.concat(back)
  }

  function stateFrameAtTime(stateName, tMs) {
    const st = states.value[stateName]
    if (!st || !Array.isArray(st.sequence) || st.sequence.length === 0) return null

    const seq = st.sequence
    const loop = normalizeLoop(st.loop)
    const n = seq.length

    const indices = loop === 'alternate' ? buildPingPongIndices(n) : Array.from({ length: n }, (_, i) => i)
    const cycleDur = indices.reduce((sum, idx) => sum + Math.max(0, Number(seq[idx]?.[1]) || 0), 0)

    if (cycleDur <= 0) return seq[indices[0]]?.[0] || null

    let maxCycles = Infinity
    if (loop === 'once') maxCycles = 1
    else if (typeof loop === 'number') maxCycles = loop

    const cycleCount = Math.floor(tMs / cycleDur)
    if (cycleCount >= maxCycles) {
      const lastIdx = indices[indices.length - 1]
      return seq[lastIdx]?.[0] || null
    }

    let local = tMs % cycleDur
    for (const idx of indices) {
      const dur = Math.max(0, Number(seq[idx]?.[1]) || 0)
      if (local < dur) return seq[idx]?.[0] || null
      local -= dur
    }

    const lastIdx = indices[indices.length - 1]
    return seq[lastIdx]?.[0] || null
  }

  function pickDefaultFrameName() {
    const names = Object.keys(frames.value)
    return names[0] || ''
  }

  function activeStateFrameSet() {
    const st = states.value[preview.state]
    if (!st || !Array.isArray(st.sequence)) return new Set()
    return new Set(st.sequence.map(s => s?.[0]).filter(Boolean))
  }

  function currentPlayheadFrameName() {
    if (activeFrame.value) return activeFrame.value
    if (preview.manualFrameName && frames.value[preview.manualFrameName]) return preview.manualFrameName
    const s = preview.state
    const f = s ? stateFrameAtTime(s, preview.t) : null
    if (f && frames.value[f]) return f
    return pickDefaultFrameName()
  }

  function pickPreviewFrameName() {
    if (activeFrame.value) return activeFrame.value
    if (preview.manualFrameName && frames.value[preview.manualFrameName]) return preview.manualFrameName
    return currentPlayheadFrameName()
  }

  function previewFrameOrder() {
    const st = states.value[preview.state]
    if (st && Array.isArray(st.sequence) && st.sequence.length) {
      const names = st.sequence.map(s => s?.[0]).filter(Boolean)
      return names.filter((n, i) => names.indexOf(n) === i).filter(n => frames.value[n])
    }
    return Object.keys(frames.value)
  }

  function stepPreviewFrame(dir) {
    if (activeFrame.value) return

    const order = previewFrameOrder()
    if (!order.length) return

    const current = currentPlayheadFrameName()
    const i = Math.max(0, order.indexOf(current))
    const n = order.length
    const j = ((i + dir) % n + n) % n

    preview.playing = false
    preview.manualFrameName = order[j]
    hoverFrame.value = ''
    handleHover('')
  }

  function stepState(dir) {
    const names = listStateNames()
    if (!names.length) return
    const i = Math.max(0, names.indexOf(preview.state))
    const n = names.length
    const j = ((i + dir) % n + n) % n

    preview.state = names[j]
    preview.t = 0
    preview.manualFrameName = ''

    emitSelectSequence(preview.state)
    // lastCurrentName = null is redundant: force=true in emitCurrent bypasses the equality check
    emitCurrent(currentPlayheadFrameName(), true)
  }

  return {
    listStateNames,
    stateFrameAtTime,
    activeStateFrameSet,
    currentPlayheadFrameName,
    pickPreviewFrameName,
    previewFrameOrder,
    stepPreviewFrame,
    stepState
  }
}
