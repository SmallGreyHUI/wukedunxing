import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiProxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8001'

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.split(path.sep).join('/')

            if (!normalizedId.includes('node_modules')) {
              return
            }

            if (normalizedId.includes('@element-plus/icons-vue')) {
              return 'element-plus-icons'
            }

            if (normalizedId.includes('element-plus')) {
              return 'element-plus'
            }

            if (normalizedId.includes('html2canvas')) {
              return 'html2canvas'
            }

            if (normalizedId.includes('jspdf')) {
              return 'jspdf'
            }

            if (
              normalizedId.includes('/vue/') ||
              normalizedId.includes('/pinia/') ||
              normalizedId.includes('/vue-router/')
            ) {
              return 'vue-core'
            }

            return 'vendor'
          }
        }
      }
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      cors: true,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true
        },
        '/mcp': {
          target: apiProxyTarget,
          changeOrigin: true
        }
      }
    },
    preview: {
      host: '0.0.0.0',
      port: 4173
    }
  }
})
