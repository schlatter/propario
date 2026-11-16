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
