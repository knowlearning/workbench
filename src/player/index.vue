<script setup>
  import { reactive, ref, onMounted } from 'vue'
  import { applyPatch } from 'fast-json-patch'
  import { standardJSONPatch } from '@knowlearning/patch-proxy'
  import execute from './execute.js'
  import { load as loadSprite } from './sprites.js'
  import { find as findPaths, resolve as resolvePath } from './paths.js'
  import draw from './draw/index.js'
  import { isShape, isPointInsideShapeWithParents, toParentEvent } from './utils.js'

  const { id } = defineProps({ id: String })

  const canvas = ref(null)
  const state = JSON.parse(JSON.stringify(await Agent.state(id)))

  onMounted(async () => {
    const ctx = canvas.value.getContext("2d")
    const dpr = window.devicePixelRatio || 1
    canvas.value.width = 512 * dpr
    canvas.value.height = 512 * dpr
    canvas.value.style.width = "512px"
    canvas.value.style.height = "512px"
    ctx.scale(dpr, dpr)
    await Promise.all(
      findPaths(state, isShape)
        .map(async path => {
          const node = resolvePath(path, state)
          if (node.sprite?.definition.sheet) await loadSprite(node.sprite.definition.sheet)
        })
    )
    draw(canvas.value, state)
    toggleSpriteFrames()
  })

  function toggleSpriteFrames() {
    findPaths(state, isShape)
      .map(path => {
        const node = resolvePath(path, state)
        if (node.sprite?.definition.sheet) {
          const spriteDefinitionState = node.sprite.definition.states[node.sprite.name]
          node.sprite.frame = (node.sprite.frame+1)%spriteDefinitionState.frames.length
        }
      })
    draw(canvas.value, state)
    setTimeout(toggleSpriteFrames, 60)
  }

  let lastInteractionRun = Promise.resolve()
  async function applyInteractionScript(scriptName, event) {
    const { detail: { clientX:x, clientY:y, dx, dy } } = event
    lastInteractionRun = lastInteractionRun.then(async () => {
      const paths = findPaths(state, isShape)

      for (const path of paths) {
        const shape = resolvePath(path, state)
        if (!shape || !shape[scriptName] || !isPointInsideShapeWithParents(path, state, x - dx, y - dy)) continue

        const context = {
          object: JSON.parse(JSON.stringify(shape)),
          event: toParentEvent(path, state, { x, y, dx, dy })
        }

        const { patches } = await execute(context, shape[scriptName])
        for (const patch of patches) applyPatch(shape, standardJSONPatch(patch), false, true)
      }

      if (paths.length) draw(canvas.value, state)
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