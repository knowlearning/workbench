const queue = []
let busy = false

self.onmessage = ({ data }) => {
  queue.push(data)
  processQueue()
}

async function processQueue() {
  if (busy || queue.length === 0) return
  busy = true

  const { jobId, context, code } = queue.shift()

  try {
    const copy = structuredClone(context)
    const fn = new Function(Object.keys(context), `"use strict"; ${code}`)
    await fn(...Object.values(copy))
    self.postMessage({ jobId, result: structuredClone(copy) })
  } catch (err) {
    self.postMessage({ jobId, error: String(err) })
  } finally {
    busy = false
    processQueue()
  }
}
