// 发布标识由构建插件（vite.config.ts 的 serviceWorkerPrecache）替换为当次构建的 commit。
// 每次上线 sw.js 内容都会变化，浏览器因此更新 SW：预缓存新分片并清掉旧版本缓存。
const RELEASE = '__BIBU_RELEASE__'
const CACHE_NAME = `bibo-shell-${RELEASE}`
const SHELL_URLS = ['/', '/index.html', '/favicon.svg']
const SHELL_PATHS = new Set(SHELL_URLS)

function cacheable(request, url) {
  if (request.method !== 'GET' || url.origin !== self.location.origin) return false
  return (
    SHELL_PATHS.has(url.pathname) ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname.startsWith('/demo/')
  )
}

function navigation(request) {
  return request.mode === 'navigate' || request.destination === 'document'
}

// 预缓存入口与全部分片，让「联网打开过一次」的设备在断网后仍能进入任何页面。
// 旧缓存里已有同 URL 的文件直接复用，避免每次发版都让用户重新下载全部资源。
async function precache() {
  const cache = await caches.open(CACHE_NAME)
  const urls = new Set(SHELL_URLS)
  try {
    const response = await fetch('/precache-manifest.json', { cache: 'no-store' })
    if (response.ok) {
      const manifest = await response.json()
      for (const url of manifest.files || []) urls.add(url)
    }
  } catch {
    // 首次访问可能处于弱网/离线：先缓存固定入口，其余留给运行时缓存补齐。
  }
  await Promise.allSettled(
    [...urls].map(async (url) => {
      // ignoreVary：预缓存由 SW 自己发起，没有页面的 Origin 等请求头，
      // 若服务端返回 Vary 头，严格匹配会让后续页面请求全部落空。
      const cached = await caches.match(url, { ignoreVary: true })
      if (cached) return cache.put(url, cached.clone())
      return cache.add(url)
    }),
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key.startsWith('bibo-shell-'))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (!cacheable(event.request, url)) return
  if (navigation(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy))
          }
          return response
        })
        .catch(() =>
          caches.match('/index.html', { ignoreVary: true }).then(
            (response) =>
              response ||
              new Response('BIBU 离线页面尚未缓存，请先联网打开一次。', {
                status: 503,
                headers: { 'Content-Type': 'text/plain; charset=utf-8' },
              }),
          ),
        ),
    )
    return
  }
  event.respondWith(
    caches.match(event.request, { ignoreVary: true }).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
          }
          return response
        }),
    ),
  )
})
