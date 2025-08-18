const cache = new Map()

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