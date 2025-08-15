<script setup>
  import { reactive } from 'vue'
  import execute from './execute.js'

  const { id } = defineProps({ id: String })

  const state = reactive(await Agent.state(`run-state/${id}`))

  if (!state.initialized) {
    state.current = JSON.parse(JSON.stringify(await Agent.state(id)))
    state.initialized = true
  }
</script>

<template>
  <pre>{{id}} {{ state }}</pre>
</template>

<style scoped>
</style>