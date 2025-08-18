import { createApp } from 'vue'
import App from './app.vue'
import Manager from './manager.vue'
import Player from './player/index.vue'
import Agent from '@knowlearning/agents'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import { faPencil, faEllipsis, faUpload, faXmark, faGlobe, faPlay, faPause, faAnchor, faBars } from '@fortawesome/free-solid-svg-icons'
import { library } from '@fortawesome/fontawesome-svg-core'
import drag from './directives/drag.js'
import focus from './directives/focus.js'
import hover from './directives/hover.js'

import './agent-embed.js'
import './style.css'

window.Agent = Agent

const id = window.location.pathname.slice(1)

document.addEventListener('gesturestart', e => e.preventDefault())

if (id) {
  createApp(App, { component: Player, props: { id } })
    .directive('focus', focus)
    .directive('drag', drag)
    .directive('hover', hover)
    .mount('#app')
}
else {
  library
    .add(
      faPencil,
      faEllipsis,
      faUpload,
      faXmark,
      faGlobe,
      faPlay,
      faPause,
      faAnchor,
      faBars
    )

  createApp(App, { component: Manager, props: {} })
    .directive('focus', focus)
    .directive('drag', drag)
    .directive('hover', hover)
    .mount('#app')
}
