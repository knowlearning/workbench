<script setup>
  import { reactive } from 'vue'
  import execute from './execute.js'

  const { id } = defineProps({ id: String })

  const state = reactive(await Agent.state(`run-state/${id}`))

  async function increment() {
    const update = await execute(
      JSON.parse(JSON.stringify(state)),
      `
        if (!context.count) context.count = 0
        context.count += 1
      `
    )
    Object.assign(state, update)
  }
</script>

<template>
  <div>
    {{ state.count }}
    <button @click="increment">++</button>
  </div>
</template>

<style scoped>
</style>