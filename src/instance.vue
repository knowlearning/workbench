<script setup>
  import useScreen from './composables/screen.js'
  import Button from './button.vue'
  import { vueScopeComponent } from '@knowlearning/agents/vue.js'

  const { width, height } = useScreen()

  defineProps({
    id: String,
    instance: Object,
    index: Number,
    focused: Number
  })

  const emit = defineEmits(['remove', 'bringToTop'])

  const handleResize = (corner, dx, dy, instance) => {
    if (corner.includes('right')) {
      const lastWidth = instance.width
      instance.width = parseInt(Math.max(Math.min(instance.width + dx, width.value - instance.x), 192))
      if (instance.width !== lastWidth + dx) {
        instance.x = parseInt(Math.min(Math.max(instance.x + instance.width - lastWidth + dx, 0), width.value - instance.width))
      }
    }
    if (corner.includes('left')) {
      const lastWidth = instance.width
      instance.width = parseInt(Math.max(Math.min(instance.width - dx, instance.x + instance.width), 192))
      instance.x = parseInt(Math.min(Math.max(instance.x + dx, 0), width.value-instance.width))
    }
    if (corner.includes('bottom')) {
      const lastHeight = instance.height
      instance.height = parseInt(Math.max(Math.min(instance.height + dy, height.value - instance.y), 192))
      if (instance.height !== lastHeight + dy) {
        instance.y = parseInt(Math.min(Math.max(instance.y + instance.height - lastHeight + dy, 0), height.value - instance.height))
      }
    }
    if (corner.includes('top')) {
      const lastHeight = instance.height
      instance.height = parseInt(Math.max(Math.min(instance.height - dy, instance.y + instance.height), 192))
      instance.y = parseInt(Math.min(Math.max(instance.y + dy, 0), height.value-instance.height))
    }
  }

</script>

<template>
  <div
    class="instance-wrapper fade-in"
    :style="{
      left: `${instance.x}px`,
      top: `${instance.y}px`,
      width: `${instance.width}px`,
      height: `${instance.height}px`,
      zIndex: instance.layer
    }"
    @mousedown="emit('bringToTop', { id, index })"
    @touchstart="emit('bringToTop', { id, index })"
  >
    <div
      class="instance-header"
      v-drag
      @drag="({ detail: {dx, dy} }) => {
        instance.x = parseInt(Math.max(Math.min(instance.x + dx, width - instance.width), 0))
        instance.y = parseInt(Math.max(Math.min(instance.y + dy, height - instance.height), 0))
      }"
    >
      <Button
        icon="fa-solid fa-xmark"
        @click="emit('remove', { id, index })"
        @mousedown.stop
        @touchstart.stop
      />
      <span class="instance-header-label">
        <vueScopeComponent :id="id" :path="['name']"  />
      </span>
    </div>
    <div class="instance-body">
      <agent-embed
        :id="id"
        @close="emit('remove', { id, index })"
      />
    </div>
    <div
      v-for="edge in [
        'bottom',
        'left',
        'right',
        'top'
      ]"
      :key="edge"
      :class="`instance-body-resizer ${edge}`"
      v-drag
      @drag="({ detail: { dx, dy } }) => handleResize(edge, dx, dy, instance)"
    />
    <div
      v-for="corner in [
        ['bottom','right'],
        ['bottom','left'],
        ['top','right'],
        ['top','left']
      ]"
      :key="corner"
      :class="`instance-body-resizer ${corner.join(' ')}`"
      v-drag
      @drag="({ detail: { dx, dy } }) => handleResize(corner, dx, dy, instance)"
    />
  </div>
</template>

<style scoped>
  
  .instance-wrapper {
    position: absolute;
    display: flex;
    flex-direction: column;
    background: white;
    border-radius: 4px;
    box-shadow: rgba(0, 0, 0, 0.16) 0px 10px 36px 0px, rgba(0, 0, 0, 0.06) 0px 0px 0px 1px;
  }

  .instance-header {
    background: #EEEEEE;
    padding: 4px;
    cursor: move;
    border-bottom: 1px solid #DDD;
  }

  .instance-header-label {
    padding: 0 1em;
  }

  .instance-body {
    flex-grow: 1;
  }

  .instance-body-resizer {
    position: absolute;
  }

  .instance-body-resizer.top.left,
  .instance-body-resizer.bottom.right {
    width: 16px;
    height: 16px;
    cursor: nwse-resize;
  }

  .instance-body-resizer.top.right,
  .instance-body-resizer.bottom.left {
    width: 16px;
    height: 16px;
    cursor: nesw-resize;
  }

  .instance-body-resizer.bottom {
    cursor: ns-resize;
    width: 100%;
    height: 16px;
    bottom: -14px;
  }
  .instance-body-resizer.top {
    cursor: ns-resize;
    width: 100%;
    height: 16px;
    top: -14px;
  }
  .instance-body-resizer.left {
    cursor: ew-resize;
    height: 100%;
    width: 16px;
    left: -14px;
  }
  .instance-body-resizer.right {
    cursor: ew-resize;
    height: 100%;
    width: 16px;
    right: -14px;
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

</style>
