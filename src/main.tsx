import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LabProvider } from './state/LabContext'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <LabProvider>
        <App />
      </LabProvider>
    </ErrorBoundary>
  </StrictMode>,
)
