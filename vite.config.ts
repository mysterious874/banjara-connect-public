import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const moduleId = id.replace(/\\/g, '/')
          if (moduleId.includes('/node_modules/react/') || moduleId.includes('/node_modules/react-dom/') || moduleId.includes('/node_modules/scheduler/')) return 'react-vendor'
          if (moduleId.includes('/node_modules/react-router') || moduleId.includes('/node_modules/@remix-run/router/')) return 'router-vendor'
          if (moduleId.includes('/node_modules/@supabase/')) return 'supabase-vendor'
          if (moduleId.includes('/node_modules/lucide-react/')) return 'icons-vendor'
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: 'auto',
      includeAssets: [
        'banjara-mark.svg',
        'banjara-mark-maskable.svg',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-192x192-maskable.png',
        'pwa-512x512-maskable.png',
      ],
      manifest: {
        id: '/',
        name: 'Connect',
        short_name: 'Connect',
        description: 'Connect brings people, community, and culture together.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#C4163A',
        background_color: '#FFF7E8',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-192x192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/pwa-512x512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/banjara-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/banjara-mark-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
