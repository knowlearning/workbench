<script setup>
  import { ref, reactive, computed } from 'vue'
  import { vueEmbedComponent } from '@knowlearning/agents/vue.js'
  import Button from './button.vue'

  const content = reactive(await Agent.state('content'))
  const sidebarWidth = ref(300)
  const editingName = ref(false)
  const playing = ref(false)

  const orderedContent = computed(() => {
    return (
      Object
        .entries(content)
        .sort((
          [_1, { displayIndex: a }],
          [_2, { displayIndex: b }]
        ) => a - b)
    )
  })

  const orderedVisibleContent = computed(() => orderedContent.value.filter(([_, { deleted }]) => !deleted))

  const activeContent = computed(() => {
    const active = Object.entries(content).find(([id, {active}]) => active)
    return active ? active[0] : null
  })

  function deactivateActive() {
    const uuid = activeContent.value
    if (uuid) content[uuid].active = false
  }

  async function createNewContent() {
    const uuid = Agent.uuid()
    deactivateActive()

    Object
      .values(content)
      .forEach(v => v.displayIndex += 1)

    content[uuid] = {
      displayIndex: 0,
      label: 'New Content',
      active: true
    }
  }

  async function selectContent(uuid) {
    Object
      .values(content)
      .forEach(v => {
        if (v.active) v.active = false
      })

    content[uuid].active = true
  }
</script>

<template>
  <div id="main">
    <div
      id="sidebar"
      :style="`
        width: ${sidebarWidth}px;
      `"
    >
      <div id="sidebar-header">
        <Button
          icon="fa-solid fa-pencil"
          @click="createNewContent"
        />
      </div>
      <div id="sidebar-body">
        <div
          v-for="[uuid, {label, active}] in orderedVisibleContent"
          :key="uuid"
          :class="{
            'sidebar-content': true,
            active
          }"
          @click="selectContent(uuid)"
        >
          <div class="sidebar-content-inner">
            <div class="sidebar-content-name">
              <span v-if="editingName && active">
                <Button
                  icon="fa-solid fa-xmark"
                  @mousedown="content[uuid].deleted = true"
                /> <input
                  type="text"
                  ref="nameInput"
                  v-focus
                  @keypress.enter="editingName = false"
                  @blur="editingName = false"
                  v-model="content[uuid].label"
                />
              </span>
              <span v-else>
                {{ label }}
              </span>
            </div>
            <div v-if="active">
              <Button
                icon="fa-solid fa-ellipsis"
                @mousedown="editingName = !editingName"
              />
              <Button
                icon="fa-solid fa-play"
                @click="playing = true"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="content">
      <div
        v-if="activeContent"
        :key="activeContent"
        :uuid="activeContent"
      >
        {{ activeContent }}
      </div>
    </div>
  </div>
  <div
    id="mindstorm-player-wrapper"
    class="fade-in"
    v-if="playing"
  >
    <div id="mindstorm-player-controls">
      <Button
        icon="fa-solid fa-xmark"
        @click="playing = false"
      />
    </div>
    <vueEmbedComponent
      :id="activeContent"
      @close="playing = false"
      style="background: black;"
    />
  </div>
</template>

<style scoped>
  #main {
    width: 100%;
    height: 100%;
    overflow: hidden;
    display: flex;
    align-items: stretch;
  }

  #sidebar {
    background: #EEEEEE;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  #content,
  #sidebar-body {
    flex-grow: 1;
    overflow-y: scroll;
  }

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

  .fade-in {
      opacity: 0;
      animation: fadeIn 0.2s ease-in forwards;
  }

  @keyframes fadeIn {
      from {
          opacity: 0;
      }
      to {
          opacity: 1;
      }
  }

  #mindstorm-player-wrapper {
    position: absolute;
    width: 100%;
    height: 100%;
    overflow: hidden;
    top: 0;
    left: 0;
  }

  #mindstorm-player-controls {
    position: absolute;
  }
</style>
