<script setup>
  import { ref, reactive, computed } from 'vue'
  import Button from './button.vue'
  import Editor from '@knowlearning/editor/editor.vue'
  import Instance from './instance.vue'
  import SidebarContent from './sidebar-content.vue'

  const ui = reactive(await Agent.state('ui'))
  const content = reactive(await Agent.state('content'))
  const draggingSidebar = ref(false)

  ui.editingName = false
  if (ui.sidebarWidth === undefined) ui.sidebarWidth = 300

  const orderedContent = computed(() => (
    Object
      .entries(content)
      .sort((a, b) => a[1].displayIndex - b[1].displayIndex)
  ))

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

  function bringToTop(id, index) {
    let seenTop = false
    instances.value.forEach(
      (instance, i) => {
        if (!seenTop) {
          if (instance.id === id && instance.index === index) {
            seenTop = true
            instance.instance.layer = instances.value.length
          }
          else if (instance.instance.layer !== i) instance.instance.layer = i
        }
        else if (instance.instance.layer !== i - 1) instance.instance.layer = i - 1
      }
    )
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
        <SidebarContent
          v-for="[uuid, {label, active}] in orderedVisibleContent"
          :key="uuid"
          :uuid="uuid"
          :label="label"
          :active="active"
          @click="selectContent(uuid)"
        />
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
            height: 500,
            layer: instances.length
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
  <Instance
    v-for="instance in instances"
    :key="instance.id + instance.index"
    v-bind="instance"
    @remove="({ id, index }) => removeInstance(id, index)"
    @bringToTop="({ id, index }) => bringToTop(id, index)"
  />
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

</style>
