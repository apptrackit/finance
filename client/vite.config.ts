import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

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
    plugins: [react()],
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
