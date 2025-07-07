const WORKER_JOB_TIMEOUT = 1000

const workers = {}

function jobQueueWorker(queue) {
  if (workers[queue]) return workers[queue]

  const worker = workers[queue] = new Worker(URL.createObjectURL(new Blob([`
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
        const fn = new Function("context", \`"use strict"; \${code}\`)
        await fn(copy)
        self.postMessage({ jobId, result: structuredClone(copy) })
      } catch (err) {
        self.postMessage({ jobId, error: String(err) })
      } finally {
        busy = false
        processQueue()
      }
    }
  `], { type: "application/javascript" })))

  let jobCounter = 0
  const pending = new Map()

  worker.onmessage = ({ data }) => {
    const { jobId, result, error } = data
    const { resolve, reject, timer } = pending.get(jobId) || {}
    clearTimeout(timer)
    pending.delete(jobId)
    if (error) reject(new Error(error))
    else resolve(result)
  }

  worker.run = function(context, code) {
    return new Promise((resolve, reject) => {
      const jobId = ++jobCounter
      const timer = setTimeout(() => {
        pending.delete(jobId)
        reject(new Error("Worker timeout"))
      }, WORKER_JOB_TIMEOUT)

      pending.set(jobId, { resolve, reject, timer })
      worker.postMessage({ jobId, context, code })
    })
  }

  return worker
}

export default function execute(context, script, queue='default') {
  // TODO: more performant proxy handling
  return jobQueueWorker(queue).run(context, script)
}
