import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/public-sans'
import '@fontsource-variable/bricolage-grotesque'
import './styles/app.css'
import { App } from './App'
import { applyTheme, readTheme } from './theme'
import { keepCurrent } from './freshness'
import { installDebug } from './debug'
import { Crash } from './ui/Crash'
import { DEMO_ONLY } from './site'

applyTheme(readTheme())
installDebug()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Crash>
      <App />
    </Crash>
  </StrictMode>,
)

// After an update, a long-open app reloads instead of failing (src/freshness.ts).
if (import.meta.env.PROD) keepCurrent()

// Installable app and a friendly page when offline (src/service-worker.js). Only for the built
// app: in development it would get between the code and the browser.
if (import.meta.env.PROD && !DEMO_ONLY && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
