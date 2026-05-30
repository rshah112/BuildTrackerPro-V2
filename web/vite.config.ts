import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'HomeBuild Pro',
        short_name: 'HomeBuild',
        description: 'Construction project budget, expenses, and photo tracker',
        theme_color: '#c2410c',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        id: '/',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Pin the stable core libs into one long-cached `vendor` chunk so app-code
        // changes don't bust them. Deliberately exclude xlsx/jspdf so they stay in
        // their on-demand (dynamic-import) chunks rather than the eager vendor bundle.
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return
          if (
            /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler|@tanstack|@supabase|lucide-react)[\\/]/.test(
              id,
            )
          )
            return 'vendor'
        },
      },
    },
  },
  test: {
    // Default env is node (fast; most suites render to string or are pure).
    // Interactive component tests opt into jsdom with `// @vitest-environment jsdom`.
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['node_modules', 'dist', 'tests/e2e/**'],
  },
})
