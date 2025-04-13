<script setup>
  import { reactive, ref } from 'vue'
  import { vueScopeComponent } from '@knowlearning/agents/vue.js'
  import Button from './button.vue'

  const emit = defineEmits(['delete'])

  const props = defineProps({
    uuid: String,
    active: Boolean
  })

  const onDragStart = event => {
    event.dataTransfer.setData('text/plain', props.uuid)
    event.dataTransfer.effectAllowed = 'move'
  }

</script>

<template>
  <div
    :class="{
      'sidebar-content': true,
      active
    }"
  >
    <div class="sidebar-content-inner">
      <div
        class="sidebar-content-name"
        draggable="true"
        @dragstart="onDragStart"
      >
        <vueScopeComponent
          :id="props.uuid"
          :path="['name']"
        />
      </div>
      <div v-if="active">
        <Button
          icon="fa-solid fa-xmark"
          @click.stop="emit('delete')"
        />
      </div>
    </div>
  </div>
</template>

<style>
  .sidebar-content.active {
    background: #888888;
  }

  .sidebar-content {
    padding: 0 1em;
    cursor: pointer;
  }

  .sidebar-content-inner {
    display: flex;
    align-items: center;
    height: 40px;
  }

  .sidebar-content-name {
    flex-grow: 1;
  }
</style>
