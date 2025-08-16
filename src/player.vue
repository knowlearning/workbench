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

  function findShapes(obj, results = []) {
    if (obj && typeof obj === "object") {
      if (Array.isArray(obj)) {
        for (const item of obj) findShapes(item, results)
      } else {
        if (isShape(obj)) results.push(obj)
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            findShapes(obj[key], results)
          }
        }
      }
    }
    return results
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

    findShapes(state.current)
      .forEach(shape => drawShape(ctx, shape))
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
  function drag({ detail: { clientX, clientY, dx, dy } }) {
    console.log('moving....')
    const shapes = findShapes(state.current)
    let updated = false

    for (const shape of shapes) {
      if (shape.drag && isPointInsideShape(shape, clientX-dx, clientY-dy)) {
        //  TODO: execute the drag function in the rectangle...
        //        also, start dragging on dragstart
        shape.position[0] += dx
        shape.position[1] += dy
        updated = true
      }
    }

    if (updated) draw()
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
    @drag="drag"
    ref="canvas"
    :width="512"
    :height="512"
    style="border:1px solid #ccc;"
  />
</template>

<style scoped>
</style>