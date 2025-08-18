import isShape from '../is-shape.js'

export default function drawPath(ctx, root, path) {
  ctx.save()

  let node = root

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