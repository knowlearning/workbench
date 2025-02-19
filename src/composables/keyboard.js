import { onMounted, onUnmounted, ref } from 'vue'

export function useKeyboardEvents() {
  const keyCallbacks = ref({})

  const handleKeyDown = (event) => {
    const callback = keyCallbacks.value[event.key]
    if (callback) {
      callback(event)
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
  })

  const registerKey = (key, callback) => {
    keyCallbacks.value[key] = callback
  }

  const unregisterKey = (key) => {
    delete keyCallbacks.value[key]
  }

  return {
    registerKey,
    unregisterKey,
  }
}
