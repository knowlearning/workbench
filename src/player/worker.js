import PatchProxy from '@knowlearning/patch-proxy'

const queue = []
let busy = false

function pointInObject(point, { polygon, position, angle }) {
  let { x, y } = point

  const rad = (angle * Math.PI) / 180
  x -= position[0]
  y -= position[1]
  const xr = x * Math.cos(-rad) - y * Math.sin(-rad)
  const yr = x * Math.sin(-rad) + y * Math.cos(-rad)
  x = xr
  y = yr

  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1]
    const xj = polygon[j][0], yj = polygon[j][1]

    const intersect = (
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    )

    if (intersect) inside = !inside
  }
  return inside
}

self.onmessage = ({ data }) => {
  queue.push(data)
  processQueue()
}

async function processQueue() {
  if (busy || queue.length === 0) return
  busy = true

  const { jobId, context, code } = queue.shift()

  try {
    const patches = []
    context.object = new PatchProxy(context.object, patch => patches.push(patch))

    const fullContext = { pointInObject, ...context }
    const keys = Object.keys(fullContext)
    const values = Object.values(fullContext)

    const fn = new Function(keys, `"use strict"; ${code}`)
    await fn(...values)

    self.postMessage({ jobId, result: { patches } })
  } catch (err) {
    self.postMessage({ jobId, error: String(err) })
  } finally {
    busy = false
    processQueue()
  }
}
