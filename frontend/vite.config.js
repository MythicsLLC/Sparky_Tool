import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // loadEnv reads all .env files for the current mode.
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
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Three.js and 3D rendering — loaded only on the Admin/SystemAnalytics tab
            if (id.includes('node_modules/three') || id.includes('node_modules/@react-three')) {
              return 'vendor-three'
            }
            // MUI X heavy add-ons (charts + data-grid) — tree-shaken separately
            if (id.includes('node_modules/@mui/x-charts') || id.includes('node_modules/@mui/x-data-grid')) {
              return 'vendor-mui-x'
            }
            // MUI core + emotion — stable, rarely changes
            if (id.includes('node_modules/@mui') || id.includes('node_modules/@emotion')) {
              return 'vendor-mui'
            }
            // Clerk auth SDK
            if (id.includes('node_modules/@clerk')) {
              return 'vendor-clerk'
            }
            // PDF/export utilities — jspdf, html2canvas, @tanstack/react-table
            if (
              id.includes('node_modules/jspdf') ||
              id.includes('node_modules/html2canvas') ||
              id.includes('node_modules/@tanstack')
            ) {
              return 'vendor-export'
            }
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