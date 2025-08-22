import PatchProxy from '@knowlearning/patch-proxy'
import { resolve as resolvePath } from './paths.js'

const queue = []
let busy = false

function isSamePath(a, b) {
  return a.length === b.length && a.every((v, i) => v===b[i])
}

function isCollisionType(type) {
  return ['collide', 'uncollide'].includes(type)
}

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
    let { path, state, event } = context
    const patches = []
    const object = new PatchProxy(resolvePath(path, state), patch => patches.push(patch))

    //  TODO: generate one proxy object for state per game step and resolve against that
    if (isCollisionType(event.type)) {
      event = {
        colliders: event.paths.map(p => isSamePath(p, path) ? object : resolvePath(path, state)),
        type: event.type
      }
    }

    const fullContext = { pointInObject, event }
    const keys = Object.keys(fullContext)
    const values = Object.values(fullContext)

    const fn = new Function(keys, `"use strict"; ${code}`)
    await fn.apply(object, values)

    self.postMessage({ jobId, result: { patches } })
  } catch (error) {
    console.error(error)
    self.postMessage({ jobId, error: String(error) })
  } finally {
    busy = false
    processQueue()
  }
}
