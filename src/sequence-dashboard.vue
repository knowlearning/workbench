<script setup>
  const props = defineProps({ id: String })
  const emit = defineEmits('exit')
</script>

<template>
  <div class="dashboard">
  	<button @click="emit('exit')">x</button>
    {{ id }}
  </div>
</template>

<style scoped>
</style>
