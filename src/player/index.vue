<script setup>
  import { reactive, ref, onMounted, onUnmounted } from 'vue'
  import { applyPatch } from 'fast-json-patch'
  import { standardJSONPatch } from '@knowlearning/patch-proxy'
  import RAPIER from "@dimforge/rapier2d"
  import execute from './execute.js'
  import { load as loadSprite } from './sprites.js'
  import { find as findPaths, resolve as resolvePath } from './paths.js'
  import draw from './draw/index.js'
  import { isShape, toParentEvent } from './utils.js'

  const { id } = defineProps({ id: String })

  const canvas = ref(null)
  const state = JSON.parse(JSON.stringify(await Agent.state(id)))

  function handleKeyDown({ key, keyCode }) {
    handleEvent('keydown', { key, keyCode })
  }

  onMounted(async () => {
    const ctx = canvas.value.getContext("2d")
    const dpr = window.devicePixelRatio || 1
    canvas.value.width = 512 * dpr
    canvas.value.height = 512 * dpr
    canvas.value.style.width = "512px"
    canvas.value.style.height = "512px"
    ctx.scale(dpr, dpr)
    await Promise.all(
      findPaths(state, isShape)
        .map(async path => {
          const node = resolvePath(path, state)
          if (node.sprite?.definition.sheet) await loadSprite(node.sprite.definition.sheet)
        })
    )
    draw(canvas.value, state)
    toggleSpriteFrames()
    window.addEventListener('keydown', handleKeyDown)

    const world = new RAPIER.World({ x: 0, y: 0 })
    const eventQueue = new RAPIER.EventQueue(true)

    const colliderToObject = new Map()

    const objects = []

    for (let object of objects) {
      const { position, polygon, angle } = object
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position[0], position[1])
        .setRotation(angle)

      const body = world.createRigidBody(bodyDesc)
      const verts = polygon.map(([x, y]) => new RAPIER.Vector2(x, y))
      const colliderDesc = RAPIER.ColliderDesc.convexHull(verts)
      if (!colliderDesc) continue

      const collider = world.createCollider(colliderDesc, body)
      colliderToObject.set(collider.handle, object)
    }

    function step() {
      world.step(eventQueue)

      // Process collision events
      eventQueue.drainCollisionEvents((handle1, handle2, started) => {
        const objA = colliderToObject.get(handle1)
        const objB = colliderToObject.get(handle2)
        if (started) {
          console.log(`CONTACT START: ${objA?.id} <-> ${objB?.id}`)
        } else {
          console.log(`CONTACT END:   ${objA?.id} <-> ${objB?.id}`)
        }
      });

      requestAnimationFrame(step);
    }

    step()
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })

  function toggleSpriteFrames() {
    findPaths(state, isShape)
      .map(path => {
        const node = resolvePath(path, state)
        if (node.sprite?.definition.sheet) {
          const spriteDefinitionState = node.sprite.definition.states[node.sprite.state]
          node.sprite.frame = (node.sprite.frame+1)%spriteDefinitionState.frames.length
        }
      })
    draw(canvas.value, state)
    setTimeout(toggleSpriteFrames, 60)
  }

  let lastInteractionRun = Promise.resolve()
  async function handleEvent(type, event) {
    lastInteractionRun = lastInteractionRun.then(async () => {
      const paths = findPaths(state, isShape)

      for (const path of paths) {
        const object = resolvePath(path, state)
        const script = object.handleEvent

        if (script) {
          let eventExtras = {}
          if (event.detail) {
            const { detail: { clientX:x, clientY:y, dx, dy } } = event
            eventExtras = toParentEvent(path, state, { x, y, dx, dy })
          }
          else {
            eventExtras = event
          }
          const context = {
            object,
            event: { ...eventExtras, type }
          }
          const { patches } = await execute(context, script)
          for (const patch of patches) {
            applyPatch(object, standardJSONPatch(patch), false, true)
          }
        }
      }

      if (paths.length) draw(canvas.value, state)
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