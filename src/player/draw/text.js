import { resolve as resolvePath } from '../paths.js'
import { transformContext } from '../utils.js'

export default function drawText(ctx, root, path) {
  ctx.save()
  transformContext(ctx, root, path)

  const node = resolvePath(path, root)

  if (node && node.text && node.text.value) {
    const {
      value,
      font = "16px sans-serif",
      fillStyle = "black",
      strokeStyle = null,
      lineWidth = 1,
      align = "center",
      baseline = "middle",
      offset = [0, 0]
    } = node.text

    ctx.font = font
    ctx.fillStyle = fillStyle
    ctx.textAlign = align
    ctx.textBaseline = baseline

    const [ox, oy] = offset

    if (strokeStyle) {
      ctx.strokeStyle = strokeStyle
      ctx.lineWidth = lineWidth
      ctx.strokeText(value, ox, oy)
    }

    ctx.fillText(value, ox, oy)
  }

  ctx.restore()
}
