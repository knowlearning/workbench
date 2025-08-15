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


  function findRectangles(obj, results = []) {
    if (obj && typeof obj === "object") {
      if (Array.isArray(obj)) {
        for (const item of obj) findRectangles(item, results)
      } else {
        if (
          typeof obj.width === "number" &&
          typeof obj.height === "number" &&
          typeof obj.top === "number" &&
          typeof obj.left === "number"
        ) {
          results.push(obj)
        }
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            findRectangles(obj[key], results)
          }
        }
      }
    }
    return results
  }

  function drawRectangles(ctx, rectangles) {
    rectangles.forEach((rect) => {
      ctx.save()
      const angleRad = rect.angle ? rect.angle * Math.PI / 180 : 0

      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      ctx.translate(centerX, centerY)
      ctx.rotate(angleRad)
      ctx.fillStyle = rect.color || "rgba(0, 150, 255, 0.4)"
      ctx.strokeStyle = rect.stroke || "black"
      ctx.lineWidth = 2

      ctx.fillRect(-rect.width / 2, -rect.height / 2, rect.width, rect.height)
      ctx.strokeRect(-rect.width / 2, -rect.height / 2, rect.width, rect.height)
      ctx.restore()
    });
  }

  function draw() {
    const ctx = canvas.value.getContext("2d")
    ctx.clearRect(0, 0, 512, 512)

    const rectangles = findRectangles(state.current)
    drawRectangles(ctx, rectangles)
  }

  onMounted(draw)

  function drag({ detail: { clientX, clientY, dx, dy } }) {
    console.log('moving....')
    const rectangles = findRectangles(state.current)
    let updated = false

    for (const rect of rectangles) {
      if (rect.drag && isPointInsideRect(clientX-dx, clientY-dy, rect)) {
        //  TODO: execute the drag function in the rectangle...
        //        also, start dragging on dragstart
        moveRectangle(rect, dx, dy)
        updated = true
      }
    }

    if (updated) draw()
  }

  function isPointInsideRect(x, y, { left, top, width, height }) {
    return x >= left && x <= left + width && y >= top && y <= top + height
  }

  function moveRectangle(rect, dx, dy) {
    rect.left += dx
    rect.top += dy
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