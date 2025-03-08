<script setup>
  import { reactive, ref } from 'vue'
  import { useKeyboardEvents } from './composables/keyboard.js'

  const { registerKey } = useKeyboardEvents()
  const props = defineProps({ uuid: String })

  registerKey('Escape', () => Agent.close())

  const content = ref(null)
  const state = reactive(await Agent.state(`run-state/${props.uuid}`))

  Agent.watch(props.uuid, update => content.value = update.state)
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