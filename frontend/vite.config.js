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
      // Split vendors into separate cacheable chunks so re-deploys only
      // bust the app chunk, not the large stable library chunks.
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Three.js ecosystem — loaded only on the Admin 3D tab (~531 KB)
            if (id.includes('node_modules/three')) return 'vendor-three'
            // MUI core + icons (~778 KB) — largest dep, stable between deploys
            if (id.includes('node_modules/@mui')) return 'vendor-mui'
            // Clerk auth SDK
            if (id.includes('node_modules/@clerk')) return 'vendor-clerk'
            // All other node_modules (React, GSAP, Matter.js, Axios, etc.)
            // Keeping these together avoids Rollup circular-chunk warnings that
            // arise when React is split away from packages that import it.
            if (id.includes('node_modules')) return 'vendor-misc'
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