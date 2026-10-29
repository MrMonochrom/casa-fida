import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import { Root } from './Root.tsx'

// Only when the server tracks errors, so Sentry is downloaded only then (see errorTracking.ts).
if (document.querySelector('meta[name="error-tracking"]')) {
  void import('./errorTracking.ts').then((tracking) => tracking.startErrorTracking())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
