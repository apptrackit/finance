import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrivacyProvider } from './context/PrivacyContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivacyProvider>
      <App />
    </PrivacyProvider>
  </StrictMode>,
)
