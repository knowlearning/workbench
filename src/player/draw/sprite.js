import { transformContext } from '../utils.js'
import { get as getSprite } from '../sprites.js'
import { resolve as resolvePath } from '../paths.js'

export default function sprite(ctx, root, path) {
  ctx.save()
  transformContext(ctx, root, path)

  const node = resolvePath(path, root)

  if (node && node.sprite?.sheet) {
    const img = getSprite(node.sprite.sheet)
    const { state: stateName, states } = node.sprite

    const state = states?.[stateName]

    if (!state) {
      // TODO: show error sprite
      ctx.drawImage(img, -img.width / 2, -img.height / 2)
      ctx.restore()
      return
    }

    // figure out which frame we’re on
    const now = performance.now() / 1000 // seconds
    const frameCount = state.frames?.length ?? (state.end - state.start + 1)
    let frameIndex = Math.floor(now * state.fps)

    if (state.loop) {
      frameIndex = frameIndex % frameCount
    } else {
      frameIndex = Math.min(frameIndex, frameCount - 1)
    }

    let sx, sy, sw, sh
    if (state.frames && state.frames.length > 0) {
      // explicit frame list
      ;[sx, sy, sw, sh] = state.frames[frameIndex]
    } else {
      // row + start/end
      const frameW = img.width / (state.end + 1)
      const frameH = img.height / Object.keys(states).length // crude row splitting
      sx = state.start * frameW
      sy = state.row * frameH
      sw = frameW
      sh = frameH
    }

    // center it at node position
    ctx.drawImage(img, sx, sy, sw, sh, -sw / 2, -sh / 2, sw, sh)
  }

  ctx.restore()
}
