import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 8888,
  },
  build: {
    target: 'esnext'
  },
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: tag => tag === 'agent-embed'
        }
      }
    }),
    basicSsl()
  ],
  resolve: {
    alias: [
      {
        find: '@knowlearning/editor',
        replacement: __dirname + '/../platform/packages/editor'
      },
      {
        find: 'fast-json-patch',
        replacement: __dirname + '/node_modules/fast-json-patch/index.mjs'
      },
    ]
  }
})
