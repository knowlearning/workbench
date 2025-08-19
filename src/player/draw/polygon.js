import { isShape, transformContext } from '../utils.js'
import { resolve as resolvePath } from '../paths.js'

export default function polygon(ctx, root, path) {
  ctx.save()

  transformContext(ctx, root, path)

  const node = resolvePath(path, root)

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
