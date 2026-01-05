import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  let apiDomain = env.VITE_API_DOMAIN || 'localhost:8787'
  
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
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'vite.svg'],
        manifest: {
          name: 'Finance App',
          short_name: 'Finance',
          description: 'Personal finance management application',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            {
              src: '/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable'
            },
            {
              src: '/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/api\..*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 60 * 60 * 24 // 24 hours
                },
                cacheableResponse: {
                  statuses: [0, 200]
                }
              }
            }
          ]
        },
        devOptions: {
          enabled: true
        }
      })
    ],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true, // Let the proxy handle origin properly
          rewrite: (path) => path.replace(/^\/api/, ''),
          configure: (proxy, _options) => {
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
