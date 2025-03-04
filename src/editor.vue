<script setup>
  import YAMLEditor from '@knowlearning/editor/editor.vue'
  const props = defineProps({ uuid: String })

</script>

<template>
  <YAMLEditor
    :key="domain"
    :id="`configuration/${domain}`"
    :resolveLanguage="path => {
      if (path[path.length-1] === 'markdown') return 'markdown'
      if (arrayMatch(['postgres', 'queries', '*', 'body'], path)) return 'postgresql'
      else if (arrayMatch(['agent'], path)) return 'javascript'
    }"
    :resolveWidget="resolveWidget"
  />
</template>