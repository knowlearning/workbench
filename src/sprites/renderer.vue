<template>
  <div class="wrap">
    <canvas ref="canvas" />
    <div class="hint">Drag to pan • Wheel to zoom</div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  sprite: { type: Object, required: true }
})

const sheetUrl = computed(() => props.sprite.sheet)
const frames = computed(() => props.sprite.frames || {})

const canvas = ref(null)

let img = null
let raf = 0

const view = {
  scale: 2,
  panX: 20,
  panY: 20
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

function ensureOxOy(f) {
  if (f.length < 6) {
    f[4] = 0.5
    f[5] = 1
  } else {
    if (typeof f[4] !== 'number') f[4] = 0.5
    if (typeof f[5] !== 'number') f[5] = 1
  }
  f[4] = clamp(f[4], 0, 1)
  f[5] = clamp(f[5], 0, 1)
}

function rectWorldBounds(f) {
  const [x, y, w, h] = f
  const tl = sheetToWorld(x, y)
  const br = sheetToWorld(x + w, y + h)
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
    { k: 'n',  x: hx,   y: b.y1 },
    { k: 'ne', x: b.x2, y: b.y1 },
    { k: 'e',  x: b.x2, y: hy },
    { k: 'se', x: b.x2, y: b.y2 },
    { k: 's',  x: hx,   y: b.y2 },
    { k: 'sw', x: b.x1, y: b.y2 },
    { k: 'w',  x: b.x1, y: hy }
  ]

  for (const p of pts) {
    if (Math.abs(worldX - p.x) <= HANDLE && Math.abs(worldY - p.y) <= HANDLE) return p.k
  }
  return null
}

function originWorldPos(f) {
  ensureOxOy(f)
  const [x, y, w, h, ox, oy] = f
  return sheetToWorld(x + ox * w, y + oy * h)
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
  if (!f) return
  ensureOxOy(f)

  const x = f[0]
  const y = f[1]
  const w = f[2] || 1
  const h = f[3] || 1

  f[4] = clamp((sheetX - x) / w, 0, 1)
  f[5] = clamp((sheetY - y) / h, 0, 1)

  scheduleLog()
}

function applyRectToFrame(name, x, y, w, h) {
  const f = frames.value[name]
  if (!f) return
  ensureOxOy(f)

  // keep origin point anchored in sheet pixels
  const ox = f[4]
  const oy = f[5]
  const anchorX = f[0] + ox * f[2]
  const anchorY = f[1] + oy * f[3]

  f[0] = roundInt(x)
  f[1] = roundInt(y)
  f[2] = roundInt(w)
  f[3] = roundInt(h)

  const denomW = f[2] || 1
  const denomH = f[3] || 1
  f[4] = clamp((anchorX - f[0]) / denomW, 0, 1)
  f[5] = clamp((anchorY - f[1]) / denomH, 0, 1)

  scheduleLog()
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

// ---------- render ----------

function draw(ctx, c) {
  resizeToDisplaySize(c)

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, c.width, c.height)

  const pixelRatio = dpr()
  ctx.scale(pixelRatio, pixelRatio)

  const cw = c.width / pixelRatio
  const ch = c.height / pixelRatio

  ctx.fillStyle = '#0b0f17'
  ctx.fillRect(0, 0, cw, ch)

  if (img?.complete && img.naturalWidth) {
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(
      img,
      view.panX,
      view.panY,
      img.naturalWidth * view.scale,
      img.naturalHeight * view.scale
    )
  }

  ctx.imageSmoothingEnabled = true
  ctx.lineWidth = 1
  ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
  ctx.textBaseline = 'top'

  for (const [name, f] of Object.entries(frames.value)) {
    if (!Array.isArray(f) || f.length < 4) continue
    ensureOxOy(f)
    const [x, y, w, h, ox, oy] = f

    const sx = x * view.scale + view.panX
    const sy = y * view.scale + view.panY
    const sw = w * view.scale
    const sh = h * view.scale

    ctx.strokeStyle = 'rgba(255, 200, 0, 0.95)'
    ctx.strokeRect(sx, sy, sw, sh)

    // handles
    const b = rectWorldBounds(f)
    const hx = (b.x1 + b.x2) / 2
    const hy = (b.y1 + b.y2) / 2
    const pts = [
      [b.x1, b.y1], [hx, b.y1], [b.x2, b.y1],
      [b.x2, hy],
      [b.x2, b.y2], [hx, b.y2], [b.x1, b.y2],
      [b.x1, hy]
    ]
    ctx.fillStyle = 'rgba(255, 200, 0, 0.95)'
    for (const [px, py] of pts) ctx.fillRect(px - 3, py - 3, 6, 6)

    // origin dot (draggable)
    const op = originWorldPos(f)
    ctx.fillStyle = 'rgba(0, 255, 180, 0.9)'
    ctx.beginPath()
    ctx.arc(op.x, op.y, 3, 0, Math.PI * 2)
    ctx.fill()

    const label = `${name}  [${x},${y},${w},${h}]  o(${ox.toFixed(3)},${oy.toFixed(3)})`
    const pad = 4
    const tw = ctx.measureText(label).width
    const lx = sx
    const ly = sy - 16

    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.fillRect(lx, ly, tw + pad * 2, 16)

    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillText(label, lx + pad, ly + 2)
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.strokeRect(0.5, 0.5, cw - 1, ch - 1)

  ctx.restore()
}

function tick() {
  const c = canvas.value
  if (!c) return
  const ctx = c.getContext('2d')
  draw(ctx, c)
  raf = requestAnimationFrame(tick)
}

function loadSheet(url) {
  img = new Image()
  img.src = url
  img.onload = () => {
    view.scale = Math.max(1, Math.min(6, Math.floor(512 / img.naturalWidth)))
  }
}

// ---------- interactions ----------

function setupInteractions(c) {
  let mode = 'none' // 'pan' | 'move' | 'resize' | 'origin'
  let activeName = ''
  let activeHandle = ''
  let start = null

  const pick = (wx, wy) => {
    const entries = Object.entries(frames.value)

    // 1) origin dot
    for (let i = entries.length - 1; i >= 0; i--) {
      const [name, f] = entries[i]
      if (!Array.isArray(f) || f.length < 4) continue
      ensureOxOy(f)
      if (hitOrigin(wx, wy, f)) return { kind: 'origin', name }
    }

    // 2) resize handles
    for (let i = entries.length - 1; i >= 0; i--) {
      const [name, f] = entries[i]
      if (!Array.isArray(f) || f.length < 4) continue
      ensureOxOy(f)
      const h = hitHandle(wx, wy, f)
      if (h) return { kind: 'handle', name, handle: h }
    }

    // 3) rect body
    for (let i = entries.length - 1; i >= 0; i--) {
      const [name, f] = entries[i]
      if (!Array.isArray(f) || f.length < 4) continue
      ensureOxOy(f)
      if (hitRect(wx, wy, f)) return { kind: 'rect', name }
    }

    return null
  }

  const onDown = (e) => {
    const rect = c.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const wx = mx
    const wy = my
    const sp = worldToSheet(wx, wy)

    const p = pick(wx, wy)
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

    const f = activeName ? frames.value[activeName] : null
    start = {
      clientX: e.clientX,
      clientY: e.clientY,
      panX: view.panX,
      panY: view.panY,
      fx: f?.[0] ?? 0,
      fy: f?.[1] ?? 0,
      fw: f?.[2] ?? 0,
      fh: f?.[3] ?? 0,
      sox: f?.[4] ?? 0.5,
      soy: f?.[5] ?? 1,
      sx: sp.x,
      sy: sp.y
    }

    c.setPointerCapture?.(e.pointerId)
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
    if (!f) return
    ensureOxOy(f)

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
    c.releasePointerCapture?.(e.pointerId)
  }

  const onWheel = (e) => {
    e.preventDefault()

    const rect = c.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const prev = view.scale
    const factor = Math.exp(-e.deltaY * 0.001)
    view.scale = Math.min(20, Math.max(0.25, view.scale * factor))

    view.panX = mx - (mx - view.panX) * (view.scale / prev)
    view.panY = my - (my - view.panY) * (view.scale / prev)
  }

  c.style.touchAction = 'none'
  c.addEventListener('pointerdown', onDown)
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  c.addEventListener('wheel', onWheel, { passive: false })

  return () => {
    c.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    c.removeEventListener('wheel', onWheel)
    clearTimeout(logT)
  }
}

let teardown = null

onMounted(() => {
  const c = canvas.value
  if (!c) return

  teardown = setupInteractions(c)

  if (sheetUrl.value) loadSheet(sheetUrl.value)
  raf = requestAnimationFrame(tick)
})

watch(sheetUrl, (url) => {
  if (url) loadSheet(url)
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
  if (teardown) teardown()
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
