<script setup>
  import { reactive, ref, onMounted } from 'vue'
  import execute from './execute.js'
  import drawArrow from './draw/arrow.js'

  const { id } = defineProps({ id: String })

  const canvas = ref(null)
  const state = reactive(await Agent.state(`run-state/${id}`))

  if (!state.initialized) {
    state.current = JSON.parse(JSON.stringify(await Agent.state(id)))
    state.initialized = true
  }

  const isShape = object => (
    Array.isArray(object.path) &&
    Array.isArray(object.position) &&
    typeof object.angle === "number"
  )

  function findPaths(object, test, paths=[], path=[]) {
    if (object && typeof object === "object") {
      if (Array.isArray(object)) {
        object.forEach((item, key) => {
          findPaths(item, test, paths, [...path, key])
        })
      } else {
        if (test(object, path)) paths.unshift(path)
        for (const key in object) {
          if (Object.prototype.hasOwnProperty.call(object, key)) {
            findPaths(object[key], test, paths, [...path, key])
          }
        }
      }
    }
    return paths
  }

  function drawShapeAtPath(ctx, path) {
    ctx.save()

    let node = state.current

    if (isShape(node)) {
      ctx.translate(node.position[0], node.position[1])
      ctx.rotate((node.angle * Math.PI) / 180)
    }

    for (const key of path) {
      node = node[key]
      if (!node) break

      if (isShape(node)) {
        ctx.translate(node.position[0], node.position[1])
        ctx.rotate((node.angle * Math.PI) / 180)
      }
    }

    if (node && node.path) {
      ctx.strokeStyle = "black"
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let i = 0; i < node.path.length; i++) {
        const [x, y] = node.path[i]
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
      ctx.stroke()
    }

    ctx.restore()
  }

  let drawScheduled = false
  function draw() {
    if (!drawScheduled) {
      drawScheduled = true
      requestAnimationFrame(() => {
        drawScheduled = false

        const ctx = canvas.value.getContext("2d")
        ctx.clearRect(0, 0, 512, 512)

        const paths = findPaths(state.current, isShape)

        paths.forEach(path => drawShapeAtPath(ctx, path))

        ctx.strokeStyle = "rgba(0, 0, 255, 0.5)" // blue, 50% opacity
        ctx.lineWidth = 1
        paths.forEach(path => {
          if (path.length > 0) {
            const parentPath = path.slice(0, -1)
            const parentPos = getWorldPosition(parentPath, state.current)
            const childPos  = getWorldPosition(path, state.current)
            drawArrow(ctx, parentPos, childPos)
          }
        })
      })
    }
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
        if (!shape || !shape[scriptName] || !isPointInsideShapeWithParents(path, state.current, x - dx, y - dy)) continue

        const context = {
          object: JSON.parse(JSON.stringify(shape)),
          event: toParentEvent(path, state.current, { x, y, dx, dy })
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
    if (path.length && value !== undefined) {
      return resolvePath(path.slice(1), value[path[0]])
    }
    return value
  }

  function isPointInsideShape(shape, px, py) {
    const { path } = shape
    let inside = false
    for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
      const xi = path[i][0], yi = path[i][1]
      const xj = path[j][0], yj = path[j][1]
 
      const intersect = (
        yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
      )
 
      if (intersect) inside = !inside
    }
    return inside
  }

  function isPointInsideShapeWithParents(path, root, px, py) {
    // accumulate transforms from root through the path
    let node = root
    let transforms = []

    if (isShape(node)) transforms.push(node)

    for (const key of path) {
      node = node[key]
      if (!node) break
      if (isShape(node)) transforms.push(node)
    }

    // walk transforms backwards: convert global point into local space
    let x = px
    let y = py
    for (let i = 0; i < transforms.length; i++) {
      const { position, angle } = transforms[i]
      const rad = (angle * Math.PI) / 180
      x -= position[0]
      y -= position[1]
      const lx = x * Math.cos(-rad) - y * Math.sin(-rad)
      const ly = x * Math.sin(-rad) + y * Math.cos(-rad)
      x = lx
      y = ly
    }

    const shape = transforms[transforms.length - 1]
    return isPointInsideShape(shape, x, y)
  }

  function matMultiply(a, b) {
    return [
      a[0]*b[0]+a[1]*b[3], a[0]*b[1]+a[1]*b[4], a[0]*b[2]+a[1]*b[5]+a[2],
      a[3]*b[0]+a[4]*b[3], a[3]*b[1]+a[4]*b[4], a[3]*b[2]+a[4]*b[5]+a[5],
      0, 0, 1
    ]
  }

  function matInvert(m) {
    const [a,b,c,d,e,f] = m
    const det = a*e - b*d
    if (det === 0) return null
    const idet = 1/det
    return [
      e*idet, -b*idet, (b*f - e*c)*idet,
      -d*idet, a*idet, (d*c - a*f)*idet,
      0,0,1
    ]
  }

  function matPoint(m, x, y) {
    return [
      m[0]*x + m[1]*y + m[2],
      m[3]*x + m[4]*y + m[5]
    ]
  }

  function matVector(m, x, y) {
    return [
      m[0]*x + m[1]*y,
      m[3]*x + m[4]*y
    ]
  }

  function matFromShape(shape) {
    const rad = (shape.angle||0) * Math.PI / 180
    const cos = Math.cos(rad), sin = Math.sin(rad)
    const [x, y] = shape.position || [0,0]
    return [
      cos, -sin, x,
      sin,  cos, y,
      0,0,1
    ]
  }

  function computeTransformToNode(path, root) {
    let node = root
    let m = [1,0,0, 0,1,0, 0,0,1] // identity

    // include root if it’s a shape (matches draw order)
    if (isShape(node)) {
      m = matMultiply(m, matFromShape(node)) // T*R
    }

    for (const key of path) {
      node = node[key]
      if (!node) break
      if (isShape(node)) {
        m = matMultiply(m, matFromShape(node)) // T*R
      }
    }
    return m
  }

  function toParentEvent(path, root, { x, y, dx, dy }) {
    if (path.length === 0) {
      return { x, y, dx, dy }
    }

    const parentPath = path.slice(0, -1)
    const mParent = computeTransformToNode(parentPath, root)
    const invParent = matInvert(mParent)
    if (!invParent) return { x, y, dx, dy }

    const [px, py]   = matPoint(invParent, x, y)
    const [px2, py2] = matPoint(invParent, x + dx, y + dy)
    return { x: px, y: py, dx: px2 - px, dy: py2 - py }
  }

  function getWorldPosition(path, root) {
    const m = computeTransformToNode(path, root)
    return [m[2], m[5]] // translation part of the matrix
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