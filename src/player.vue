<script setup>
  import { reactive, ref, onMounted } from 'vue'
  import execute from './execute.js'

  const { id } = defineProps({ id: String })

  const canvas = ref(null)
  const state = reactive(await Agent.state(`run-state/${id}`))

  if (!state.initialized) {
    state.current = JSON.parse(JSON.stringify(await Agent.state(id)))
    state.initialized = true
  }

  const isShape = obj => (
    Array.isArray(obj.path) &&
    Array.isArray(obj.position) &&
    typeof obj.angle === "number"
  )

  function findPaths(obj, test, paths=[], path=[]) {
    if (obj && typeof obj === "object") {
      if (Array.isArray(obj)) {
        for (const [key, item] in obj) {
          findPaths(item, test, paths, [...path, key])
        }
      } else {
        if (test(obj)) paths.unshift(path)
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            findPaths(obj[key], test, paths, [...path, key])
          }
        }
      }
    }
    return paths
  }

  function drawShape(ctx, shape) {
    ctx.strokeStyle = "black"
    ctx.lineWidth = 1
    const { path, position, angle } = shape
    ctx.save()

    ctx.translate(position[0], position[1])
    ctx.rotate((angle * Math.PI) / 180)

    ctx.beginPath()
    for (let i = 0; i < path.length; i++) {
      const [x, y] = path[i]
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.stroke()

    ctx.restore()
  }

  function draw() {
    const ctx = canvas.value.getContext("2d")
    ctx.clearRect(0, 0, 512, 512)

    findPaths(state.current, isShape)
      .forEach(path => {
        const shape = resolvePath(path, state.current)
        drawShape(ctx, shape)
      })
  }

  onMounted(() => {
    const ctx = canvas.value.getContext("2d")
    const dpr = window.devicePixelRatio || 1
    canvas.value.width = 512 * dpr
    canvas.value.height = 512 * dpr
    canvas.value.style.width = "512px"
    canvas.value.style.height = "512px"
    ctx.scale(dpr, dpr)
    draw()
  })

  let lastInteractionRun = Promise.resolve()
  async function applyInteractionScript(scriptName, event) {
    const { detail: { clientX:x, clientY:y, dx, dy } } = event
    lastInteractionRun = lastInteractionRun.then(async () => {
      const paths = findPaths(state.current, isShape)

      for (const path of paths) {
        const shape = resolvePath(path, state.current)
        if (!shape || !shape[scriptName] || !isPointInsideShape(shape, x - dx, y - dy)) continue

        const context = {
          object: JSON.parse(JSON.stringify(shape)),
          event: { x, y, dx, dy }
        }

        const result = await execute(context, shape[scriptName])
        //  TODO: apply updates instead of full re-writes
        Object
          .entries(result.object)
          .forEach(([key, value]) => {
            shape[key] = value
          })
      }

      if (paths.length) draw()
    })
  }

  function resolvePath(path, value) {
    if (path[0] && value !== undefined) {
      return resolvePath(path.slice(1), value[path[0]])
    }

    return value
  }

  function isPointInsideShape(shape, px, py) {
    const { path, position, angle } = shape
    const rad = (angle * Math.PI) / 180

    let x = px - position[0]
    let y = py - position[1]

    const localX = x * Math.cos(-rad) - y * Math.sin(-rad)
    const localY = x * Math.sin(-rad) + y * Math.cos(-rad)

    let inside = false
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
      const xi = path[i][0], yi = path[i][1]
      const xj = path[j][0], yj = path[j][1]

      const intersect = (
        yi > localY !== yj > localY &&
        localX < ((xj - xi) * (localY - yi)) / (yj - yi) + xi
      )

      if (intersect) inside = !inside
    }

    return inside
  }

</script>

<template>
  <canvas
    v-drag
    @dragstart="event => applyInteractionScript('touch', event)"
    @drag="event => applyInteractionScript('drag', event)"
    @dragend="event => applyInteractionScript('untouch', event)"
    ref="canvas"
    :width="512"
    :height="512"
    style="border:1px solid #ccc;"
  />
</template>

<style scoped>
</style>