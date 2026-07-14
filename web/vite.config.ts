import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'notify-sw.js'],
      // Keep Workbox's generated precaching, but pull in our notification/push handlers
      // (notificationclick routing + a Phase-2 web-push receiver) via importScripts.
      workbox: {
        importScripts: ['notify-sw.js'],
        // Precache the self-hosted font too (woff2 isn't in Workbox's default glob) so the
        // Archivo display face renders offline instead of falling back to system text.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // R2 receipt/photo images: cache what's been viewed so it still renders offline within
        // the signed-URL window. Cross-origin <img> fetches are opaque (status 0).
        runtimeCaching: [
          {
            urlPattern: /\.r2\.cloudflarestorage\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'r2-media',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      manifest: {
        name: 'HomeBuild Pro',
        short_name: 'HomeBuild',
        description: 'Construction project budget, expenses, and photo tracker',
        theme_color: '#f6f4ef',
        background_color: '#f6f4ef',
        display: 'standalone',
        id: '/',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Long-press app-icon shortcuts to the highest-frequency field actions.
        shortcuts: [
          { name: 'Add expense', short_name: 'Expense', url: '/expenses', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Cash flow', short_name: 'Cash flow', url: '/cashflow', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Receipts', short_name: 'Receipts', url: '/receipts', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
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
          if (/[\\/]node_modules[\\/]@supabase[\\/]/.test(id)) return 'supabase-vendor'
          if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return 'query-vendor'
          if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) return 'icons-vendor'
          if (
            /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)
          )
            return 'react-vendor'
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
