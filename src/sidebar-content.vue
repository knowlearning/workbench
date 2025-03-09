<script setup>
  import { reactive, ref } from 'vue'
  import { vueScopeComponent } from '@knowlearning/agents/vue.js'
  import Button from './button.vue'

  defineEmits(['delete'])

  const props = defineProps({
    uuid: String,
    active: Boolean
  })

  const content = reactive({
    state: await Agent.state(props.uuid)
  })

  Agent.watch(props.uuid, async () => content.state = await Agent.state(props.uuid))

  const editingName = ref(false)

</script>


<template>
  <div
    :class="{
      'sidebar-content': true,
      active
    }"
  >
    <div class="sidebar-content-inner">
      <div class="sidebar-content-name">
        <span v-if="editingName">
          <Button
            icon="fa-solid fa-xmark"
            @mousedown="emit('delete')"
          /> <input
            type="text"
            ref="nameInput"
            v-focus
            @keypress.enter="editingName = false"
            @blur="editingName = false"
            v-model="content.state.name"
          />
        </span>
        <span v-else>
          {{ content.state.name }}
        </span>
      </div>
      <div v-if="active">
        <Button
          icon="fa-solid fa-ellipsis"
          @mousedown="editingName = true"
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
