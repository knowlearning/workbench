import RAPIER from '@dimforge/rapier2d'
import { getObjectFromCollider } from '../physics.js'
import drawArrow from './arrow.js'

export default function drawPhysics(ctx, world, scale, state) {
  ctx.save()

  world.forEachCollider(collider => {
    const body = collider.parent()
    if (!body) return

    const pos = body.translation()
    const angle = body.rotation()

    ctx.save()
    ctx.translate(pos.x*scale, pos.y*scale)
    ctx.rotate(angle)

    const bodyData = getObjectFromCollider(collider, state)

    if (bodyData?.physics?.follow?.position) {
      const followPosition = bodyData?.physics?.follow?.position
      ctx.strokeStyle = "#E10600"
      ctx.lineWidth = 2
      drawArrow(ctx, [0, 0], followPosition, 20)
    }

    ctx.strokeStyle = "#0c0"
    ctx.lineWidth = 1

    const shapeType = collider.shapeType()

    switch (shapeType) {
      case RAPIER.ShapeType.Cuboid: {
        const he = collider.halfExtents()
        ctx.strokeRect(-he.x*scale, -he.y*scale, he.x*2*scale, he.y*2*scale)
        break
      }
      case RAPIER.ShapeType.Ball: {
        ctx.beginPath()
        ctx.arc(0, 0, collider.radius()*scale, 0, Math.PI * 2)
        ctx.stroke()
        break
      }
      case RAPIER.ShapeType.ConvexPolygon: {
        const verts = collider.vertices()
        if (verts.length >= 2) {
          ctx.beginPath()
          ctx.moveTo(verts[0]*scale, verts[1]*scale)
          for (let i = 2; i < verts.length; i += 2) {
            ctx.lineTo(verts[i]*scale, verts[i + 1]*scale)
          }
          ctx.closePath()
          ctx.stroke()
        }
        break
      }
      default:
        console.warn("Unsupported shape type:", shapeType)
        break
    }

    ctx.restore()
  })

  ctx.restore()
}
