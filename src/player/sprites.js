import { find as findPaths, resolve as resolvePath } from './paths.js'
import draw from './draw/index.js'
import { isShape, toParentEvent } from './utils.js'


const cache = new Map()

export async function loadAll(state) {
  await Promise.all(
  findPaths(state, isShape)
    .map(async path => {
      const node = resolvePath(path, state)
      if (node.sprite?.definition.sheet) await load(node.sprite.definition.sheet)
    })
  )
}

export async function load(id) {
  if (cache.has(id)) return cache.get(id)

  const url = await Agent.download(id).url()

  const img = new Image()
  img.src = url

  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
  })

  cache.set(id, img)
  return img
}

export function get(id) {
  if (!cache.has(id)) throw new Error(`Sprite with id "${id}" has not been loaded`)
  return cache.get(id)
}