import { transformContext } from '../utils.js'
import { get as getSprite } from '../sprites.js'
import { resolve as resolvePath } from '../paths.js'

export default function sprite(ctx, root, path) {
  ctx.save()
  transformContext(ctx, root, path)

  const node = resolvePath(path, root)

  if (node && node.sprite?.definition.sheet) {
    const img = getSprite(node.sprite.definition.sheet)
    let [sx, sy, sw, sh] = node.sprite.definition.states[node.sprite.state.name].frames[node.sprite.state.frame]
    ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh)
  }

  ctx.restore()
}
