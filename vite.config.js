import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'
import wasm from 'vite-plugin-wasm';

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    port: 8888,
  },
  build: {
    target: 'esnext'
  },
  optimizeDeps: {
    include: ["debug"]
  },
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: tag => tag === 'agent-embed'
        }
      }
    }),
    wasm(),
    basicSsl()
  ],
  resolve: {
    dedupe: ["debug"],
    alias: [
      {
        find: '@knowlearning/editor',
        replacement: __dirname + '/../../kl/platform/packages/editor'
      },
      {
        find: 'fast-json-patch',
        replacement: __dirname + '/node_modules/fast-json-patch/index.mjs'
      },
    ]
  }
})
