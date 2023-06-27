import { createApp } from 'vue'
import { browserAgent, vuePersistentComponent } from '@knowlearning/agents'
import component from './index.vue'
import './index.css'

window.Agent = browserAgent()

createApp(vuePersistentComponent(component)).mount('body')

