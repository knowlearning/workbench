<template>
  <div class="wrap">
    <canvas ref="canvas" />
    <div class="hint">
      Drag to pan • Wheel to zoom • Click preview to play/pause • ←/→ steps frames (wraps, pauses) • ↑/↓ cycles states
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  sprite: { type: Object, required: true }
})

const sheetUrl = computed(() => props.sprite.sheet)
const frames = computed(() => props.sprite.frames || {})
const states = computed(() => props.sprite.states || {})

const canvas = ref(null)

let img = null
let raf = 0

// ---------- constants ----------
const BG_COLOR = '#0b0f17'
const PREVIEW_PANEL_BG = 'rgba(0,0,0,0.55)'
const PREVIEW_PANEL_BORDER = 'rgba(255,255,255,0.18)'
const PREVIEW_HEADER_BG = 'rgba(0,0,0,0.35)'
const PREVIEW_GROUND = 'rgba(0,255,180,0.22)'
const PREVIEW_CHECK_A = 'rgba(255,255,255,0.02)'
const PREVIEW_CHECK_B = 'rgba(255,255,255,0.06)'
const LABEL_BG = 'rgba(0,0,0,0.65)'
const LABEL_FG = 'rgba(255,255,255,0.92)'

const FRAME_STROKE = 'rgba(255, 200, 0, 0.85)'
const FRAME_FILL = 'rgba(255, 200, 0, 0.9)'
const FRAME_HOVER_STROKE = 'rgba(255, 240, 140, 0.95)'
const FRAME_HOVER_FILL = 'rgba(255, 240, 140, 0.95)'

// all frames in active state
const FRAME_STATE_STROKE = 'rgba(60, 220, 120, 0.95)'
const FRAME_STATE_FILL = 'rgba(60, 220, 120, 0.9)'

// active edit highlight (dragging/resizing/origin)
const FRAME_ACTIVE_OUTLINE = 'rgba(0, 255, 180, 0.95)'
const FRAME_ACTIVE_OUTLINE_W = 2

// playhead highlight (current frame being previewed / animated)
const FRAME_PLAYHEAD_OUTLINE = 'rgba(120, 180, 255, 0.95)'
const FRAME_PLAYHEAD_OUTLINE_W = 2

const ORIGIN_COLOR = 'rgba(0, 255, 180, 0.9)'
const BORDER_COLOR = 'rgba(255,255,255,0.12)'

// ---------- view ----------
const view = {
  scale: 2,
  panX: 20,
  panY: 20
}

const preview = {
  playing: true,
  speed: 1,
  state: '',
  t: 0,
  lastNow: 0,
  manualFrameName: '',
  ui: { x: 0, y: 0, w: 260, h: 220, pad: 10 }
}

const activeFrame = ref('')
const hoverFrame = ref('')

const dpr = () => Math.max(1, window.devicePixelRatio || 1)

function resizeToDisplaySize(c) {
  const rect = c.getBoundingClientRect()
  const pixelRatio = dpr()
  const w = Math.max(1, Math.floor(rect.width * pixelRatio))
  const h = Math.max(1, Math.floor(rect.height * pixelRatio))
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
    return true
  }
  return false
}

// ---------- fit/center on load ----------
const FIT_PAD = 16 // CSS px margin inside canvas

function fitSheetToCanvas() {
  const c = canvas.value
  if (!c || !img?.complete || !img.naturalWidth || !img.naturalHeight) return

  resizeToDisplaySize(c)

  const pixelRatio = dpr()
  const cw = c.width / pixelRatio
  const ch = c.height / pixelRatio

  const w = img.naturalWidth
  const h = img.naturalHeight

  const availW = Math.max(1, cw - FIT_PAD * 2)
  const availH = Math.max(1, ch - FIT_PAD * 2)

  const s = Math.min(availW / w, availH / h)

  view.scale = clamp(s, 0.25, 20)
  view.panX = (cw - w * view.scale) / 2
  view.panY = (ch - h * view.scale) / 2
}

// ---------- helpers ----------
const HANDLE = 6 // CSS px
const MIN_SIZE = 2 // sheet px

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v))
}

function roundInt(v) {
  return Math.round(v)
}

function worldToSheet(wx, wy) {
  return {
    x: (wx - view.panX) / view.scale,
    y: (wy - view.panY) / view.scale
  }
}

function sheetToWorld(x, y) {
  return {
    x: x * view.scale + view.panX,
    y: y * view.scale + view.panY
  }
}

// Non-mutating read (defaults/clamp without writing back)
function readFrame(f) {
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
    { k: 'e', x: b.x2, y: hy },
    { k: 'se', x: b.x2, y: b.y2 },
    { k: 's', x: hx, y: b.y2 },
    { k: 'sw', x: b.x1, y: b.y2 },
    { k: 'w', x: b.x1, y: hy }
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

// ---------- state player ----------
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

// playhead = the frame the preview is currently showing (even if paused on a manual frame)
function currentPlayheadFrameName() {
  if (activeFrame.value) return activeFrame.value
  if (preview.manualFrameName && frames.value[preview.manualFrameName]) return preview.manualFrameName
  const s = preview.state
  const f = s ? stateFrameAtTime(s, preview.t) : null
  if (f && frames.value[f]) return f
  return pickDefaultFrameName()
}

// NOTE: hover intentionally NOT used for preview anymore
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
  const j = ((i + dir) % n + n) % n // wrap

  preview.playing = false
  preview.manualFrameName = order[j]
  hoverFrame.value = ''
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
}

// ---------- render ----------
function drawPreviewPanel(ctx, cw, ch) {
  const margin = 12
  const w = preview.ui.w
  const h = preview.ui.h
  const x = cw - w - margin
  const y = margin

  preview.ui.x = x
  preview.ui.y = y

  ctx.save()

  ctx.fillStyle = PREVIEW_PANEL_BG
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = PREVIEW_PANEL_BORDER
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)

  const pad = preview.ui.pad
  const headerH = 46
  ctx.fillStyle = PREVIEW_HEADER_BG
  ctx.fillRect(x, y, w, headerH)

  ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  ctx.textBaseline = 'top'
  ctx.fillStyle = LABEL_FG

  const stateNames = listStateNames()
  if (!preview.state) preview.state = stateNames[0] || ''

  const frameName = pickPreviewFrameName()
  const f = frames.value[frameName]
  const rf = readFrame(f)

  const playTxt = preview.playing ? 'playing' : 'paused'
  ctx.fillText(`preview (${playTxt})`, x + pad, y + 8)
  ctx.fillText(preview.state ? `state: ${preview.state}` : 'state: (none)', x + pad, y + 24)

  const cx = x + pad
  const cy = y + headerH + pad
  const cw2 = w - pad * 2
  const ch2 = h - headerH - pad * 2

  if (frameName && frameName === activeFrame.value) {
    ctx.strokeStyle = FRAME_ACTIVE_OUTLINE
    ctx.lineWidth = FRAME_ACTIVE_OUTLINE_W
    ctx.strokeRect(cx - 3, cy - 3, cw2 + 6, ch2 + 6)
    ctx.lineWidth = 1
  }

  const cell = 10
  for (let yy = 0; yy < ch2; yy += cell) {
    for (let xx = 0; xx < cw2; xx += cell) {
      const v = ((xx / cell) ^ (yy / cell)) & 1
      ctx.fillStyle = v ? PREVIEW_CHECK_B : PREVIEW_CHECK_A
      ctx.fillRect(cx + xx, cy + yy, cell, cell)
    }
  }

  const ax = cx + cw2 / 2
  const ay = cy + ch2 * 0.82
  ctx.strokeStyle = PREVIEW_GROUND
  ctx.beginPath()
  ctx.moveTo(cx + 6, ay + 0.5)
  ctx.lineTo(cx + cw2 - 6, ay + 0.5)
  ctx.stroke()

  if (img?.complete && img.naturalWidth && rf) {
    const { x: sx, y: sy, w: sw, h: sh, ox, oy } = rf

    const maxScaleX = Math.floor((cw2 * 0.9) / Math.max(1, sw))
    const maxScaleY = Math.floor((ch2 * 0.9) / Math.max(1, sh))
    const base = Math.max(1, Math.min(maxScaleX || 1, maxScaleY || 1))
    const s = clamp(Math.round(base), 1, 12)

    const dx = Math.round(ax - ox * sw * s)
    const dy = Math.round(ay - oy * sh * s)

    ctx.save()
    ctx.beginPath()
    ctx.rect(cx, cy, cw2, ch2)
    ctx.clip()

    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, sw * s, sh * s)

    ctx.fillStyle = ORIGIN_COLOR
    ctx.beginPath()
    ctx.arc(Math.round(ax), Math.round(ay), 3, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.fillText('no frame/image', cx, cy + 6)
  }

  ctx.restore()
}

function draw(ctx, c, now) {
  resizeToDisplaySize(c)

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, c.width, c.height)

  const pixelRatio = dpr()
  ctx.scale(pixelRatio, pixelRatio)

  const cw = c.width / pixelRatio
  const ch = c.height / pixelRatio

  if (!preview.lastNow) preview.lastNow = now
  const dt = Math.max(0, now - preview.lastNow)
  preview.lastNow = now
  if (preview.playing) preview.t += dt * preview.speed

  const playheadName = currentPlayheadFrameName()
  const stateSet = activeStateFrameSet()

  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, cw, ch)

  if (img?.complete && img.naturalWidth) {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(img, view.panX, view.panY, img.naturalWidth * view.scale, img.naturalHeight * view.scale)
  }

  ctx.imageSmoothingEnabled = true
  ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  ctx.textBaseline = 'top'

  for (const [name, f] of Object.entries(frames.value)) {
    const rf = readFrame(f)
    if (!rf) continue
    const { x, y, w, h, ox, oy } = rf

    const sx = x * view.scale + view.panX
    const sy = y * view.scale + view.panY
    const sw = w * view.scale
    const sh = h * view.scale

    const isActive = name === activeFrame.value
    const isPlayhead = name === playheadName
    const isHot = isActive || (name === hoverFrame.value && !activeFrame.value)
    const isInActiveState = stateSet.has(name)

    // base rect stroke (state frames are green)
    ctx.lineWidth = 1
    if (isInActiveState) ctx.strokeStyle = FRAME_STATE_STROKE
    else ctx.strokeStyle = isHot ? FRAME_HOVER_STROKE : FRAME_STROKE
    ctx.strokeRect(sx, sy, sw, sh)

    // playhead outline (current anim frame)
    if (isPlayhead && !isActive) {
      ctx.strokeStyle = FRAME_PLAYHEAD_OUTLINE
      ctx.lineWidth = FRAME_PLAYHEAD_OUTLINE_W
      ctx.strokeRect(sx, sy, sw, sh)
      ctx.lineWidth = 1
    }

    // active edit outline wins
    if (isActive) {
      ctx.strokeStyle = FRAME_ACTIVE_OUTLINE
      ctx.lineWidth = FRAME_ACTIVE_OUTLINE_W
      ctx.strokeRect(sx, sy, sw, sh)
      ctx.lineWidth = 1
    }

    // handles (state frames are green)
    const b = rectWorldBounds(f)
    const hx = (b.x1 + b.x2) / 2
    const hy = (b.y1 + b.y2) / 2
    const pts = [
      [b.x1, b.y1], [hx, b.y1], [b.x2, b.y1],
      [b.x2, hy],
      [b.x2, b.y2], [hx, b.y2], [b.x1, b.y2],
      [b.x1, hy]
    ]
    if (isInActiveState) ctx.fillStyle = FRAME_STATE_FILL
    else ctx.fillStyle = isHot ? FRAME_HOVER_FILL : FRAME_FILL
    for (const [px, py] of pts) ctx.fillRect(px - 3, py - 3, 6, 6)

    // origin
    const op = originWorldPos(f)
    ctx.fillStyle = ORIGIN_COLOR
    ctx.beginPath()
    ctx.arc(op.x, op.y, 3, 0, Math.PI * 2)
    ctx.fill()

    // label
    const label = name
    const pad = 4
    const tw = ctx.measureText(label).width
    const lx = sx
    const ly = sy - 16

    ctx.fillStyle = LABEL_BG
    ctx.fillRect(lx, ly, tw + pad * 2, 16)
    ctx.fillStyle = LABEL_FG
    ctx.fillText(label, lx + pad, ly + 2)
  }

  drawPreviewPanel(ctx, cw, ch)

  ctx.strokeStyle = BORDER_COLOR
  ctx.strokeRect(0.5, 0.5, cw - 1, ch - 1)

  ctx.restore()
}

function tick(now) {
  const c = canvas.value
  if (!c) return
  const ctx = c.getContext('2d')
  draw(ctx, c, now || performance.now())
  raf = requestAnimationFrame(tick)
}

function loadSheet(url) {
  img = new Image()
  img.src = url
  img.onload = () => {
    fitSheetToCanvas()
  }
}

// ---------- interactions ----------
function setupInteractions(c) {
  let mode = 'none'
  let activeName = ''
  let activeHandle = ''
  let start = null

  const pick = (wx, wy) => {
    const entries = Object.entries(frames.value)

    for (let i = entries.length - 1; i >= 0; i--) {
      const [name, f] = entries[i]
      if (!readFrame(f)) continue
      if (hitOrigin(wx, wy, f)) return { kind: 'origin', name }
    }

    for (let i = entries.length - 1; i >= 0; i--) {
      const [name, f] = entries[i]
      if (!readFrame(f)) continue
      const h = hitHandle(wx, wy, f)
      if (h) return { kind: 'handle', name, handle: h }
    }

    for (let i = entries.length - 1; i >= 0; i--) {
      const [name, f] = entries[i]
      if (!readFrame(f)) continue
      if (hitRect(wx, wy, f)) return { kind: 'rect', name }
    }

    return null
  }

  const inPreview = (mx, my) => {
    const r = preview.ui
    return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h
  }

  const setPlaying = (v) => {
    preview.playing = v
    if (v) preview.manualFrameName = ''
  }

  const onDown = (e) => {
    const rect = c.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    if (e.button === 0 && inPreview(mx, my)) {
      setPlaying(!preview.playing)
      return
    }

    const sp = worldToSheet(mx, my)
    const p = pick(mx, my)
    const isPrimary = e.button === 0 || e.pointerType !== 'mouse'
    if (!isPrimary) return

    if (p?.kind === 'origin') {
      mode = 'origin'
      activeName = p.name
      activeHandle = ''
    } else if (p?.kind === 'handle') {
      mode = 'resize'
      activeName = p.name
      activeHandle = p.handle
    } else if (p?.kind === 'rect') {
      mode = 'move'
      activeName = p.name
      activeHandle = ''
    } else {
      mode = 'pan'
      activeName = ''
      activeHandle = ''
    }

    activeFrame.value = activeName

    const f = activeName ? frames.value[activeName] : null
    const rf = readFrame(f)
    start = {
      clientX: e.clientX,
      clientY: e.clientY,
      panX: view.panX,
      panY: view.panY,
      fx: rf?.x ?? 0,
      fy: rf?.y ?? 0,
      fw: rf?.w ?? 0,
      fh: rf?.h ?? 0,
      sx: sp.x,
      sy: sp.y
    }

    c.setPointerCapture?.(e.pointerId)
  }

  const onHoverMove = (e) => {
    if (mode !== 'none') return
    const rect = c.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    if (inPreview(mx, my)) {
      hoverFrame.value = ''
      return
    }
    const p = pick(mx, my)
    hoverFrame.value = p?.name || ''
  }

  const onMove = (e) => {
    if (mode === 'none' || !start) return

    const rect = c.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const sp = worldToSheet(mx, my)

    if (mode === 'pan') {
      const dx = e.clientX - start.clientX
      const dy = e.clientY - start.clientY
      view.panX = start.panX + dx
      view.panY = start.panY + dy
      return
    }

    const name = activeName
    const f = frames.value[name]
    if (!readFrame(f)) return

    if (mode === 'origin') {
      applyOriginToFrame(name, sp.x, sp.y)
      return
    }

    if (mode === 'move') {
      const dx = sp.x - start.sx
      const dy = sp.y - start.sy
      applyRectToFrame(name, start.fx + dx, start.fy + dy, start.fw, start.fh)
      return
    }

    if (mode === 'resize') {
      let x1 = start.fx
      let y1 = start.fy
      let x2 = start.fx + start.fw
      let y2 = start.fy + start.fh

      if (activeHandle.includes('w')) x1 = sp.x
      if (activeHandle.includes('e')) x2 = sp.x
      if (activeHandle.includes('n')) y1 = sp.y
      if (activeHandle.includes('s')) y2 = sp.y

      if (e.altKey) {
        const cx = start.fx + start.fw / 2
        const cy = start.fy + start.fh / 2
        const hw = Math.abs(sp.x - cx)
        const hh = Math.abs(sp.y - cy)

        if (activeHandle === 'n' || activeHandle === 's') {
          y1 = cy - hh
          y2 = cy + hh
        } else if (activeHandle === 'w' || activeHandle === 'e') {
          x1 = cx - hw
          x2 = cx + hw
        } else {
          x1 = cx - hw
          x2 = cx + hw
          y1 = cy - hh
          y2 = cy + hh
        }
      }

      if (e.shiftKey) {
        const ar = start.fw / (start.fh || 1)
        let w = Math.abs(x2 - x1)
        let h = Math.abs(y2 - y1)

        if (activeHandle === 'n' || activeHandle === 's') {
          w = h * ar
          const cx = (x1 + x2) / 2
          x1 = cx - w / 2
          x2 = cx + w / 2
        } else if (activeHandle === 'w' || activeHandle === 'e') {
          h = w / ar
          const cy = (y1 + y2) / 2
          y1 = cy - h / 2
          y2 = cy + h / 2
        } else {
          const dw = Math.abs(sp.x - start.sx)
          const dh = Math.abs(sp.y - start.sy)
          if (dw > dh) h = w / ar
          else w = h * ar

          const ox = activeHandle.includes('w') ? x2 : x1
          const oy = activeHandle.includes('n') ? y2 : y1
          if (activeHandle.includes('w')) x1 = ox - w
          else x2 = ox + w
          if (activeHandle.includes('n')) y1 = oy - h
          else y2 = oy + h
        }
      }

      let nx = Math.min(x1, x2)
      let ny = Math.min(y1, y2)
      let nw = Math.max(MIN_SIZE, Math.abs(x2 - x1))
      let nh = Math.max(MIN_SIZE, Math.abs(y2 - y1))

      if (img?.naturalWidth && img?.naturalHeight) {
        nx = clamp(nx, 0, img.naturalWidth - MIN_SIZE)
        ny = clamp(ny, 0, img.naturalHeight - MIN_SIZE)
        nw = clamp(nw, MIN_SIZE, img.naturalWidth - nx)
        nh = clamp(nh, MIN_SIZE, img.naturalHeight - ny)
      }

      applyRectToFrame(name, nx, ny, nw, nh)
    }
  }

  const onUp = (e) => {
    mode = 'none'
    activeName = ''
    activeHandle = ''
    start = null
    activeFrame.value = ''
    c.releasePointerCapture?.(e.pointerId)
  }

  const onWheel = (e) => {
    e.preventDefault()

    const rect = c.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    if (inPreview(mx, my)) {
      const factor = Math.exp(-e.deltaY * 0.001)
      preview.speed = clamp(preview.speed * factor, 0.1, 4)
      return
    }

    const prev = view.scale
    const factor = Math.exp(-e.deltaY * 0.001)
    view.scale = Math.min(20, Math.max(0.25, view.scale * factor))

    view.panX = mx - (mx - view.panX) * (view.scale / prev)
    view.panY = my - (my - view.panY) * (view.scale / prev)
  }

  const onKey = (e) => {
    if (e.key === ' ') {
      e.preventDefault()
      setPlaying(!preview.playing)
      return
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      stepPreviewFrame(-1)
      return
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      stepPreviewFrame(1)
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      stepState(-1)
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      stepState(1)
      return
    }

    if (e.key === 'Escape') {
      hoverFrame.value = ''
      activeFrame.value = ''
      preview.manualFrameName = ''
    }
  }

  c.style.touchAction = 'none'
  c.addEventListener('pointerdown', onDown)
  c.addEventListener('pointermove', onHoverMove)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('keydown', onKey)
  c.addEventListener('wheel', onWheel, { passive: false })

  return () => {
    c.removeEventListener('pointerdown', onDown)
    c.removeEventListener('pointermove', onHoverMove)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('keydown', onKey)
    c.removeEventListener('wheel', onWheel)
    clearTimeout(logT)
  }
}

let teardown = null
let ro = null

onMounted(() => {
  const c = canvas.value
  if (!c) return

  const names = listStateNames()
  if (!preview.state) preview.state = names[0] || ''

  teardown = setupInteractions(c)

  if (sheetUrl.value) loadSheet(sheetUrl.value)

  // keep it centered + fit on initial layout changes
  ro = new ResizeObserver(() => {
    fitSheetToCanvas()
  })
  ro.observe(c)

  raf = requestAnimationFrame(tick)
})

watch(sheetUrl, (url) => {
  if (url) loadSheet(url)
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  if (teardown) teardown()
  ro?.disconnect()
})
</script>

<style scoped>
.wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 420px;
}
canvas {
  width: 100%;
  height: 100%;
  display: block;
}
.hint {
  position: absolute;
  left: 10px;
  bottom: 10px;
  font: 12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Apple Color Emoji", "Segoe UI Emoji";
  color: rgba(255,255,255,0.75);
  background: rgba(0,0,0,0.45);
  padding: 6px 8px;
  border-radius: 8px;
  user-select: none;
  pointer-events: none;
}
</style>
