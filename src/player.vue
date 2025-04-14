<script setup>
  import { watch, reactive, ref, onUnmounted } from 'vue'
  import { useKeyboardEvents } from './composables/keyboard.js'
  import SequenceDashboard from './sequence-dashboard.vue'

  const { registerKey } = useKeyboardEvents()
  const props = defineProps({ uuid: String })

  registerKey('Escape', () => Agent.close())

  const content = reactive(await Agent.state(props.uuid))
  const state = reactive(await Agent.state(`run-state/${props.uuid}`))

  if (state.active === undefined) state.active = 0

  let unwatch
  let currentContentId
  watch(() => state.active, () => {
    if (currentContentId) {
      unwatch()
      const runStateId = `run-state/${currentContentId}`
      const object = currentContentId
      Agent
        .state(runStateId)
        .then(s => {
          const verb = 'http://adlnet.gov/expapi/verbs/suspended'
          s.xapi = { verb, object }
        })
    }
    currentContentId = content.items[state.active]
    if (currentContentId) {
      const runStateId = `run-state/${currentContentId}`
      const object = currentContentId
      unwatch = Agent.watch(runStateId, async ({ state: { xapi }, patch }) => {
        if (!patch) { // not patch means first state
          const verb = `http://adlnet.gov/expapi/verbs/${xapi ? 'resumed' : 'initialized'}`
          const s = await Agent.state(runStateId)
          s.xapi = { verb, object }
        }
        //  TODO: run checks for progressed, submitted, and completed
      })
    }
  })

  onUnmounted(() => unwatch?.())

  async function submit() {
    const object = currentContentId
    const s = await Agent.state(`run-state/${currentContentId}`)
    const verb = 'http://adlnet.gov/expapi/verbs/submitted'
    s.xapi = {
      verb,
      object,
      result: {
        success: true,
        completion: true
      }
    }
  }

</script>

<template>
  <SequenceDashboard
    v-if="state.showDashboard"
    :id="uuid"
    @exit="state.showDashboard = false"
  />
  <div
    id="player"
    v-else
  >
    <div id="header">
      <button
        v-for="id, index in content.items"
        :key="id + index"
        @click="state.active = index"
        :class="{
          selected: index === state.active
        }"
      >
        {{ index }}
      </button>
    </div>
    <div id="content">
      <agent-embed
        :id="content.items[state.active]"
      />
    </div>
    <div id="footer">
      <button @click="submit">submit</button>
      <button @click="state.showDashboard = true">dashboard</button>
    </div>
  </div>
</template>

<style scoped>
  #player {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  #content {
    flex-grow: 1;
  }

  #header {
    background: #EEEEEE;
    text-align: center;
  }

  #footer {
    background: #EEEEEE;
    text-align: center;
  }

  button.selected {
    background: chartreuse;
  }
</style>