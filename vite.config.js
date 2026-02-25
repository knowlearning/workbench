import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'
import wasm from 'vite-plugin-wasm'
import { execSync } from 'node:child_process'
import gitHash from './vite-plugin-git-hash.js'

const GIT_HASH = execSync('git rev-parse --short HEAD').toString().trim()

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
    basicSsl(),
    gitHash({
      envKey: 'GIT_HASH',
      htmlToken: '%GIT_HASH%',
      insertMeta: true,
      metaName: 'git-hash'
    })
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
