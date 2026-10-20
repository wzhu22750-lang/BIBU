import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/press-start-2p/latin-400.css'
import './admin.css'
import { App } from './App'

console.info(
  `[BIBU Admin] build ${__ADMIN_BUILD__.commit} · ${__ADMIN_BUILD__.builtAt} · ${__ADMIN_BUILD__.mode}`,
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
