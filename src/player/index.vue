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
    world,
    scale as RAPIER_SCALE,
    initializeBodies as initializePhysicsBodies,
    getColliderFromPath,
    getColliderPathPairs,
    stepWorld
  } from './physics.js'

  const { id } = defineProps({ id: String })

  const canvas = ref(null)
  const state = JSON.parse(JSON.stringify(await Agent.state(id)))

  let running = true
  const eventQueue = []

  const queueDraw = () => draw(canvas.value, state, world, RAPIER_SCALE)
  const queueEvent = event => eventQueue.push(event)

  function handleKeyDown({ key, keyCode }) {
    queueEvent({ type: 'keydown', key, keyCode })
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

    async function step(now) {
      if (!running) return

      accumulator += now - lastTime
      lastTime = now

      while (accumulator >= fixedDelta) {
        const events = stepWorld(state)
        events.forEach(event => {
          queueEvent({
            type: event.started ? 'collide' : 'uncollide',
            ...event
          })
        })
        queueEvent({ type: 'step', dt: fixedDelta })
        while (eventQueue.length) {
          const event = eventQueue.shift()
          if (event.type !== 'step') console.log('handling event...', event)
          await handleEvent(event.type, event)
        }
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

  function isTouchEvent(type) {
    return ['touch', 'untouch', 'drag'].includes(type)
  }

  function getPathSpecificContext(path, event, type) {
    return {
      path,
      state,
      event: isTouchEvent(event.type) ? { ...toParentEvent(path, state, event), type } : event
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

  async function handleEvent(type, event) {
    const paths = findPaths(state, isShape)

    for (const path of paths) {
      const object = resolvePath(path, state)
      const script = object.step
      if (script) {
        const collider = getColliderFromPath(path)
        const context = getPathSpecificContext(path, event, type)
        if (event.type !== 'step') console.log('path specific context', event, object)
        const { patches } = await execute(context, script)
        if (event.type !== 'step') console.log('patches...', patches)
        applyPatchesToObject(object, collider, patches)
      }
    }
  }

</script>

<template>
  <canvas
    v-drag
    @dragstart="event => {
      const { detail: { clientX:x, clientY:y, dx, dy } } = event
      queueEvent({
        type: 'touch',
        x, y, dx, dy
      })
    }"
    @drag="event => {
      const { detail: { clientX:x, clientY:y, dx, dy } } = event
      queueEvent({
        type: 'drag',
        x, y, dx, dy
      })
    }"
    @dragend="event => {
      const { detail: { clientX:x, clientY:y, dx, dy } } = event
      queueEvent({
        type: 'untouch',
        x, y, dx, dy
      })
    }"
    ref="canvas"
    :width="512"
    :height="512"
    style="border:1px solid #ccc;"
  />
</template>

<style scoped>
</style>