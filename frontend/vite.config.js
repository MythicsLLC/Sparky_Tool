import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    base: './',

    plugins: [react()],

    server: {
      host: '0.0.0.0',
      port: Number(process.env.PORT) || 8080,
      strictPort: true,

      cors: true,

      proxy: {
        '/api': {
          target: env.BACKEND_URL || 'http://127.0.0.1:8001',
          changeOrigin: true,
          ws: true,
        },
      },
    },

    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/setupTests.js',
    },
  }
})