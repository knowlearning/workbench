<script setup>
  import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

  defineProps({
    icon: String,
    pressed: Boolean
  })

</script>

<template>
  <button :class="{ pressed }">
    <FontAwesomeIcon
      :icon="icon"
    />
  </button>
</template>

<style scoped>
  .pressed {
    background-color: #0056b3;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
  }
</style>