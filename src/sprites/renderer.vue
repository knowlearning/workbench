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
import * as themes from './themes.js'

const props = defineProps({
  sprite: { type: Object, required: true }
})

const emit = defineEmits(['event'])

const sheetUrl = computed(() => props.sprite.sheet)
const frames = computed(() => props.sprite.frames || {})
const states = computed(() => props.sprite.states || {})

const canvas = ref(null)

let img = null

// ---------- theme (light/dark) ----------
const prefersDark = ref(true)
let mq = null
let onScheme = null

function readPrefersDark() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function setSchemeFromMedia() {
  prefersDark.value = readPrefersDark()
}

const theme = computed(() => (prefersDark.value ? themes.dark : themes.light))

// ---- timing (simple + reliable) ----
const MAX_DT = 50 // ms

let raf = 0
let loopToken = 0
let onVis = null

function stopLoop() {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  loopToken++
}

function startLoop() {
  stopLoop()

  const c = canvas.value
  if (!c) return

  const token = loopToken
  let last = performance.now()

  const frame = (now) => {
    if (token !== loopToken) return

    const dt = clamp(now - last, 0, MAX_DT)
    last = now

    const ctx = c.getContext('2d')
    draw(ctx, c, dt)

    raf = requestAnimationFrame(frame)
  }

  raf = requestAnimationFrame(frame)
}

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
  manualFrameName: '',
  ui: { x: 0, y: 0, w: 260, h: 220, pad: 10 }
}

const activeFrame = ref('')
const hoverFrame = ref('')

// --- emits (single "event") + hover enter/exit/hover ---
const framePath = (name) => ['frame', name || '']
const seqPath = (name) => ['sequence', name || '']

let lastHoverName = '' // '' means "none"
let lastSelectSeq = null
let lastCurrentName = null

function emitEvent(type, path) {
  emit('event', { type, path })
}

function handleHover(nextName) {
  const next = nextName || ''
  const prev = lastHoverName

  if (next === prev) {
    if (next) emitEvent('hover', framePath(next))
    return
  }

  if (prev) emitEvent('exit', framePath(prev))
  if (next) emitEvent('enter', framePath(next))
  if (next) emitEvent('hover', framePath(next))

  lastHoverName = next
}

function emitSelectSequence(name) {
  const n = name || ''
  if (n === lastSelectSeq) return
  lastSelectSeq = n
  emitEvent('select', seqPath(n))
}

function emitCurrent(name, force = false) {
  const n = name || ''
  if (!force && n === lastCurrentName) return
  lastCurrentName = n
  emitEvent('current', framePath(n))
}

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

  // allow fit to go smaller than viewport (don’t enforce 0.25 floor)
  view.scale = clamp(s, 0.01, 40)
  view.panX = (cw - w * view.scale) / 2
  view.panY = (ch - h * view.scale) / 2

  snapPanToDevicePixels()
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

// Optional but recommended for pixel art (reduces shimmer)
function snapPanToDevicePixels() {
  const pr = dpr()
  view.panX = Math.round(view.panX * pr) / pr
  view.panY = Math.round(view.panY * pr) / pr
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

function sheetWorldRect(scale = view.scale, panX = view.panX, panY = view.panY) {
  const w = img?.naturalWidth || 0
  const h = img?.naturalHeight || 0
  const sw = w * scale
  const sh = h * scale
  return { x1: panX, y1: panY, x2: panX + sw, y2: panY + sh }
}

// --- zoom/pan constraints (preferred behavior) ---
function fitScaleForCanvas(cw, ch) {
  if (!img?.naturalWidth || !img?.naturalHeight) return 0.25

  const availW = Math.max(1, cw - FIT_PAD * 2)
  const availH = Math.max(1, ch - FIT_PAD * 2)

  const s = Math.min(availW / img.naturalWidth, availH / img.naturalHeight)
  return clamp(s, 0.01, 20)
}

// ---------- NEW: pan bounds + settle animation (post-zoom) ----------
// ---------- UPDATED: pan bounds (edge-to-opposite-edge constraints) ----------
function panBoundsForAxis(cLen, sLen) {
  // image rect is [pan, pan + sLen]
  // Constraints:
  //   pan + sLen >= 0   (right/bottom never past left/top)
  //   pan <= cLen       (left/top never past right/bottom)
  // So:
  //   pan >= -sLen
  //   pan <= cLen
  return [-sLen, cLen]
}

function clampPanToBounds(cw, ch, scale = view.scale, panX = view.panX, panY = view.panY) {
  if (!img?.naturalWidth || !img?.naturalHeight) return { panX, panY }

  const sw = img.naturalWidth * scale
  const sh = img.naturalHeight * scale

  const [xMin, xMax] = panBoundsForAxis(cw, sw)
  const [yMin, yMax] = panBoundsForAxis(ch, sh)

  return {
    panX: clamp(panX, xMin, xMax),
    panY: clamp(panY, yMin, yMax)
  }
}

function nearestPanInBounds(cw, ch) {
  return clampPanToBounds(cw, ch)
}

let zoomSettleRaf = 0
let zoomSettleTimer = 0

function stopZoomSettle() {
  if (zoomSettleRaf) cancelAnimationFrame(zoomSettleRaf)
  zoomSettleRaf = 0
  clearTimeout(zoomSettleTimer)
  zoomSettleTimer = 0
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

function settlePanToBounds(cw, ch) {
  stopZoomSettle()

  const fromX = view.panX
  const fromY = view.panY
  const { panX: toX, panY: toY } = nearestPanInBounds(cw, ch)

  if (Math.abs(toX - fromX) < 0.01 && Math.abs(toY - fromY) < 0.01) return

  const dur = 180
  const t0 = performance.now()

  const step = (now) => {
    const t = clamp((now - t0) / dur, 0, 1)
    const k = easeOutCubic(t)

    view.panX = fromX + (toX - fromX) * k
    view.panY = fromY + (toY - fromY) * k

    if (t >= 1) {
      snapPanToDevicePixels()
      zoomSettleRaf = 0
      return
    }

    zoomSettleRaf = requestAnimationFrame(step)
  }

  zoomSettleRaf = requestAnimationFrame(step)
}

function scheduleZoomSettle(cw, ch) {
  clearTimeout(zoomSettleTimer)
  zoomSettleTimer = setTimeout(() => {
    settlePanToBounds(cw, ch)
  }, 90)
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
  lastCurrentName = null
  emitCurrent(currentPlayheadFrameName(), true)
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

  const th = theme.value

  ctx.save()

  ctx.fillStyle = th.PREVIEW_PANEL_BG
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = th.PREVIEW_PANEL_BORDER
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)

  const pad = preview.ui.pad
  const headerH = 46
  ctx.fillStyle = th.PREVIEW_HEADER_BG
  ctx.fillRect(x, y, w, headerH)

  ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  ctx.textBaseline = 'top'
  ctx.fillStyle = th.LABEL_FG

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
    ctx.strokeStyle = th.FRAME_ACTIVE_OUTLINE
    ctx.lineWidth = 2
    ctx.strokeRect(cx - 3, cy - 3, cw2 + 6, ch2 + 6)
    ctx.lineWidth = 1
  }

  const cell = 10
  for (let yy = 0; yy < ch2; yy += cell) {
    for (let xx = 0; xx < cw2; xx += cell) {
      const v = ((xx / cell) ^ (yy / cell)) & 1
      ctx.fillStyle = v ? th.PREVIEW_CHECK_B : th.PREVIEW_CHECK_A
      ctx.fillRect(cx + xx, cy + yy, cell, cell)
    }
  }

  const ax = cx + cw2 / 2
  const ay = cy + ch2 * 0.82
  ctx.strokeStyle = th.PREVIEW_GROUND
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

    ctx.fillStyle = th.ORIGIN_COLOR
    ctx.beginPath()
    ctx.arc(Math.round(ax), Math.round(ay), 3, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
  } else {
    ctx.fillStyle = prefersDark.value ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)'
    ctx.fillText('no frame/image', cx, cy + 6)
  }

  ctx.restore()
}

function draw(ctx, c, dt) {
  resizeToDisplaySize(c)

  const th = theme.value

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, c.width, c.height)

  const pixelRatio = dpr()
  ctx.scale(pixelRatio, pixelRatio)

  const cw = c.width / pixelRatio
  const ch = c.height / pixelRatio

  if (preview.playing) preview.t += dt * preview.speed

  const playheadName = currentPlayheadFrameName()
  emitCurrent(playheadName)

  const stateSet = activeStateFrameSet()

  ctx.fillStyle = th.BG_COLOR
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
    const { x, y, w, h } = rf

    const sx = x * view.scale + view.panX
    const sy = y * view.scale + view.panY
    const sw = w * view.scale
    const sh = h * view.scale

    const isActive = name === activeFrame.value
    const isPlayhead = name === playheadName
    const isHot = isActive || (name === hoverFrame.value && !activeFrame.value)
    const isInActiveState = stateSet.has(name)

    ctx.lineWidth = 1
    if (isInActiveState) ctx.strokeStyle = th.FRAME_STATE_STROKE
    else ctx.strokeStyle = isHot ? th.FRAME_HOVER_STROKE : th.FRAME_STROKE
    ctx.strokeRect(sx, sy, sw, sh)

    if (isPlayhead && !isActive) {
      ctx.strokeStyle = th.FRAME_PLAYHEAD_OUTLINE
      ctx.lineWidth = 2
      ctx.strokeRect(sx, sy, sw, sh)
      ctx.lineWidth = 1
    }

    if (isActive) {
      ctx.strokeStyle = th.FRAME_ACTIVE_OUTLINE
      ctx.lineWidth = 2
      ctx.strokeRect(sx, sy, sw, sh)
      ctx.lineWidth = 1
    }

    const b = rectWorldBounds(f)
    const hx = (b.x1 + b.x2) / 2
    const hy = (b.y1 + b.y2) / 2
    const pts = [
      [b.x1, b.y1], [hx, b.y1], [b.x2, b.y1],
      [b.x2, hy],
      [b.x2, b.y2], [hx, b.y2], [b.x1, b.y2],
      [b.x1, hy]
    ]
    if (isInActiveState) ctx.fillStyle = th.FRAME_STATE_FILL
    else ctx.fillStyle = isHot ? th.FRAME_HOVER_FILL : th.FRAME_FILL
    for (const [px, py] of pts) ctx.fillRect(px - 3, py - 3, 6, 6)

    const op = originWorldPos(f)
    ctx.fillStyle = th.ORIGIN_COLOR
    ctx.beginPath()
    ctx.arc(op.x, op.y, 3, 0, Math.PI * 2)
    ctx.fill()

    const label = name
    const pad = 4
    const tw = ctx.measureText(label).width
    const lx = sx
    const ly = sy - 16

    ctx.fillStyle = th.LABEL_BG
    ctx.fillRect(lx, ly, tw + pad * 2, 16)
    ctx.fillStyle = th.LABEL_FG
    ctx.fillText(label, lx + pad, ly + 2)
  }

  drawPreviewPanel(ctx, cw, ch)

  ctx.strokeStyle = th.BORDER_COLOR
  ctx.strokeRect(0.5, 0.5, cw - 1, ch - 1)

  ctx.restore()
}

function loadSheet(url) {
  img = new Image()
  img.src = url
  img.onload = () => {
    fitSheetToCanvas()
  }
}

// ---------- interactions ----------
function isTypingTarget(el) {
  if (!el) return false

  const e = el.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
  if (e) return true

  const role = el.getAttribute?.('role')
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return true

  return false
}

function setupInteractions(c) {
  let mode = 'none'
  let activeName = ''
  let activeHandle = ''
  let start = null

  // only handle keys after interacting with the canvas
  c.tabIndex = 0

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
    c.focus?.()

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
      handleHover('')
      return
    }

    const p = pick(mx, my)
    const next = p?.name || ''
    hoverFrame.value = next
    handleHover(next)
  }

  const onMove = (e) => {
    if (mode === 'none' || !start) return

    // keep backing store synced for consistent cw/ch
    resizeToDisplaySize(c)

    const rect = c.getBoundingClientRect()
    const pr = dpr()
    const cw = c.width / pr
    const ch = c.height / pr

    // convert rect-space mouse to drawing space
    const sx = rect.width ? cw / rect.width : 1
    const sy = rect.height ? ch / rect.height : 1

    const mx = (e.clientX - rect.left) * sx
    const my = (e.clientY - rect.top) * sy
    const sp = worldToSheet(mx, my)

    if (mode === 'pan') {
      const dx = (e.clientX - start.clientX) * sx
      const dy = (e.clientY - start.clientY) * sy
      view.panX = start.panX + dx
      view.panY = start.panY + dy

      const t = clampPanToBounds(cw, ch)
      view.panX = t.panX
      view.panY = t.panY
      snapPanToDevicePixels()
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

  // ---------- NEW WHEEL: cursor-anchored zoom + post-zoom settle (no center zoom ever) ----------
  const onWheel = (e) => {
    e.preventDefault()

    // ensure cw/ch match draw() space
    resizeToDisplaySize(c)

    const rect = c.getBoundingClientRect()
    const pr = dpr()
    const cw = c.width / pr
    const ch = c.height / pr

    // rect-space mouse
    const mxRect = e.clientX - rect.left
    const myRect = e.clientY - rect.top

    // convert to drawing space
    const sx = rect.width ? cw / rect.width : 1
    const sy = rect.height ? ch / rect.height : 1
    const mx = mxRect * sx
    const my = myRect * sy

    if (inPreview(mx, my)) {
      const factor = Math.exp(-e.deltaY * 0.001)
      preview.speed = clamp(preview.speed * factor, 0.1, 4)
      return
    }

    const wantsPan = e.shiftKey || Math.abs(e.deltaX) > 0
    const wantsZoom = !wantsPan || e.ctrlKey

    if (!wantsZoom) {
      view.panX -= e.deltaX * sx
      view.panY -= e.deltaY * sy

      const t = clampPanToBounds(cw, ch)
      view.panX = t.panX
      view.panY = t.panY
      snapPanToDevicePixels()
      return
    }

    if (!img?.naturalWidth || !img?.naturalHeight) return

    stopZoomSettle()

    const prevScale = view.scale
    const factor = Math.exp(-e.deltaY * 0.001)

    const fit = fitScaleForCanvas(cw, ch)
    const minScale = Math.max(0.01, fit * 0.1)
    const maxScale = 40

    const nextScale = clamp(prevScale * factor, minScale, maxScale)
    if (nextScale === prevScale) return

    // ALWAYS keep cursor fixed at same image coordinate:
    const sheetX = (mx - view.panX) / prevScale
    const sheetY = (my - view.panY) / prevScale

    view.scale = nextScale
    view.panX = mx - sheetX * nextScale
    view.panY = my - sheetY * nextScale

    // Do not clamp during the zoom gesture; settle after zoom ends:
    scheduleZoomSettle(cw, ch)
  }

  const onKey = (e) => {
    if (isTypingTarget(document.activeElement)) return
    if (document.activeElement !== c) return

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
      handleHover('')
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
    stopZoomSettle()
  }
}

let teardown = null
let ro = null

onMounted(() => {
  const c = canvas.value
  if (!c) return

  setSchemeFromMedia()
  mq = window.matchMedia('(prefers-color-scheme: dark)')
  onScheme = () => {
    setSchemeFromMedia()
    const c2 = canvas.value
    if (c2) {
      const ctx2 = c2.getContext('2d')
      draw(ctx2, c2, 0)
    }
  }
  if (mq.addEventListener) mq.addEventListener('change', onScheme)
  else mq.addListener(onScheme)

  const names = listStateNames()
  if (!preview.state) preview.state = names[0] || ''

  emitSelectSequence(preview.state)

  lastCurrentName = null
  emitCurrent(currentPlayheadFrameName(), true)

  teardown = setupInteractions(c)

  if (sheetUrl.value) loadSheet(sheetUrl.value)

  ro = new ResizeObserver(() => {
    fitSheetToCanvas()
  })
  ro.observe(c)

  onVis = () => {
    if (!document.hidden) startLoop()
  }
  document.addEventListener('visibilitychange', onVis)

  startLoop()
})

watch(sheetUrl, (url) => {
  if (url) loadSheet(url)
})

watch(
  () => preview.state,
  (s) => {
    emitSelectSequence(s)
    lastCurrentName = null
    emitCurrent(currentPlayheadFrameName(), true)
  }
)

onBeforeUnmount(() => {
  stopLoop()
  if (teardown) teardown()
  ro?.disconnect()
  if (onVis) document.removeEventListener('visibilitychange', onVis)

  stopZoomSettle()

  if (mq && onScheme) {
    if (mq.removeEventListener) mq.removeEventListener('change', onScheme)
    else mq.removeListener(onScheme)
  }
})
</script>

<style scoped>
.wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 420px;
  background: #0b0f17;
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
canvas:focus { outline: none; }

@media (prefers-color-scheme: light) {
  .wrap {
    background: #f6f8fb;
  }

  .hint {
    color: rgba(0,0,0,0.72);
    background: rgba(255,255,255,0.75);
    box-shadow: 0 1px 0 rgba(0,0,0,0.06);
  }
}
</style>