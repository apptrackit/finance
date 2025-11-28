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
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  }
})
