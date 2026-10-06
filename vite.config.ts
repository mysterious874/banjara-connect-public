import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['banjara-mark.svg', 'banjara-mark-maskable.svg'],
      manifest: {
        id: '/',
        name: 'Banjara Connect',
        short_name: 'Banjara Connect',
        description: 'Banjara Connect brings community stories, culture, and conversations together.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: '#7A263A',
        background_color: '#FAF5EA',
        icons: [
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
