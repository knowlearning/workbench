<script setup>
  import { reactive, ref, onMounted, onUnmounted } from 'vue'
  import { applyPatch } from 'fast-json-patch'
  import { standardJSONPatch } from '@knowlearning/patch-proxy'
  import execute from './execute.js'
  import { loadAll as loadAllSprites } from './sprites.js'
  import { find as findPaths, resolve as resolvePath } from './paths.js'
  import draw from './draw/index.js'
  import { isShape, toParentEvent } from './utils.js'
  import initializeCanvas from './initialize-canvas.js'
  import {
    world, scale as RAPIER_SCALE,
    initializeBodies as initializePhysicsBodies,
    getColliderFromPath,
    getColliderPathPairs,
    stepWorld
  } from './physics.js'

  const { id } = defineProps({ id: String })

  const canvas = ref(null)
  const state = JSON.parse(JSON.stringify(await Agent.state(id)))

  let running = true

  const queueDraw = () => draw(canvas.value, state, world, RAPIER_SCALE)

  function handleKeyDown({ key, keyCode }) {
    handleEvent('keydown', { key, keyCode })
  }

  onMounted(async () => {
    initializeCanvas(canvas.value)
    await loadAllSprites(state)
    initializePhysicsBodies(state)
    window.addEventListener('keydown', handleKeyDown)

    queueDraw()

    let accumulator = 0
    const fixedDelta = 1000 / 60
    let lastTime = 0

    function step(now) {
      if (!running) return

      const dt = now - lastTime
      lastTime = now
      accumulator += dt

      while (accumulator >= fixedDelta) {
        const events = stepWorld(state)
        events.forEach(event => {
          const type = event.started ? 'collide' : 'uncollide'
          handleEvent(type, event)
        })
        handleEvent('step', { dt: fixedDelta })
        accumulator -= fixedDelta
      }

      queueDraw()
      requestAnimationFrame(step)
    }

    step(0)
  })

  onUnmounted(() => {
    running = false
    window.removeEventListener('keydown', handleKeyDown)
  })

  function getPathSpecificContext(path, event, type) {
    let eventExtras = {}
    if (event.detail) {
      const { detail: { clientX:x, clientY:y, dx, dy } } = event
      eventExtras = toParentEvent(path, state, { x, y, dx, dy })
    }
    else {
      eventExtras = event
    }
    return {
      path,
      state,
      event: { ...eventExtras, type }
    }
  }

  function applyPatchesToObject(object, collider, patches) {
    for (const patch of patches) {
      applyPatch(object, standardJSONPatch(patch), false, true)
      patch
        .forEach(op => {
          const rigidBody = collider?.parent()

          if (!rigidBody) return

          if (op.path[0] === 'position') {
            const [x, y] = object.position
            rigidBody.setTranslation({ x: x/RAPIER_SCALE, y: y/RAPIER_SCALE }, true)
          }
          else if (op.path[0] === 'angle') {
            const angle = (object.angle || 0) * Math.PI / 180
            rigidBody.setRotation(angle, true)
          }
          // TODO: polygon/collider sync
        })
    }
  }

  let lastInteractionRun = Promise.resolve()
  async function handleEvent(type, event) {
    lastInteractionRun = lastInteractionRun.then(async () => {
      const paths = findPaths(state, isShape)

      for (const path of paths) {
        const object = resolvePath(path, state)
        const script = object.step
        if (script) {
          const collider = getColliderFromPath(path)
          const context = getPathSpecificContext(path, event, type)
          const { patches } = await execute(context, script)
          applyPatchesToObject(object, collider, patches)
        }
      }

      if (paths.length) queueDraw()
    })
  }

</script>

<template>
  <canvas
    v-drag
    @dragstart="event => handleEvent('touch', event)"
    @drag="event => handleEvent('drag', event)"
    @dragend="event => handleEvent('untouch', event)"
    ref="canvas"
    :width="512"
    :height="512"
    style="border:1px solid #ccc;"
  />
</template>

<style scoped>
</style>