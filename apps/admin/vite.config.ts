import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execFileSync } from 'node:child_process'

function resolveCommit() {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA
  if (fromVercel) return fromVercel.slice(0, 7)
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig(({ mode }) => ({
  root: 'apps/admin',
  base: '/admin/',
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5175 },
  preview: { host: '0.0.0.0', port: 5175 },
  build: {
    outDir: '../../dist/admin',
    emptyOutDir: true,
    sourcemap: false,
  },
  define: {
    __ADMIN_BUILD__: JSON.stringify({
      commit: resolveCommit(),
      builtAt: new Date().toISOString(),
      mode,
    }),
  },
}))
