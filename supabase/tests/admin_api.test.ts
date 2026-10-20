import { describe, expect, it } from 'vitest'
import { createHandler } from '../functions/admin-api/handler.ts'
import type { AdminActor, AdminApiClient, AdminRole } from '../functions/admin-api/types.ts'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '22222222-2222-4222-8222-222222222222'
const SESSION_ID = '33333333-3333-4333-8333-333333333333'
const IDEMPOTENCY_KEY = '44444444-4444-4444-8444-444444444444'
const NOW = new Date('2026-10-20T12:00:00.000Z')
const ORIGIN = 'http://localhost:5175'

const CAPABILITIES: Record<AdminRole, string[]> = {
  owner: [
    'overview.read',
    'users.read',
    'users.search_email',
    'users.notes.write',
    'couples.read',
    'tickets.read',
    'tickets.write',
    'diagnostics.read',
    'system.read',
    'audit.read',
    'admins.manage',
  ],
  operator: [
    'overview.read',
    'users.read',
    'users.search_email',
    'users.notes.write',
    'couples.read',
    'tickets.read',
    'tickets.write',
    'diagnostics.read',
    'system.read',
    'audit.read',
  ],
  support: [
    'overview.read',
    'users.read',
    'users.notes.write',
    'couples.read',
    'tickets.read',
    'tickets.write',
  ],
  maintainer: ['overview.read', 'diagnostics.read', 'system.read'],
}

function base64url(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function token(claims: Record<string, unknown>): string {
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(claims)}.signature`
}

function validToken(overrides: Record<string, unknown> = {}): string {
  return token({
    sub: OWNER_ID,
    session_id: SESSION_ID,
    exp: Math.floor(NOW.getTime() / 1000) + 3600,
    ...overrides,
  })
}

type RpcCall = { name: string; args: Record<string, unknown> }

type Setup = {
  userId?: string
  actor?: Partial<AdminActor> | null
  initialized?: boolean
  rpcError?: { name: string; error: { code: string; message: string } }
  rpcData?: unknown
}

function actorFor(role: AdminRole = 'owner', overrides: Partial<AdminActor> = {}): AdminActor {
  return {
    found: true,
    user_id: OWNER_ID,
    role,
    status: 'active',
    display_name: '测试管理员',
    session_alive: true,
    capabilities: CAPABILITIES[role],
    ...overrides,
  }
}

function setup(options: Setup = {}) {
  const calls: RpcCall[] = []
  const actor =
    options.actor === null ? ({ found: false } as AdminActor) : actorFor('owner', options.actor)
  const client: AdminApiClient = {
    auth: {
      getUser: async () => ({
        data: { user: { id: options.userId ?? OWNER_ID } },
        error: null,
      }),
    },
    rpc: async <T>(name: string, args: Record<string, unknown> = {}) => {
      calls.push({ name, args })
      if (name === 'admin_actor') return { data: actor as T, error: null }
      if (name === 'admin_bootstrap_status') {
        return { data: { initialized: options.initialized ?? true } as T, error: null }
      }
      if (options.rpcError && options.rpcError.name === name) {
        return { data: null as T, error: options.rpcError.error }
      }
      if (name === 'admin_touch_actor') return { data: null as T, error: null }
      if (name === 'admin_record_failure') return { data: 'audit-id' as T, error: null }
      return {
        data: (options.rpcData ?? { total: 0, rows: [] }) as T,
        error: null,
      }
    },
  }
  const handler = createHandler({
    client,
    allowedOrigins: [ORIGIN],
    envLabel: 'test',
    now: () => NOW,
  })
  return { handler, calls }
}

async function request(
  handler: (request: Request) => Promise<Response>,
  path: string,
  init: {
    method?: string
    token?: string | null
    origin?: string | null
    headers?: Record<string, string>
    body?: unknown
  } = {},
) {
  const headers = new Headers()
  const origin = init.origin === undefined ? ORIGIN : init.origin
  if (origin) headers.set('Origin', origin)
  if (init.token !== null) headers.set('Authorization', `Bearer ${init.token || validToken()}`)
  if (init.body !== undefined) headers.set('Content-Type', 'application/json')
  for (const [key, value] of Object.entries(init.headers || {})) headers.set(key, value)
  return handler(
    new Request(`https://example.supabase.co/functions/v1/admin-api${path}`, {
      method: init.method || 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    }),
  )
}

async function body(response: Response) {
  return (await response.json()) as Record<string, any>
}

function names(calls: RpcCall[]) {
  return calls.map((call) => call.name)
}

describe('admin-api 身份、会话与来源校验', () => {
  it('允许预检并拒绝陌生来源', async () => {
    const { handler, calls } = setup()
    const preflight = await request(handler, '/session', {
      method: 'OPTIONS',
      token: null,
    })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(preflight.headers.get('access-control-allow-headers')).toContain('idempotency-key')

    const blocked = await request(handler, '/session', { origin: 'https://evil.example' })
    expect(blocked.status).toBe(403)
    expect((await body(blocked)).error.code).toBe('origin_not_allowed')
    expect(calls).toHaveLength(0)
  })

  it('未登录、失效 JWT 与子声明不匹配都无法进入', async () => {
    const { handler } = setup()
    const anonymous = await request(handler, '/session', { token: null })
    expect(anonymous.status).toBe(401)
    expect(anonymous.headers.get('x-request-id')).toBe((await body(anonymous)).error.request_id)

    const malformed = await request(handler, '/session', { token: 'not-a-jwt' })
    expect(malformed.status).toBe(401)

    const expired = await request(handler, '/session', {
      token: validToken({ exp: Math.floor(NOW.getTime() / 1000) - 10 }),
    })
    expect(expired.status).toBe(401)
    expect((await body(expired)).error.code).toBe('session_expired')

    const mismatched = await request(handler, '/session', {
      token: validToken({ sub: USER_ID }),
    })
    expect(mismatched.status).toBe(401)
  })

  it('普通用户无法获得后台身份', async () => {
    const { handler } = setup({ actor: null })
    const context = await request(handler, '/auth-context')
    expect(context.status).toBe(200)
    expect((await body(context)).data).toMatchObject({
      authenticated: true,
      initialized: true,
      is_admin: false,
    })

    const session = await request(handler, '/session')
    expect(session.status).toBe(403)
    expect((await body(session)).error.code).toBe('not_admin')

    const users = await request(handler, '/users')
    expect(users.status).toBe(403)
  })

  it('未初始化时明确返回未初始化且不开放控制台', async () => {
    const { handler } = setup({ actor: null, initialized: false })
    const context = await body(await request(handler, '/auth-context'))
    expect(context.data).toMatchObject({ initialized: false, is_admin: false })
    const session = await request(handler, '/session')
    expect(session.status).toBe(403)
    expect((await body(session)).error).toMatchObject({
      code: 'not_admin',
      initialized: false,
    })
  })

  it('只凭密码会话即可进入，不再要求 TOTP', async () => {
    const { handler } = setup()
    const response = await request(handler, '/session', {
      token: validToken({ aal: 'aal1', amr: [{ method: 'password' }] }),
    })
    expect(response.status).toBe(200)
    expect((await body(response)).data.actor).toMatchObject({
      user_id: OWNER_ID,
      role: 'owner',
    })
  })

  it('停用与撤销的会话立即失效', async () => {
    const { handler: suspendedHandler } = setup({
      actor: actorFor('owner', { status: 'suspended' }),
    })
    const suspended = await request(suspendedHandler, '/session')
    expect(suspended.status).toBe(403)
    expect((await body(suspended)).error.code).toBe('admin_suspended')

    const { handler: revokedHandler } = setup({
      actor: actorFor('owner', { session_alive: false }),
    })
    const revoked = await request(revokedHandler, '/session')
    expect(revoked.status).toBe(401)
    expect((await body(revoked)).error.code).toBe('session_expired')
  })

  it('命名的角色能力在 API 层生效', async () => {
    const { handler: supportHandler, calls: supportCalls } = setup({ actor: actorFor('support') })
    const overview = await request(supportHandler, '/overview')
    expect(overview.status).toBe(200)
    const diagnostics = await request(supportHandler, '/diagnostics')
    expect(diagnostics.status).toBe(403)
    expect((await body(diagnostics)).error.required_capability).toBe('diagnostics.read')
    expect(names(supportCalls)).not.toContain('admin_list_diagnostics')

    const { handler: maintainerHandler } = setup({ actor: actorFor('maintainer') })
    expect((await request(maintainerHandler, '/diagnostics')).status).toBe(200)
    expect((await request(maintainerHandler, '/users')).status).toBe(403)
  })
})

describe('admin-api 参数校验与 RPC 参数', () => {
  it('分页、排序与日期范围只接受允许值', async () => {
    const { handler, calls } = setup()
    expect((await request(handler, '/users?page_size=51')).status).toBe(400)
    expect((await request(handler, '/users?page=0')).status).toBe(400)
    expect((await request(handler, '/users?sort=password')).status).toBe(400)
    expect((await request(handler, '/users?query=' + 'x'.repeat(101))).status).toBe(400)
    expect(
      (await request(handler, '/users?created_from=2025-01-01&created_to=2026-10-20')).status,
    ).toBe(400)
    expect((await request(handler, '/couples?mutual=maybe')).status).toBe(400)
    expect((await request(handler, '/couples?task=all_tasks')).status).toBe(400)
    expect((await request(handler, '/overview?from=2026-07-01&to=2026-10-20')).status).toBe(400)
    expect((await request(handler, '/overview?from=2026-02-30')).status).toBe(400)
    expect(names(calls)).not.toContain('admin_list_users')
    expect(names(calls)).not.toContain('admin_overview')
  })

  it('列表与详情将允许的参数原样交给数据库函数', async () => {
    const { handler, calls } = setup()
    await request(handler, '/session')
    await request(
      handler,
      '/users?page=2&page_size=10&sort=name_asc&filter=paired&search=email&query=%20abc%20&created_from=2026-09-01&created_to=2026-09-30',
    )
    await request(
      handler,
      '/couples?from=2026-10-01&to=2026-10-20&state=sealed&pair=complete&sort=name_asc&created_from=2026-09-01&created_to=2026-09-30&mutual=true&task=double',
    )
    await request(handler, '/tickets')
    await request(handler, '/audit?success=failure&from=2026-10-01&to=2026-10-20')
    await request(handler, '/system')
    await request(handler, '/admins')

    const byName = (name: string) => calls.find((call) => call.name === name)?.args
    expect(byName('admin_list_users')).toMatchObject({
      p_actor: OWNER_ID,
      p_page: 2,
      p_page_size: 10,
      p_sort: 'name_asc',
      p_filter: 'paired',
      p_search: 'email',
      p_query: 'abc',
      p_created_from: '2026-09-01',
      p_created_to: '2026-09-30',
    })
    expect(byName('admin_list_couples')).toMatchObject({
      p_from: '2026-10-01',
      p_to: '2026-10-20',
      p_state: 'sealed',
      p_pair: 'complete',
      p_sort: 'name_asc',
      p_created_from: '2026-09-01',
      p_created_to: '2026-09-30',
      p_mutual: true,
      p_task: 'double',
    })
    expect(byName('admin_list_tickets')).toMatchObject({
      p_status: 'open',
      p_category: 'all',
      p_sort: 'updated_desc',
    })
    expect(byName('admin_list_audit')).toMatchObject({
      p_success: 'failure',
      p_from: '2026-10-01',
      p_to: '2026-10-20',
    })
    expect(byName('admin_system_health')).toEqual({ p_actor: OWNER_ID })
    expect(byName('admin_list_members')).toEqual({ p_actor: OWNER_ID })
  })

  it('未知路由与不支持的方法返回明确状态', async () => {
    const { handler } = setup()
    expect((await request(handler, '/unknown')).status).toBe(404)
    expect((await request(handler, '/users', { method: 'PUT' })).status).toBe(405)
  })
})

describe('admin-api 写操作、幂等与审计', () => {
  it('写操作必须带幂等键，并透传理由与内容', async () => {
    const { handler, calls } = setup({ rpcData: { note: { id: 'note-1' } } })
    const missingKey = await request(handler, `/users/${USER_ID}/notes`, {
      method: 'POST',
      body: { body: '用户反馈配对异常，已电话确认', reason: '处理客服工单' },
    })
    expect(missingKey.status).toBe(400)
    expect(names(calls)).not.toContain('admin_add_user_note')

    const saved = await request(handler, `/users/${USER_ID}/notes`, {
      method: 'POST',
      headers: { 'Idempotency-Key': IDEMPOTENCY_KEY },
      body: { body: '用户反馈配对异常，已电话确认', reason: '处理客服工单' },
    })
    expect(saved.status).toBe(201)
    expect((await body(saved)).data).toEqual({ note: { id: 'note-1' } })
    expect(calls.find((call) => call.name === 'admin_add_user_note')?.args).toMatchObject({
      p_idempotency_key: IDEMPOTENCY_KEY,
      p_actor: OWNER_ID,
      p_user_id: USER_ID,
      p_body: '用户反馈配对异常，已电话确认',
      p_reason: '处理客服工单',
      p_request_id: expect.any(String),
    })
  })

  it('数据库拒绝时返回脱敏错误并补写失败审计', async () => {
    const { handler, calls } = setup({
      rpcError: {
        name: 'admin_add_user_note',
        error: {
          code: '42501',
          message: 'permission denied for function admin_add_user_note',
        },
      },
    })
    const response = await request(handler, `/users/${USER_ID}/notes`, {
      method: 'POST',
      headers: { 'Idempotency-Key': IDEMPOTENCY_KEY },
      body: { body: '尝试写入备注', reason: '验证权限拒绝' },
    })
    expect(response.status).toBe(403)
    const payload = await body(response)
    expect(payload.error.code).toBe('forbidden')
    expect(payload.error.message).not.toContain('permission denied')
    expect(payload.error.request_id).toBe(response.headers.get('x-request-id'))
    expect(names(calls)).toContain('admin_record_failure')
    const failureAudit = calls.find((call) => call.name === 'admin_record_failure')
    expect(failureAudit?.args).toMatchObject({
      p_actor: OWNER_ID,
      p_action: 'user.note.create',
      p_target_type: 'user',
      p_target_id: USER_ID,
      p_error_code: 'FORBIDDEN',
      p_idempotency_key: IDEMPOTENCY_KEY,
    })
    expect(failureAudit?.args.p_request_id).toBe(payload.error.request_id)
  })

  it('管理员变更动作同样要求幂等键与理由', async () => {
    const { handler, calls } = setup({ rpcData: { member: { role: 'support' } } })
    const response = await request(handler, '/admins', {
      method: 'POST',
      headers: { 'Idempotency-Key': IDEMPOTENCY_KEY },
      body: {
        user_id: USER_ID,
        role: 'support',
        status: 'active',
        display_name: '客服小哔',
        reason: '新增客服值班账号',
      },
    })
    expect(response.status).toBe(200)
    expect(calls.find((call) => call.name === 'admin_upsert_member')?.args).toMatchObject({
      p_idempotency_key: IDEMPOTENCY_KEY,
      p_actor: OWNER_ID,
      p_user_id: USER_ID,
      p_role: 'support',
      p_status: 'active',
      p_display_name: '客服小哔',
      p_reason: '新增客服值班账号',
      p_request_id: expect.any(String),
    })
  })

  it('支持角色不能写管理员成员', async () => {
    const { handler, calls } = setup({ actor: actorFor('support') })
    const response = await request(handler, '/admins', {
      method: 'POST',
      headers: { 'Idempotency-Key': IDEMPOTENCY_KEY },
      body: {
        user_id: USER_ID,
        role: 'owner',
        status: 'active',
        reason: '尝试自我提权',
      },
    })
    expect(response.status).toBe(403)
    expect(names(calls)).not.toContain('admin_upsert_member')
  })
})

describe('admin workflow API', () => {
  it('passes queue and precise diagnostic filters to the database and validates identifiers', async () => {
    const { handler, calls } = setup()
    expect((await request(handler, '/tickets?view=mine&sort=waiting_asc')).status).toBe(200)
    expect(calls.find((call) => call.name === 'admin_list_tickets')?.args).toMatchObject({
      p_view: 'mine',
      p_sort: 'waiting_asc',
    })
    expect(
      (
        await request(
          handler,
          `/diagnostics?event_id=${USER_ID}&request_id=${SESSION_ID}&couple_id=${OWNER_ID}`,
        )
      ).status,
    ).toBe(200)
    expect(calls.find((call) => call.name === 'admin_list_diagnostics')?.args).toMatchObject({
      p_event_id: USER_ID,
      p_request_id: SESSION_ID,
      p_couple_id: OWNER_ID,
    })
    expect((await request(handler, '/diagnostics?event_id=invalid')).status).toBe(400)
    expect((await request(handler, '/tickets?view=invalid')).status).toBe(400)
  })
  it('passes the reply target state and expected version together', async () => {
    const { handler, calls } = setup()
    const response = await request(handler, `/tickets/${USER_ID}/actions`, {
      method: 'POST',
      headers: { 'Idempotency-Key': IDEMPOTENCY_KEY },
      body: {
        action: 'reply',
        body: '已修复',
        status: 'resolved',
        expected_updated_at: NOW.toISOString(),
      },
    })
    expect(response.status).toBe(200)
    expect(calls.find((call) => call.name === 'admin_ticket_action')?.args).toMatchObject({
      p_status: 'resolved',
      p_expected_updated_at: NOW.toISOString(),
    })
  })
})
