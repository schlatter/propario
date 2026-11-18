import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/public-sans'
import '@fontsource-variable/bricolage-grotesque'
import './styles/app.css'
import { App } from './App'
import { applyTheme, readTheme } from './theme'

applyTheme(readTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Installable app and a friendly page when offline (src/service-worker.js). Only for the built
// app: in development it would get between the code and the browser.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
