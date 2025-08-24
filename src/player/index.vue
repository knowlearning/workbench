<script setup>
  import { ref, onMounted, onUnmounted } from 'vue'
  import { applyPatch } from 'fast-json-patch'
  import { standardJSONPatch } from '@knowlearning/patch-proxy'
  import execute from './execute.js'
  import { loadAll as loadAllSprites } from './sprites.js'
  import draw from './draw/index.js'
  import initializeCanvas from './initialize-canvas.js'
  import { initializeBodies as initPhysicsBodies, stepWorld, applyPatchToPhysicsLayer } from './physics.js'

  const { id } = defineProps({ id: String })

  const canvas = ref(null)
  const state = JSON.parse(JSON.stringify(await Agent.state(id)))

  let running = true
  let eventQueue = []

  const queueEvent = event => eventQueue.push(event)
  const handleKeyDown = ({ key, keyCode }) => queueEvent({ type: 'keydown', key, keyCode })

  onMounted(async () => {
    window.addEventListener('keydown', handleKeyDown)

    initializeCanvas(canvas.value)
    await loadAllSprites(state)
    initPhysicsBodies(state)

    let accumulator = 0
    const dt = 1000 / 60
    let lastTime = 0

    async function step(now) {
      if (!running) return
      draw(canvas.value, state)

      accumulator += now - lastTime
      lastTime = now

      const currentQueue = eventQueue
      eventQueue = []

      while (accumulator >= dt) {
        stepWorld(state).forEach(queueEvent)
        queueEvent({ type: 'step', dt })
        const { patches } = await execute({ state, events: currentQueue })
        for (const patch of patches) {
          applyPatch(state, standardJSONPatch(patch), false, true)
          applyPatchToPhysicsLayer(patch, state)
        }
        accumulator -= dt
      }
      requestAnimationFrame(step)
    }

    step(0)
  })

  onUnmounted(() => {
    running = false
    window.removeEventListener('keydown', handleKeyDown)
  })

  function handleUserEvent(type, event) {
    const { detail: { clientX:x, clientY:y, dx, dy } } = event
    queueEvent({ type, x, y, dx, dy })
  }
</script>

<template>
  <canvas
    ref="canvas"
    v-drag
    @dragstart="e => handleUserEvent('touch', e)"
    @drag="e => handleUserEvent('drag', e)"
    @dragend="e => handleUserEvent('untouch', e)"
  />
</template>
