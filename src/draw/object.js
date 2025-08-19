import isShape from '../is-shape.js'
import { get as getSprite } from '../player/sprites.js'
import { resolve as resolvePath } from '../player/paths.js'

export function object(ctx, root, path) {
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

export function sprite(ctx, root, path) {
  ctx.save()

  transformContext(ctx, root, path)

  const node = resolvePath(path, root)

  if (node && node.sprite?.sheet) {
    const img = getSprite(node.sprite.sheet)
    ctx.drawImage(img, -img.width / 2, -img.height / 2)
  }

  ctx.restore()
}

function transformContext(ctx, root, path) {
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
}
