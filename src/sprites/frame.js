import { clamp, HANDLE } from './pan-zoom.js'

// Pure — no shared state
export function readFrame(f) {
  if (!Array.isArray(f) || f.length < 4) return null

  const x = Number(f[0]) || 0
  const y = Number(f[1]) || 0
  const w = Number(f[2]) || 0
  const h = Number(f[3]) || 0

  let ox = typeof f[4] === 'number' ? f[4] : 0.5
  let oy = typeof f[5] === 'number' ? f[5] : 1

  ox = clamp(ox, 0, 1)
  oy = clamp(oy, 0, 1)

  return { x, y, w, h, ox, oy }
}

// Factory — needs frames ref, view (for scale in hitOrigin), panZoom utilities
export function createFrameOps({ frames, view, panZoom }) {
  const { roundInt, sheetToWorld } = panZoom

  function rectWorldBounds(f) {
    const rf = readFrame(f)
    if (!rf) return { x1: 0, y1: 0, x2: 0, y2: 0 }
    const tl = sheetToWorld(rf.x, rf.y)
    const br = sheetToWorld(rf.x + rf.w, rf.y + rf.h)
    return { x1: tl.x, y1: tl.y, x2: br.x, y2: br.y }
  }

  function hitRect(worldX, worldY, f) {
    const b = rectWorldBounds(f)
    return worldX >= b.x1 && worldX <= b.x2 && worldY >= b.y1 && worldY <= b.y2
  }

  function hitHandle(worldX, worldY, f) {
    const b = rectWorldBounds(f)
    const hx = (b.x1 + b.x2) / 2
    const hy = (b.y1 + b.y2) / 2

    const pts = [
      { k: 'nw', x: b.x1, y: b.y1 },
      { k: 'n', x: hx, y: b.y1 },
      { k: 'ne', x: b.x2, y: b.y1 },
      { k: 'e', x: b.x2, y: (b.y1 + b.y2) / 2 },
      { k: 'se', x: b.x2, y: b.y2 },
      { k: 's', x: hx, y: b.y2 },
      { k: 'sw', x: b.x1, y: b.y2 },
      { k: 'w', x: b.x1, y: (b.y1 + b.y2) / 2 }
    ]

    for (const p of pts) {
      if (Math.abs(worldX - p.x) <= HANDLE && Math.abs(worldY - p.y) <= HANDLE) return p.k
    }
    return null
  }

  function originWorldPos(f) {
    const rf = readFrame(f)
    if (!rf) return sheetToWorld(0, 0)
    return sheetToWorld(rf.x + rf.ox * rf.w, rf.y + rf.oy * rf.h)
  }

  function hitOrigin(worldX, worldY, f) {
    const o = originWorldPos(f)
    const r = Math.max(6, 3 + view.scale * 1.5) // CSS px
    const dx = worldX - o.x
    const dy = worldY - o.y
    return dx * dx + dy * dy <= r * r
  }

  // Mutating write used ONLY for real edits
  function writeFrame(name, next) {
    const f = frames.value[name]
    if (!Array.isArray(f) || f.length < 4) return false

    let changed = false
    const set = (i, v) => {
      if (f[i] !== v) {
        f[i] = v
        changed = true
      }
    }

    set(0, next.x)
    set(1, next.y)
    set(2, next.w)
    set(3, next.h)

    if (f.length < 6) {
      f[4] = next.ox
      f[5] = next.oy
      changed = true
    } else {
      set(4, next.ox)
      set(5, next.oy)
    }

    return changed
  }

  let logT = 0

  function scheduleLog() {
    clearTimeout(logT)
    logT = setTimeout(() => {
      const out = Object.entries(frames.value)
        .filter(([, v]) => Array.isArray(v) && v.length >= 6)
        .map(([k, v]) => `  ${k}: [${v[0]}, ${v[1]}, ${v[2]}, ${v[3]}, ${Number(v[4].toFixed(3))}, ${Number(v[5].toFixed(3))}]`)
        .join('\n')
      console.log(`frames:\n${out}`)
    }, 150)
  }

  function cancelScheduledLog() {
    clearTimeout(logT)
  }

  function applyOriginToFrame(name, sheetX, sheetY) {
    const f = frames.value[name]
    const rf = readFrame(f)
    if (!rf) return

    const denomW = rf.w || 1
    const denomH = rf.h || 1

    const ox = clamp((sheetX - rf.x) / denomW, 0, 1)
    const oy = clamp((sheetY - rf.y) / denomH, 0, 1)

    const changed = writeFrame(name, { ...rf, ox, oy })
    if (changed) scheduleLog()
  }

  function applyRectToFrame(name, x, y, w, h) {
    const f = frames.value[name]
    const rf = readFrame(f)
    if (!rf) return

    const anchorX = rf.x + rf.ox * rf.w
    const anchorY = rf.y + rf.oy * rf.h

    const nx = roundInt(x)
    const ny = roundInt(y)
    const nw = roundInt(w)
    const nh = roundInt(h)

    const denomW = nw || 1
    const denomH = nh || 1
    const ox = clamp((anchorX - nx) / denomW, 0, 1)
    const oy = clamp((anchorY - ny) / denomH, 0, 1)

    const changed = writeFrame(name, { x: nx, y: ny, w: nw, h: nh, ox, oy })
    if (changed) scheduleLog()
  }

  return {
    readFrame,
    writeFrame,
    rectWorldBounds,
    hitRect,
    hitHandle,
    originWorldPos,
    hitOrigin,
    applyOriginToFrame,
    applyRectToFrame,
    scheduleLog,
    cancelScheduledLog
  }
}
