import RAPIER from "@dimforge/rapier2d"
import { isShape } from './utils.js'
import { find as findPaths, resolve as resolvePath } from './paths.js'

const scale = 1000
const world = new RAPIER.World({ x: 0, y: 0 })
const colliderToPath = new Map()
const pathToCollider = new Map()

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
      )

      const colliderDesc = (
        RAPIER
          .ColliderDesc
          .convexHull(
            new Float32Array(polygon.flatMap(point => point)).map(v => v/scale)
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

export { world, scale }
