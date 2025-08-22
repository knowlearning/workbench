import { find as findPaths } from '../paths.js'
import drawPolygon from './polygon.js'
import drawSprite from './sprite.js'
import drawArrow from './arrow.js'
import drawText from './text.js'
import drawPhysics from './physics.js'
import { getWorldPosition } from '../utils.js'
import { isShape } from '../utils.js'

let drawScheduled = false
export default function draw(canvas, state, world, physicsScale) {
  if (!drawScheduled) {
    drawScheduled = true
    requestAnimationFrame(() => {
      drawScheduled = false

      const ctx = canvas.getContext("2d")
      ctx.clearRect(0, 0, 512, 512)

      const paths = findPaths(state, isShape)

      paths.forEach(path => drawSprite(ctx, state, path))
      paths.forEach(path => drawPolygon(ctx, state, path))
      paths.forEach(path => drawText(ctx, state, path))

      ctx.strokeStyle = "rgba(0, 0, 255, 0.5)"
      ctx.lineWidth = 1
      paths.forEach(path => {
        if (path.length > 0) {
          const parentPath = path.slice(0, -1)
          const parentPos = getWorldPosition(parentPath, state)
          const childPos  = getWorldPosition(path, state)
          drawArrow(ctx, parentPos, childPos)
        }
      })
      drawPhysics(ctx, world, physicsScale)
    })
  }
}