import { onMounted, onUnmounted, ref } from 'vue'

export function useAnimationLoop() {
  const animationCallbacks = ref([])
  let animationFrameId = null

  const animationLoop = (timestamp) => {
    animationCallbacks.value.forEach(callback => callback(timestamp))
    animationFrameId = requestAnimationFrame(animationLoop)
  }

  onMounted(() => {
    animationFrameId = requestAnimationFrame(animationLoop)
  })

  onUnmounted(() => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId)
  })

  const registerAnimationCallback = (callback) => {
    animationCallbacks.value.push(callback)
  }

  const unregisterAnimationCallback = (callback) => {
    animationCallbacks.value = animationCallbacks.value.filter(cb => cb !== callback)
  }

  return {
    registerAnimationCallback,
    unregisterAnimationCallback
  }
}
