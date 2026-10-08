import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: 'auto',
      includeAssets: ['banjara-mark.svg', 'banjara-mark-maskable.svg'],
      manifest: {
        id: '/',
        name: 'Connect',
        short_name: 'Connect',
        description: 'Connect brings people, community, and culture together.',
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
