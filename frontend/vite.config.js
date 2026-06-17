import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    base: './',
    plugins: [react()],
    server: {
      cors: true,
      proxy: {
        '/api': {
          target: env.BACKEND_URL || 'http://localhost:8000',
          changeOrigin: true,
          ws: true,
          headers: { 'Access-Control-Allow-Origin': '*' },
        },
      },
    },
    build: {
      // Split large vendor dependencies into separate cacheable chunks.
      // Each chunk is served with a content-hash filename so browsers
      // re-download only the chunk that actually changed.
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react':     ['react', 'react-dom'],
            'vendor-mui-core':  ['@mui/material', '@emotion/react', '@emotion/styled', '@mui/icons-material'],
            'vendor-mui-data':  ['@mui/x-charts', '@mui/x-data-grid'],
            'vendor-clerk':     ['@clerk/clerk-react'],
            'vendor-animation': ['gsap', 'matter-js'],
          },
        },
      },
      chunkSizeWarningLimit: 800,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/setupTests.js',
    },
  }
})