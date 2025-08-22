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

  const RAPIER_SCALE = 100

  const canvas = ref(null)
  const state = JSON.parse(JSON.stringify(await Agent.state(id)))

  let running = true
  const world = new RAPIER.World({ x: 0, y: 0 })
  const eventQueue = new RAPIER.EventQueue(true)

  const colliderToPath = new Map()
  const pathToCollider = new Map()

  const queueDraw = () => draw(canvas.value, state, world, RAPIER_SCALE)

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
    queueDraw()
    window.addEventListener('keydown', handleKeyDown)

    findPaths(state, isShape)
      .map(path => [path, resolvePath(path, state)])
      .forEach(([path, { position, polygon, angle }]) => {
        //  TODO: revist the convex hull limitation
        const rigidBody = world.createRigidBody(
          RAPIER
            .RigidBodyDesc
            .dynamic()
            .setTranslation(position[0]/RAPIER_SCALE, position[1]/RAPIER_SCALE)
            .setRotation((angle || 0) * Math.PI / 180)
        )

        const colliderDesc = (
          RAPIER
            .ColliderDesc
            .convexHull(
              new Float32Array(polygon.flatMap(point => point)).map(v => v/RAPIER_SCALE)
            )
            .setDensity(.1)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS)
        )

        if (colliderDesc) {
          const collider = world.createCollider(colliderDesc, rigidBody)
          colliderToPath.set(collider.handle, path)
          pathToCollider.set(JSON.stringify(path), collider.handle)
        }
        else {
          console.warn("Invalid convex hull for polygon:", polygon)
        }
      })

    function step() {
      if (!running) return

      world.step(eventQueue)

      for (const [colliderHandle, path] of colliderToPath.entries()) {
        const collider = world.getCollider(colliderHandle)
        const rigidBody = collider.parent()
        if (!rigidBody) continue

        const object = resolvePath(path, state)

        const translation = rigidBody.translation()
        const rotation = rigidBody.rotation()

        const x = translation.x*RAPIER_SCALE
        const y = translation.y*RAPIER_SCALE

        if (
          object.position[0] !== x ||
          object.position[1] !== y
        ) {
          object.position = [x, y]
        }

        const newAngle = rotation * 180 / Math.PI
        if (object.angle !== newAngle) object.angle = newAngle
      }

      eventQueue.drainCollisionEvents((handle1, handle2, started) => {
        const event = {
          paths: [
            colliderToPath.get(handle1),
            colliderToPath.get(handle2)
          ]
        }
        handleEvent(started ? 'collide' : 'uncollide', event)
      })

      requestAnimationFrame(step)
      queueDraw()
    }

    step()
  })

  onUnmounted(() => {
    running = false
    window.removeEventListener('keydown', handleKeyDown)
  })


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
            path,
            state,
            event: { ...eventExtras, type }
          }
          const { patches } = await execute(context, script)
          for (const patch of patches) {
            applyPatch(object, standardJSONPatch(patch), false, true)
            patch
              .forEach(op => {
                const colliderHandle = pathToCollider.get(JSON.stringify(path))
                const collider = world.getCollider(colliderHandle)
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