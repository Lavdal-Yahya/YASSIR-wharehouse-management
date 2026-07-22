import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // architecture.md §5: API responses must never be cached.
      // Precache the built app shell only; deny /api navigations.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
      includeAssets: [
        'icon.svg',
        'favicon-32x32.png',
        'apple-touch-icon.png',
      ],
      manifest: {
        name: 'Gestion Entrepôt',
        short_name: 'Entrepôt',
        description:
          'Gestion de l’entrepôt central et des boutiques : stock, ventes, dettes clients.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        lang: 'fr',
        dir: 'ltr',
        background_color: '#F4F4F6',
        theme_color: '#2F3272',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      devOptions: {
        // Off by default — SW gets in the way of HMR; opt in by setting
        // VITE_PWA_DEV=1 in the shell when smoke-testing install locally.
        enabled: process.env.VITE_PWA_DEV === '1',
        type: 'module',
        navigateFallbackAllowlist: [/^(?!\/api).*/],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    // Forward `/api/*` to the Nest dev server. Cookies are same-origin
    // during dev, which mirrors production (Caddy proxies /api → api).
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
});
