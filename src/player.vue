<script setup>
  import { reactive } from 'vue'
  import SpriteRenderer from './sprites/renderer.vue'

  const props = defineProps({ id: String })
  const state = reactive(await Agent.state(props.id))

  const report = event => console.log(event)
</script>
<template>
  <SpriteRenderer
    :sprite="state"
    @event="report"
  />
</template>