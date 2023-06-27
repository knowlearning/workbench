<template>
  <Splitpanes class="default-theme">
    <Pane>woo!</Pane>
    <Pane>boo!</Pane>
  </Splitpanes>
</template>

<script>
  import { Splitpanes, Pane } from 'splitpanes'
  import 'splitpanes/dist/splitpanes.css'

  export default {
    components: {
      Splitpanes,
      Pane
    },
    data() {}
  }
</script>

<style scoped>
</style>
