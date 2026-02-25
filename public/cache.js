self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', event => {
  if (event.request.mode !== 'navigate') return

  event.respondWith((async () => {
    const cache = await caches.open('html-cache')
    const cached = await cache.match(event.request)

    const networkPromise = fetch(event.request).then(async response => {
      const text = await response.clone().text()

      const match = text.match(/name="git-hash" content="([^"]+)"/)
      const newBuildId = match?.[1]

      if (cached) {
        const cachedText = await cached.clone().text()
        const cachedMatch =
          cachedText.match(/name="git-hash" content="([^"]+)"/)
        const oldBuildId = cachedMatch?.[1]

        if (newBuildId && oldBuildId && newBuildId !== oldBuildId) {
          const clients = await self.clients.matchAll({ type: 'window' })
          for (const client of clients) {
            client.postMessage({ type: 'NEW_VERSION' })
          }
        }
      }

      cache.put(event.request, response.clone())
      return response
    }).catch(() => cached)

    return cached || networkPromise
  })())
})