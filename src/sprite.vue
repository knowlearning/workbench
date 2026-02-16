<template>
  <div class="sprite-canvas" :style="{ width: cssWidth, height: cssHeight }">
    <canvas
      ref="canvasEl"
      :width="width"
      :height="height"
      :style="{ width: cssWidth, height: cssHeight }"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, defineProps, defineEmits, defineExpose } from 'vue'

const props = defineProps({
  sprite: { type: Object, required: true },

  state: { type: String, default: 'idle' },

  // position in canvas pixels
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },

  // transforms
  scale: { type: Number, default: 1 },
  rotation: { type: Number, default: 0 }, // radians
  flipX: { type: Boolean, default: false },
  flipY: { type: Boolean, default: false },
  alpha: { type: Number, default: 1 },

  // canvas sizing: internal pixels + css size
  width: { type: Number, default: 256 },
  height: { type: Number, default: 256 },
  cssWidth: { type: String, default: '256px' },
  cssHeight: { type: String, default: '256px' },

  // timing
  playing: { type: Boolean, default: true },
  timeScale: { type: Number, default: 1 },

  // rendering
  clear: { type: Boolean, default: true },
  background: { type: String, default: '' },
  imageSmoothing: { type: Boolean, default: false },

  restartOnStateChange: { type: Boolean, default: true }
})

const emit = defineEmits(['loaded', 'frame', 'ended'])

const canvasEl = ref(null)
const ctx = ref(null)

const w = computed(() => Math.max(1, props.width | 0))
const h = computed(() => Math.max(1, props.height | 0))

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v))
}

function buildPlaybackIndices(loop, frameCount) {
  const base = Array.from({ length: frameCount }, (_, i) => i)

  if (loop === 'alternate') {
    if (frameCount <= 1) return base
    const back = Array.from({ length: frameCount - 2 }, (_, i) => frameCount - 2 - i)
    return base.concat(back)
  }

  return base
}

function normalizeState(name) {
  const s = props.sprite?.states?.[name] || props.sprite?.states?.idle
  if (!s) return null
  const loop = s.loop ?? 'repeat'
  const seq = Array.isArray(s.sequence) ? s.sequence : []
  return { loop, seq }
}

function resolveFrame(frameName) {
  const f = props.sprite?.frames?.[frameName]
  if (!f) return null
  const [sx, sy, sw, sh, ox, oy] = f
  return { sx, sy, sw, sh, ox, oy }
}

const img = new Image()
img.crossOrigin = 'anonymous'

let raf = 0
let lastT = 0

const pb = {
  stateName: '',
  seq: [],
  loop: 'repeat',
  pattern: [],
  patternIdx: 0,
  repeatLeft: 0,
  frameIdx: 0,
  frameTime: 0,
  ended: false
}

function resetPlayback(name) {
  const def = normalizeState(name)
  if (!def) return

  pb.stateName = name
  pb.loop = def.loop
  pb.seq = def.seq

  const frameCount = pb.seq.length
  pb.pattern = buildPlaybackIndices(pb.loop, frameCount)
  pb.patternIdx = 0
  pb.frameTime = 0
  pb.ended = false

  if (typeof pb.loop === 'number' && pb.loop > 0) {
    pb.repeatLeft = pb.loop
  } else {
    pb.repeatLeft = 0
  }

  pb.frameIdx = pb.pattern.length ? pb.pattern[pb.patternIdx] : 0
  emit('frame', { state: pb.stateName, index: pb.frameIdx })
}

function currentFrameDef() {
  if (!pb.seq.length) return null
  const entry = pb.seq[pb.frameIdx]
  if (!entry) return null

  const frameName = entry[0]
  const durationMs = entry[1]
  if (typeof durationMs !== 'number') return null

  const f = resolveFrame(frameName)
  if (!f) return null

  return { frameName, durationMs, ...f }
}

function advanceFrame() {
  const nextPatternIdx = pb.patternIdx + 1
  const atEndOfPattern = nextPatternIdx >= pb.pattern.length

  if (pb.loop === 'once') {
    if (atEndOfPattern) {
      pb.patternIdx = Math.max(0, pb.pattern.length - 1)
      pb.frameIdx = pb.pattern[pb.patternIdx] ?? 0
      pb.ended = true
      emit('frame', { state: pb.stateName, index: pb.frameIdx })
      emit('ended', { state: pb.stateName })
      return
    }
    pb.patternIdx = nextPatternIdx
    pb.frameIdx = pb.pattern[pb.patternIdx]
    emit('frame', { state: pb.stateName, index: pb.frameIdx })
    return
  }

  if (pb.loop === 'repeat' || pb.loop === 'alternate') {
    pb.patternIdx = atEndOfPattern ? 0 : nextPatternIdx
    pb.frameIdx = pb.pattern[pb.patternIdx] ?? 0
    emit('frame', { state: pb.stateName, index: pb.frameIdx })
    return
  }

  if (typeof pb.loop === 'number') {
    if (atEndOfPattern) {
      pb.repeatLeft -= 1
      if (pb.repeatLeft <= 1) {
        pb.patternIdx = Math.max(0, pb.pattern.length - 1)
        pb.frameIdx = pb.pattern[pb.patternIdx] ?? 0
        pb.ended = true
        emit('frame', { state: pb.stateName, index: pb.frameIdx })
        emit('ended', { state: pb.stateName })
        return
      }
      pb.patternIdx = 0
      pb.frameIdx = pb.pattern[pb.patternIdx] ?? 0
      emit('frame', { state: pb.stateName, index: pb.frameIdx })
      return
    }

    pb.patternIdx = nextPatternIdx
    pb.frameIdx = pb.pattern[pb.patternIdx] ?? 0
    emit('frame', { state: pb.stateName, index: pb.frameIdx })
    return
  }

  pb.patternIdx = atEndOfPattern ? 0 : nextPatternIdx
  pb.frameIdx = pb.pattern[pb.patternIdx] ?? 0
  emit('frame', { state: pb.stateName, index: pb.frameIdx })
}

function step(dtMs) {
  if (!props.playing || pb.ended) return

  let def = currentFrameDef()
  if (!def) return

  const scaled = dtMs * (props.timeScale || 0)
  pb.frameTime += scaled

  let guard = 0
  while (def && pb.frameTime >= def.durationMs && guard++ < 100) {
    pb.frameTime -= def.durationMs
    advanceFrame()
    if (pb.ended) return
    def = currentFrameDef()
    if (!def) return
  }
}

function draw() {
  const c = ctx.value
  if (!c) return

  c.imageSmoothingEnabled = !!props.imageSmoothing

  if (props.clear) {
    if (props.background) {
      c.save()
      c.globalAlpha = 1
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.fillStyle = props.background
      c.fillRect(0, 0, w.value, h.value)
      c.restore()
    } else {
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.clearRect(0, 0, w.value, h.value)
    }
  }

  const def = currentFrameDef()
  if (!def || !img.complete || !img.naturalWidth) return

  const a = clamp(props.alpha, 0, 1)
  const sx = def.sx | 0
  const sy = def.sy | 0
  const sw = def.sw | 0
  const sh = def.sh | 0
  const ox = def.ox
  const oy = def.oy

  const ax = ox * sw
  const ay = oy * sh

  const x = props.x
  const y = props.y
  const s = props.scale
  const r = props.rotation

  const fx = props.flipX ? -1 : 1
  const fy = props.flipY ? -1 : 1

  c.save()
  c.globalAlpha = a

  c.translate(x, y)
  if (r) c.rotate(r)
  c.scale(fx * s, fy * s)

  c.drawImage(img, sx, sy, sw, sh, -ax, -ay, sw, sh)

  c.restore()
}

function tick(t) {
  if (!lastT) lastT = t
  const dt = t - lastT
  lastT = t

  step(dt)
  draw()

  raf = requestAnimationFrame(tick)
}

async function init() {
  await nextTick()
  const el = canvasEl.value
  if (!el) return
  ctx.value = el.getContext('2d')

  const url = props.sprite?.sheet
  if (url) {
    img.onload = () => emit('loaded', { width: img.naturalWidth, height: img.naturalHeight })
    img.src = url
  }

  resetPlayback(props.state)

  cancelAnimationFrame(raf)
  lastT = 0
  raf = requestAnimationFrame(tick)
}

function setState(name, { restart = true } = {}) {
  if (!name) return
  if (pb.stateName === name && !restart) return
  resetPlayback(name)
}

function play() {
  pb.ended = false
}

function stop() {
  pb.ended = true
}

function drawOnce() {
  draw()
}

defineExpose({ setState, play, stop, drawOnce })

watch(
  () => props.state,
  (n, o) => {
    if (n === o) return
    setState(n, { restart: props.restartOnStateChange })
  }
)

watch(
  () => props.sprite,
  () => {
    const url = props.sprite?.sheet
    if (url && img.src !== url) img.src = url
    resetPlayback(props.state)
  },
  { deep: true }
)

watch([w, h], () => {
  // canvas element updates via props bindings; next frame will clear/draw
})

onMounted(init)
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<style scoped>
.sprite-canvas {
  display: inline-block;
  position: relative;
}
canvas {
  display: block;
  image-rendering: pixelated;
}
</style>
