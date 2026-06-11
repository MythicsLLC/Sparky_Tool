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
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // Split heavy vendor libraries into separate chunks so the
            // main bundle stays small and these chunks are cached independently.
            // Note: @clerk/clerk-react is intentionally bundled with MUI to
            // avoid a circular dependency (Clerk internally imports MUI).
            'vendor-react':    ['react', 'react-dom'],
            'vendor-mui':      ['@mui/material', '@mui/icons-material', '@mui/x-data-grid', '@clerk/clerk-react'],
            'vendor-charts':   ['recharts'],
            'vendor-pdf':      ['jspdf', 'html2canvas'],
          },
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