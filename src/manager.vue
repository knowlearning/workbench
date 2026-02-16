<script setup>
  import { ref, reactive, computed, watch } from 'vue'
  import Button from './button.vue'
  import Editor from '@knowlearning/editor/editor.vue'
  import Instance from './instance.vue'
  import SidebarContent from './sidebar-content.vue'
  import TestWidget from './test-widget.vue'
  import { resolve as resolvePath } from './player/paths.js'
  import Player from './player.vue'

  const ui = reactive(await Agent.state('ui'))
  const content = reactive(await Agent.state('content'))
  const draggingSidebar = ref(false)
  const draggingPlayer = ref(false)

  ui.editingName = false
  if (ui.sidebarWidth === undefined) ui.sidebarWidth = 300
  if (ui.playerWidth === undefined) ui.playerWidth = 300

  const orderedContent = computed(() => (
    Object
      .entries(content)
      .sort((a, b) => a[1].displayIndex - b[1].displayIndex)
  ))

  const instances = computed(() => {
    const players = []
    Object
      .entries(content)
      .forEach(([id, { instances }]) => {
        instances
          .forEach((instance, index) => {
            players.push({ id, instance, index })
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

    const state = await Agent.state(uuid)
    state.name = 'New Content'

    Object
      .values(content)
      .forEach(v => v.displayIndex += 1)

    content[uuid] = {
      displayIndex: 0,
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

  function deleteContent(uuid) {
    delete content[uuid]
  }

  function dragSidebar({ detail: { dx } }) {
    ui.sidebarWidth = Math.max(0, ui.sidebarWidth + dx)
  }

  function dragPlayer({ detail: { dx } }) {
    console.log('DRAGGING PLAYER?', dx)
    ui.playerWidth = Math.max(0, ui.playerWidth + dx)
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

  let currentState
  let unwatchLastCurrentState = () => {}

  watch(
    () => activeContent.value,
    id => {
      unwatchLastCurrentState()
      if (id) {
        unwatchLastCurrentState = (
          Agent.watch(id, u => currentState = u.state)
        )
      }
    },
    { immediate: true }
  )

  function resolveLanguage(path) {
    const value = resolvePath(path, currentState)
    if (typeof value === "string" && /^\s*\/\/\s*js/.test(value)) {
      return 'javascript'
    }
  }

  function resolveWidget(path) {
    if (path[0] === 'testBlock') return {
      component: TestWidget,
      props: {}
    }
    return undefined
  }

  function playContent(id) {
    const w = window.open(
      `/${id}`,
      '_blank',
      'toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes,width=800,height=600'
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
          v-for="[uuid, {active}] in orderedVisibleContent"
          :key="uuid"
          :uuid="uuid"
          :active="active"
          @click="selectContent(uuid)"
          @delete="deleteContent(uuid)"
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
          // // TODO: use the following for activeContent specific tools
          // content[activeContent].instances.push({
          //   x: 100,
          //   y: 100,
          //   width: 500,
          //   height: 500,
          //   layer: instances.length
          // })
          playContent(activeContent)
        }"
      />
    </div>
    <div
      id="player"
      :class="{ dragging: draggingPlayer }"
      :style="`
        width: ${ui.playerWidth}px;
        height: 100vh;
        flex-shrink: 0;
        flex-grow: 0;
        position: relative;
      `"
    >
      <Player
        :key="activeContent"
        :id="activeContent"
      />
      <div
        :style="`
          width: 16px;
          height: 100vh;
          position: absolute;
          right: -8px;
          background: rgba(255, 0, 0, 0);
          z-index: 1000000;
          top: 0;
          cursor: ew-resize;
        `"
        v-drag
        @dragstart="draggingPlayer = true"
        @drag="dragPlayer"
        @dragend="draggingPlayer = false"
      />
    </div>
    <div id="content">
      <Editor
        v-if="activeContent"
        :key="activeContent"
        :id="activeContent"
        :resolveLanguage="resolveLanguage"
        :resolveWidget="resolveWidget"
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
