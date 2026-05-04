import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrivacyProvider } from './context/PrivacyContext.tsx'
import { AlertProvider } from './context/AlertContext.tsx'
import { ThemeProvider } from './context/ThemeContext.tsx'
import { registerSW } from 'virtual:pwa-register'

// Register service worker with update handling
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm('New version available! Reload to update?')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.log('App is ready to work offline')
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <PrivacyProvider>
        <AlertProvider>
          <App />
        </AlertProvider>
      </PrivacyProvider>
    </ThemeProvider>
  </StrictMode>,
)
