import { StrictMode } from 'react'
import { MotionConfig } from 'framer-motion'
import { createRoot } from 'react-dom/client'
import '@fontsource/press-start-2p/latin-400.css'
import './styles.css'
import './expectations.css'
import App from './App'
import { applyFontScale, watchFontScale } from './lib/fontScale'

// 线上排查用：让用户报错时可以直接报出构建版本与运行环境
console.info(
  `[BIBU] build ${__BIBU_BUILD__.commit} · ${__BIBU_BUILD__.builtAt} · ${__BIBU_BUILD__.mode}`,
)
console.info('[BIBU] ua', navigator.userAgent)
console.info('[BIBU] system font scale', applyFontScale())
watchFontScale()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
)

import './home.css'
import './fontscale.css'
import './hierarchy.css'

// 新版发布后旧分片会被清理，按需加载的页面会取不到文件。
// 此时整页刷新一次取回最新入口；60 秒内只重试一次，避免弱网下反复刷新。
const CHUNK_RELOAD_KEY = 'bibu-chunk-reload'
window.addEventListener('vite:preloadError', (event) => {
  const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
  if (Date.now() - last < 60_000) return
  event.preventDefault()
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  window.location.reload()
})

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.warn('离线页面缓存初始化失败', error)
    })
  })
}
