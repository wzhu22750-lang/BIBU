import { createClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { createAdminApiClient } from '../functions/admin-api/client.ts'
import { createHandler } from '../functions/admin-api/handler.ts'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const SESSION_ID = '33333333-3333-4333-8333-333333333333'
const NOW = new Date('2026-10-20T12:00:00.000Z')
const ORIGIN = 'http://localhost:5175'
const SUPABASE_URL = 'https://fake-project.supabase.co'

function base64url(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function token(): string {
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({
    sub: OWNER_ID,
    session_id: SESSION_ID,
    exp: Math.floor(NOW.getTime() / 1000) + 3600,
  })}.signature`
}

type FakeBehavior = {
  touch?: 'ok' | 'postgrest_error' | 'network_error'
  actor?: Record<string, unknown>
  initialized?: boolean
}

function fakeFetch(behavior: FakeBehavior = {}) {
  const calls: Array<{ method: string; url: string; name: string | null }> = []
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method || 'GET').toUpperCase()
    const rpcName = url.includes('/rest/v1/rpc/')
      ? url.slice(url.indexOf('/rest/v1/rpc/') + '/rest/v1/rpc/'.length)
      : null
    calls.push({ method, url, name: rpcName })

    if (method === 'GET' && url.endsWith('/auth/v1/user')) {
      return Response.json({ id: OWNER_ID, email: 'owner@example.com' })
    }
    if (method === 'POST' && rpcName) {
      if (rpcName === 'admin_actor') {
        return Response.json(
          behavior.actor ?? {
            found: true,
            user_id: OWNER_ID,
            role: 'owner',
            status: 'active',
            display_name: '测试管理员',
            session_alive: true,
            capabilities: ['overview.read', 'admins.manage'],
          },
        )
      }
      if (rpcName === 'admin_bootstrap_status') {
        return Response.json({ initialized: behavior.initialized ?? true })
      }
      if (rpcName === 'admin_touch_actor') {
        if (behavior.touch === 'network_error') throw new TypeError('fetch failed')
        if (behavior.touch === 'postgrest_error') {
          return Response.json(
            { code: 'XX000', message: 'touch failed' },
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          )
        }
        return new Response(null, { status: 204 })
      }
      return Response.json({ ok: true })
    }
    throw new Error(`unexpected fetch ${method} ${url}`)
  }
  return { fetchImpl, calls }
}

function setup(behavior: FakeBehavior = {}) {
  const fake = fakeFetch(behavior)
  const supabase = createClient(SUPABASE_URL, 'test-publishable-key', {
    global: { fetch: fake.fetchImpl },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const handler = createHandler({
    client: createAdminApiClient(supabase),
    allowedOrigins: [ORIGIN],
    envLabel: 'test',
    now: () => NOW,
  })
  return { handler, calls: fake.calls, supabase }
}

async function session(handler: (request: Request) => Promise<Response>) {
  return handler(
    new Request('https://example.supabase.co/functions/v1/admin-api/session', {
      headers: { Origin: ORIGIN, Authorization: `Bearer ${token()}` },
    }),
  )
}

describe('admin-api 与真实 supabase-js 的 RPC 契约', () => {
  it('真实 PostgREST 构造器没有 catch，但适配层仍能让 /session 返回 200', async () => {
    const { handler, supabase, calls } = setup()
    const builder = supabase.rpc('admin_touch_actor', { p_actor: OWNER_ID })
    expect(typeof (builder as { catch?: unknown }).catch).toBe('undefined')
    expect(typeof builder.then).toBe('function')

    const response = await session(handler)
    expect(response.status).toBe(200)
    const payload = (await response.json()) as Record<string, any>
    expect(payload.data.actor).toMatchObject({ role: 'owner', status: 'active' })
    expect(payload.request_id).toBe(response.headers.get('x-request-id'))
    expect(calls.map((call) => call.name)).toContain('admin_touch_actor')
  })

  it('admin_touch_actor 返回 PostgREST 错误时登录仍完成', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { handler } = setup({ touch: 'postgrest_error' })
    const response = await session(handler)
    expect(response.status).toBe(200)
    expect(
      warn.mock.calls.some((call) => String(call[0]).includes('last_seen update failed')),
    ).toBe(true)
    warn.mockRestore()
  })

  it('admin_touch_actor 网络异常时登录仍完成', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { handler } = setup({ touch: 'network_error' })
    const response = await session(handler)
    expect(response.status).toBe(200)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('非管理员与后端不可用不会被误判为已初始化', async () => {
    const { handler } = setup({ actor: { found: false }, initialized: true })
    const denied = await session(handler)
    expect(denied.status).toBe(403)
    expect(((await denied.json()) as Record<string, any>).error).toMatchObject({
      code: 'not_admin',
      initialized: true,
    })
  })
})
