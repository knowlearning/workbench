<script setup>
  import { reactive } from 'vue'
  import { useKeyboardEvents } from './composables/keyboard.js'

  const { registerKey } = useKeyboardEvents()
  const props = defineProps({ uuid: String })

  registerKey('Escape', () => Agent.close())

  const content = JSON.parse(JSON.stringify(await Agent.state(props.uuid)))
  const state = reactive(await Agent.state(`run-state/${props.uuid}`))
</script>

<template>
  <div id="player">
    {{props.uuid}}
    <pre>{{ content }}</pre>
    <pre>{{ state }}</pre>
  </div>
</template>

<style>
  #player {
    width: 100%;
    height: 100%;
  }
</style>