import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SHELL_URLS = ['/', '/index.html', '/favicon.svg']

/**
 * 解析构建版本号，用于线上排查「两台设备跑的到底是不是同一版代码」。
 * 优先取 Vercel 注入的 commit；本地/其他 CI 回退到 git。
 */
function resolveCommit() {
  const env = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> }
    }
  ).process?.env
  const fromVercel = env?.VERCEL_GIT_COMMIT_SHA
  if (fromVercel) return fromVercel.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

/**
 * 生成 Service Worker 预缓存清单，并把当次发布标识写进 sw.js。
 * 让「联网打开过一次」的设备断网后仍可进入任意页面，而每次发布都会
 * 因 sw.js 内容变化触发 SW 更新，清掉上一版缓存。
 */
function serviceWorkerPrecache(release: string): Plugin {
  let outDir = 'dist'
  return {
    name: 'bibu-sw-precache',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const assetsDir = join(outDir, 'assets')
      const assets = readdirSync(assetsDir)
        .filter((name) => name.endsWith('.js') || name.endsWith('.css'))
        .map((name) => `/assets/${name}`)
      writeFileSync(
        join(outDir, 'precache-manifest.json'),
        `${JSON.stringify({ release, files: [...SHELL_URLS, ...assets] }, null, 2)}\n`,
      )
      const swPath = join(outDir, 'sw.js')
      writeFileSync(swPath, readFileSync(swPath, 'utf8').replaceAll('__BIBU_RELEASE__', release))
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), serviceWorkerPrecache(resolveCommit())],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              // 第三方库按包分块：页面改动不会连带刷新依赖缓存，
              // 也避免全部依赖挤进首屏主包。
              name: (id: string) => {
                const matched = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(id)
                return matched ? `vendor-${matched[1].replace('@', '').replace('/', '-')}` : null
              },
              test: /node_modules/,
            },
          ],
        },
      },
    },
  },
  define: {
    __BIBU_BUILD__: JSON.stringify({
      commit: resolveCommit(),
      builtAt: new Date().toISOString(),
      mode,
    }),
  },
}))
