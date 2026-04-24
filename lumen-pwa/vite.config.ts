import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // Don't register a service worker — keeps the manifest (installable PWA)
      // but removes the SW reload behavior that was interrupting sessions.
      injectRegister: null,
      strategies: 'generateSW',
      manifest: {
        name: 'Lumen',
        short_name: 'Lumen',
        description: 'Your self-hosted AI assistant',
        theme_color: '#080810',
        background_color: '#080810',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icons/192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
    }),
  ],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://10.0.0.22:7747', changeOrigin: true }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  }
})
