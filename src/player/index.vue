<script setup>
  import { reactive, ref, onMounted } from 'vue'
  import execute from './execute.js'
  import { load as loadSprite } from './sprites.js'
  import { find as findPaths, resolve as resolvePath } from './paths.js'
  import draw from './draw/index.js'
  import { isShape, isPointInsideShapeWithParents, toParentEvent } from './utils.js'

  const { id } = defineProps({ id: String })

  const canvas = ref(null)
  const state = reactive(await Agent.state(`run-state/${id}`))

  if (!state.initialized) {
    state.current = JSON.parse(JSON.stringify(await Agent.state(id)))
    state.initialized = true
  }

  onMounted(async () => {
    const ctx = canvas.value.getContext("2d")
    const dpr = window.devicePixelRatio || 1
    canvas.value.width = 512 * dpr
    canvas.value.height = 512 * dpr
    canvas.value.style.width = "512px"
    canvas.value.style.height = "512px"
    ctx.scale(dpr, dpr)
    await Promise.all(
      findPaths(state.current, isShape)
        .map(async path => {
          const node = resolvePath(path, state.current)
          if (node.sprite?.sheet) await loadSprite(node.sprite.sheet)
        })
    )
    draw(canvas.value, state.current)
  })

  let lastInteractionRun = Promise.resolve()
  async function applyInteractionScript(scriptName, event) {
    const { detail: { clientX:x, clientY:y, dx, dy } } = event
    lastInteractionRun = lastInteractionRun.then(async () => {
      const paths = findPaths(state.current, isShape)

      for (const path of paths) {
        const shape = resolvePath(path, state.current)
        if (!shape || !shape[scriptName] || !isPointInsideShapeWithParents(path, state.current, x - dx, y - dy)) continue

        const context = {
          object: JSON.parse(JSON.stringify(shape)),
          event: toParentEvent(path, state.current, { x, y, dx, dy })
        }

        const result = await execute(context, shape[scriptName])
        //  TODO: apply updates instead of full re-writes
        Object
          .entries(result.object)
          .forEach(([key, value]) => {
            shape[key] = value
          })
      }

      if (paths.length) draw(canvas.value, state.current)
    })
  }

</script>

<template>
  <canvas
    v-drag
    @dragstart="event => applyInteractionScript('touch', event)"
    @drag="event => applyInteractionScript('drag', event)"
    @dragend="event => applyInteractionScript('untouch', event)"
    ref="canvas"
    :width="512"
    :height="512"
    style="border:1px solid #ccc;"
  />
</template>

<style scoped>
</style>