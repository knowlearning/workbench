<template>
  <div class="wrap">
    <canvas ref="canvas" />
    <div class="hint">Drag to pan • Wheel to zoom</div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps({
  sprite: {
    type: Object,
    required: true
  }
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
    if (!Array.isArray(f) || f.length < 6) continue
    const [x, y, w, h, ox, oy] = f

    const sx = x * view.scale + view.panX
    const sy = y * view.scale + view.panY
    const sw = w * view.scale
    const sh = h * view.scale

    ctx.strokeStyle = 'rgba(255, 200, 0, 0.95)'
    ctx.strokeRect(sx, sy, sw, sh)

    const px = (x + ox * w) * view.scale + view.panX
    const py = (y + oy * h) * view.scale + view.panY
    ctx.fillStyle = 'rgba(0, 255, 180, 0.9)'
    ctx.beginPath()
    ctx.arc(px, py, 3, 0, Math.PI * 2)
    ctx.fill()

    const label = `${name}  [${x},${y},${w},${h}]  o(${ox},${oy})`
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

function setupInteractions(c) {
  let dragging = false
  let lastX = 0
  let lastY = 0

  const onDown = (e) => {
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    c.setPointerCapture?.(e.pointerId)
  }

  const onMove = (e) => {
    if (!dragging) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    view.panX += dx
    view.panY += dy
  }

  const onUp = (e) => {
    dragging = false
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
