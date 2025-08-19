import PatchProxy from '@knowlearning/patch-proxy'

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
    const patches = []
    context.object = new PatchProxy(context.object, patch => patches.push(patch))

    const fn = new Function(Object.keys(context), `"use strict"; ${code}`)
    await fn(...Object.values(context))

    self.postMessage({ jobId, result: { patches } })
  } catch (err) {
    self.postMessage({ jobId, error: String(err) })
  } finally {
    busy = false
    processQueue()
  }
}
