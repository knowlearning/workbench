<script setup>
  import { ref, reactive, computed } from 'vue'
  import { vueEmbedComponent } from '@knowlearning/agents/vue.js'
  import Button from './button.vue'
  import Editor from '@knowlearning/editor/editor.vue'

  const ui = reactive(await Agent.state('ui'))
  const content = reactive(await Agent.state('content'))
  const draggingSidebar = ref(false)

  ui.editingName = false
  if (ui.sidebarWidth === undefined) ui.sidebarWidth = 300

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

  const screenWidth = window.innerWidth
  const screenHeight = window.innerHeight

  const instances = computed(() => {
    const players = []
    Object
      .entries(content)
      .forEach(([id, { label, instances }]) => {
        instances
          .forEach((instance, index) => {
            console.log(instance)
            players.push({ id, instance, index, label })
          })
      })
    return players
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
      active: true,
      instances: []
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

  function dragSidebar({ detail: { dx } }) {
    ui.sidebarWidth = Math.max(0, ui.sidebarWidth + dx)
  }

  function removeInstance(id, index) {
    //  TODO: fix persistent splice
    const copy = JSON.parse(JSON.stringify(content[id].instances))
    copy.splice(index, 1)
    content[id].instances = copy
  }
</script>

<template>
  <div id="main">
    <div
      id="sidebar"
      :class="{ dragging: draggingSidebar }"
      :style="`
        width: ${ui.sidebarWidth}px;
        height: 100vh;
        flex-shrink: 0;
        flex-grow: 0;
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
              <span v-if="ui.editingName && active">
                <Button
                  icon="fa-solid fa-xmark"
                  @mousedown="content[uuid].deleted = true"
                /> <input
                  type="text"
                  ref="nameInput"
                  v-focus
                  @keypress.enter="ui.editingName = false"
                  @blur="ui.editingName = false"
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
                @mousedown="ui.editingName = !ui.editingName"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    <div
      id="toolbar"
      style="
        cursor: ew-resize;
        flex-shrink: 0;
        flex-grow: 0;
        background: #F5F5F5;
        border-left: 1px solid #ddd;
        border-right: 1px solid #ddd;
      "
      v-drag
      @dragstart="draggingSidebar = true"
      @drag="dragSidebar"
      @dragend="draggingSidebar = false"
    >
      <Button
        icon="fa-solid fa-bars"
        @click="ui.sidebarWidth = ui.sidebarWidth === 0 ? 300 : 0"
      />
      <br>
      <Button
        icon="fa-solid fa-play"
        @click="() => {
          content[activeContent].instances.push({
            x: 100,
            y: 100,
            width: 500,
            height: 500
          })
        }"
      />
    </div>
    <div id="content">
      <Editor
        v-if="activeContent"
        :key="activeContent"
        :id="activeContent"
        :resolveLanguage="path => {}"
        :resolveWidget="path => {}"
        fill-height
      />
    </div>
  </div>
  <div
    class="instance-wrapper fade-in"
    v-for="{ id, instance, index, label } in instances"
    :key="id + index"
    :style="{
      left: `${instance.x}px`,
      top: `${instance.y}px`,
      width: `${instance.width}px`,
      height: `${instance.height}px`
    }"
  >
    <div
      class="instance-header"
      v-drag
      @drag="({ detail: {dx, dy} }) => {
        instance.x = Math.max(Math.min(instance.x + dx, screenWidth - instance.width), 0)
        instance.y = Math.max(Math.min(instance.y + dy, screenHeight - instance.height), 0)
      }"
    >
      <Button
        icon="fa-solid fa-xmark"
        @click="removeInstance(id, index)"
      />
    </div>
    <div class="instance-body">
      <vueEmbedComponent
        :id="id"
        @close="removeInstance(id, index)"
      />
    </div>
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

  #sidebar:not(.dragging) {
    transition: width 0.2s ease-out;
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

  .instance-wrapper {
    position: absolute;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: white;
    border-radius: 4px;
    box-shadow: rgba(0, 0, 0, 0.16) 0px 10px 36px 0px, rgba(0, 0, 0, 0.06) 0px 0px 0px 1px;
  }

  .instance-header {
    background: #EEEEEE;
  }

  .instance-body {
    flex-grow: 1;
  }

  #mindstorm-player-controls {
    position: absolute;
  }
</style>
