<template>
  <div class="wrap">
    <canvas ref="canvas" />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as themes from './themes.js'
import { clamp } from './pan-zoom.js'
import { createPanZoom } from './pan-zoom.js'
import { createFrameOps } from './frame.js'
import { createPlayer } from './player.js'
import { createDraw } from './draw.js'
import { createInteractions } from './interactions.js'

const props = defineProps({
  sprite: { type: Object, required: true }
})

const emit = defineEmits(['event'])

const sheetUrl = computed(() => props.sprite.sheet)
const frames = computed(() => props.sprite.frames || {})
const states = computed(() => props.sprite.states || {})

const canvas = ref(null)

let img = null
const getImg = () => img
const setImg = (newImg) => { img = newImg }

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

// ---------- factory instantiation ----------
const panZoom = createPanZoom({ view, getImg })

const frameOps = createFrameOps({ frames, view, panZoom })

const player = createPlayer({
  frames, states, preview, activeFrame, hoverFrame,
  emitSelectSequence, emitCurrent, handleHover
})

const { draw, loadSheet } = createDraw({
  view, preview, getImg, setImg, getCanvas: () => canvas.value,
  frames, activeFrame, hoverFrame, theme, prefersDark,
  panZoom, frameOps, player, emitCurrent
})

const { setupInteractions } = createInteractions({
  view, preview, frames, activeFrame, hoverFrame,
  getImg, panZoom, frameOps, player,
  handleHover, emitCurrent, emit
})

// ---------- lifecycle ----------
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

  const names = player.listStateNames()
  if (!preview.state) preview.state = names[0] || ''

  emitSelectSequence(preview.state)

  lastCurrentName = null
  emitCurrent(player.currentPlayheadFrameName(), true)

  teardown = setupInteractions(c)

  if (sheetUrl.value) loadSheet(sheetUrl.value)

  ro = new ResizeObserver(() => {
    const c = canvas.value
    if (!c) return
    panZoom.resizeToDisplaySize(c)
    const img = getImg()
    if (!img?.complete || !img.naturalWidth || !img.naturalHeight) return

    const pixelRatio = panZoom.dpr()
    const cw = c.width / pixelRatio
    const ch = c.height / pixelRatio

    // Apply zoom constraint (same bounds as scroll/pinch zoom)
    const fit = panZoom.fitScaleForCanvas(cw, ch)
    const minScale = Math.max(0.01, fit * 0.1)
    const maxScale = 40
    const newScale = clamp(view.scale, minScale, maxScale)

    if (newScale !== view.scale) {
      // Keep the center of the sprite sheet at the same canvas position
      const cx = img.naturalWidth / 2
      const cy = img.naturalHeight / 2
      view.panX += cx * (view.scale - newScale)
      view.panY += cy * (view.scale - newScale)
      view.scale = newScale
    }

    // Apply pan constraints
    const { panX, panY } = panZoom.clampPanToBounds(cw, ch)
    view.panX = panX
    view.panY = panY
    panZoom.snapPanToDevicePixels()
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
    emitCurrent(player.currentPlayheadFrameName(), true)
  }
)

onBeforeUnmount(() => {
  stopLoop()
  if (teardown) teardown()
  ro?.disconnect()
  if (onVis) document.removeEventListener('visibilitychange', onVis)

  panZoom.stopZoomSettle()

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
  }

  canvas {
    width: 100%;
    height: 100%;
    display: block;
  }

  @media (prefers-color-scheme: light) {
    .wrap {
      background: #f6f8fb;
    }
  }

</style>
