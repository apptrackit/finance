import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiDomain = env.VITE_API_DOMAIN || 'localhost:8787'
  const isLocalhost = apiDomain.includes('localhost')
  const apiTarget = isLocalhost ? `http://${apiDomain}` : `https://${apiDomain}`
  
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: false, // Preserve the original Origin header (http://localhost:5173)
          rewrite: (path) => path.replace(/^\/api/, ''),
          configure: (proxy, _options) => {
            proxy.on('proxyReq', (proxyReq, _req) => {
              // Ensure Origin header is set to localhost:5173
              proxyReq.setHeader('Origin', 'http://localhost:5173')
            })
          },
        },
      },
    },
  }
})
