import { isShape, transformContext } from '../utils.js'
import { get as getSprite } from '../sprites.js'
import { resolve as resolvePath } from '../paths.js'

export default function sprite(ctx, root, path) {
  ctx.save()

  transformContext(ctx, root, path)

  const node = resolvePath(path, root)

  if (node && node.sprite?.sheet) {
    const img = getSprite(node.sprite.sheet)
    ctx.drawImage(img, -img.width / 2, -img.height / 2)
  }

  ctx.restore()
}
