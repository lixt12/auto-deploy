import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: 'src/frontend',
  base: './',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      external: ['electron'],
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (id.includes('react') || id.includes('scheduler') || id.includes('react-router')) {
            return 'react-vendor';
          }
          if (id.includes('antd') || id.includes('@ant-design')) {
            return 'antd-vendor';
          }
          if (id.includes('dayjs')) {
            return 'dayjs-vendor';
          }
          return 'vendor';
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8088',
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/frontend', import.meta.url)),
      '@backend': fileURLToPath(new URL('./src/backend', import.meta.url))
    }
  },
  define: {
    'process.env': {},
    global: 'globalThis'
  }
})
