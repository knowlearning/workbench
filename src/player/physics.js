import RAPIER from "@dimforge/rapier2d"
import { isShape } from './utils.js'
import { find as findPaths, resolve as resolvePath } from './paths.js'

const scale = 50
const world = new RAPIER.World({ x: 0, y: 0 })
const eventQueue = new RAPIER.EventQueue(true)
const colliderToPath = new Map()
const pathToCollider = new Map()

world.timestep = 1 / 60
world.integrationParameters.numSolverIterations = 12
world.integrationParameters.numAdditionalFrictionIterations = 4
world.integrationParameters.allowedLinearError = 0.0001
world.integrationParameters.erp = 0.9

export function initializeBodies(state) {
  findPaths(state, isShape)
    .map(path => [path, resolvePath(path, state)])
    .forEach(([path, { position, polygon, angle }]) => {
      //  TODO: revist the convex hull limitation
      const rigidBody = world.createRigidBody(
        RAPIER
          .RigidBodyDesc
          .dynamic()
          .setTranslation(position[0]/scale, position[1]/scale)
          .setRotation((angle || 0) * Math.PI / 180)
          .setCcdEnabled(true)
      )

      const colliderDesc = (
        RAPIER
          .ColliderDesc
          .convexHull(
            new Float32Array(polygon.flatMap(point => point)).map(v => v/scale)
          )
          .setDensity(1)
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
}

export function getColliderFromPath(path) {
  const colliderHandle = pathToCollider.get(JSON.stringify(path))
  return world.getCollider(colliderHandle)
}

export function getColliderPathPairs() {
  return colliderToPath.entries().map(([colliderHandle, path]) => {
    const collider = world.getCollider(colliderHandle)
    return [collider, path]
  })
}

export function stepWorld(state) {
  world.step(eventQueue)
  for (const [collider, path] of getColliderPathPairs()) {
    const rigidBody = collider.parent()
    if (!rigidBody) continue

    const object = resolvePath(path, state)

    const translation = rigidBody.translation()
    const rotation = rigidBody.rotation()

    const x = translation.x*scale
    const y = translation.y*scale

    if (
      object.position[0] !== x ||
      object.position[1] !== y
    ) {
      object.position = [x, y]
    }

    const newAngle = rotation * 180 / Math.PI
    if (object.angle !== newAngle) object.angle = newAngle
  }

  const events = []

  eventQueue.drainCollisionEvents((handle1, handle2, started) => {
    events.push({
      type: started ? 'collide' : 'uncollide',
      paths: [
        colliderToPath.get(handle1),
        colliderToPath.get(handle2)
      ]
    })
  })

  return events
}

export { world, scale }


export function applyPatchToPhysicsLayer(patch, root) {
  // TODO: polygon/collider sync
  patch
    .forEach(op => {
      //  TODO: make path stuff not fragile
      if (op.path[op.path.length-2] === 'position') {
        const p = op.path.slice(0, -2)
        const rigidBody = getColliderFromPath(p)?.parent()
        if (!rigidBody) return
        const object = resolvePath(p, root)
        const [x, y] = object.position
        rigidBody.setTranslation({ x: x/scale, y: y/scale }, true)
      }
      else if (op.path[op.path.length-1] === 'angle') {
        const p = op.path.slice(0, -1)
        const rigidBody = getColliderFromPath(p)?.parent()
        if (!rigidBody) return
        const object = resolvePath(p, root)
        const angle = (object.angle || 0) * Math.PI / 180
        rigidBody.setRotation(angle, true)
      }
    })
}