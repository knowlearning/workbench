import { transformContext } from '../utils.js'
import { get as getSprite } from '../sprites.js'
import { resolve as resolvePath } from '../paths.js'

export default function sprite(ctx, root, path) {
  ctx.save()
  transformContext(ctx, root, path)

  const node = resolvePath(path, root)

  if (node && node.sprite?.definition.sheet) {
    const img = getSprite(node.sprite.definition.sheet)
    let [sx, sy, sw, sh] = node.sprite.definition.states[node.sprite.state].frames[node.sprite.frame]

    const scale = node.sprite.scale === undefined ? 1 : node.sprite.scale
    const dw = sw * scale
    const dh = sh * scale
    ctx.drawImage(img, sx, sy, sw, sh, -dw / 2, -dh / 2, dw, dh)
  }

  ctx.restore()
}
