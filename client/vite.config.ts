/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiDomain = env.VITE_API_DOMAIN || 'localhost:8787'
  
  // If apiDomain already includes protocol, use it as-is
  // Otherwise, add http:// for localhost or https:// for remote
  let apiTarget: string
  if (apiDomain.startsWith('http://') || apiDomain.startsWith('https://')) {
    apiTarget = apiDomain
  } else {
    const isLocalhost = apiDomain.includes('localhost')
    apiTarget = isLocalhost ? `http://${apiDomain}` : `https://${apiDomain}`
  }
  
  return {
    test: {
      globals: true,
      // Unit suites use synthetic local configuration, independent of a
      // developer's .env.local pointing at a private production API.
      env: { VITE_API_DOMAIN: 'localhost:8787', VITE_API_AUTH_MODE: 'public' },
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        manifestFilename: 'site.webmanifest',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Finance',
          short_name: 'Finance',
          description: 'Personal finance management application',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          orientation: 'portrait',
          id: '/',
          start_url: '/dashboard',
          scope: '/',
          icons: [
            {
              src: '/web-app-manifest-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable'
            },
            {
              src: '/web-app-manifest-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/api(?:[/?]|$)/, /^\/assets(?:[/?]|$)/, /^\/[^?]*\.[^/?]+(?:\?|$)/],
          // Financial responses and Access sessions must always reach the API.
          // Delete the old API cache during upgrades; never serve ledger data
          // from a persistent cache after an authentication/network failure.
          runtimeCaching: []
        },
        devOptions: {
          enabled: false
        }
      })
    ],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true, // Let the proxy handle origin properly
          rewrite: (path) => path.replace(/^\/api/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq, req) => {
              // Forward the Origin header from the browser
              if (req.headers.origin) {
                proxyReq.setHeader('Origin', req.headers.origin)
              } else {
                proxyReq.setHeader('Origin', 'http://localhost:5173')
              }
            })
          },
        },
      },
    },
  }
})
