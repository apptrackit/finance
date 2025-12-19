import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrivacyProvider } from './context/PrivacyContext.tsx'
import { AlertProvider } from './context/AlertContext.tsx'
import { LockedAccountsProvider } from './context/LockedAccountsContext.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrivacyProvider>
      <AlertProvider>
        <LockedAccountsProvider>
          <App />
        </LockedAccountsProvider>
      </AlertProvider>
    </PrivacyProvider>
  </StrictMode>,
)
