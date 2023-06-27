<template>
  <Splitpanes class="default-theme">
    <Pane>
      <input v-model="content" />
      <h1>Watching</h1>
      <pre>{{ watching }}</pre>
      <h1>Mutating</h1>
      <pre>{{ mutating }}</pre>
    </Pane>
    <Pane>
      <vueContentComponent
        :key="content"
        :id="content"
        @mutate="handleMutation"
        @state="handleState"
      />
    </Pane>
  </Splitpanes>
</template>

<script>
  import { vueContentComponent } from '@knowlearning/agents'
  import { Splitpanes, Pane } from 'splitpanes'
  import 'splitpanes/dist/splitpanes.css'

  export default {
    components: {
      Splitpanes,
      Pane,
      vueContentComponent
    },
    data() {
      return {
        content: '4dabbd91-676c-4a0e-bcf1-7bf02a32cd5d',
        mutating: {},
        watching: []
      }
    },
    created() {
      this.mutating = {}
      this.watching = []
    },
    watch: {
      content() {
        this.mutating = {}
        this.watching = {}
      }
    },
    methods: {
      handleMutation({ scope }) {
        this.mutating[scope] = Date.now()
      },
      handleState({ scope, user, domain }) {
        this.watching.push({ domain, scope, user, timestamp: Date.now() })
      }
    }
  }
</script>

<style scoped>
</style>
