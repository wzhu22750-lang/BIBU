import { ApiError, dbErrorToApi, errorCodeForAudit } from './errors.ts'
import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  methodNotAllowed,
  originAllowed,
  readBearerToken,
  readJsonBody,
  securityHeaders,
} from './http.ts'
import { decodeJwtClaims } from './jwt.ts'
import type { AdminActor, HandlerOptions } from './types.ts'
import {
  bodyEnum,
  bodyString,
  daySpan,
  enumParam,
  idempotencyKey,
  isUuid,
  limitedParam,
  optionalBodyString,
  optionalBoolParam,
  optionalDateParam,
  parseIntParam,
  parseDateRange,
  requireUuid,
  validDate,
} from './validation.ts'

type RequestContext = {
  request: Request
  requestId: string
  origin: string | null
  now: Date
  userId: string
  sessionId: string
  actor: Required<Pick<AdminActor, 'role' | 'status' | 'user_id' | 'capabilities'>> & {
    display_name: string
  }
}

const ROLES = ['owner', 'operator', 'support', 'maintainer'] as const
const USER_FILTERS = ['all', 'paired', 'unpaired', 'deletion_pending', 'banned'] as const
const USER_SORTS = [
  'created_at_desc',
  'created_at_asc',
  'name_asc',
  'name_desc',
  'devices_desc',
] as const
const COUPLE_STATES = ['all', 'active', 'sealed'] as const
const COUPLE_PAIRS = ['all', 'complete', 'incomplete'] as const
const COUPLE_TASKS = ['all', 'double', 'single', 'assigned', 'none'] as const
const COUPLE_SORTS = ['created_at_desc', 'created_at_asc', 'name_asc'] as const
const TICKET_STATUSES = [
  'open',
  'all',
  'pending',
  'in_progress',
  'waiting_user',
  'resolved',
] as const
const TICKET_CATEGORIES = [
  'all',
  'bug',
  'account',
  'notification',
  'data',
  'privacy',
  'other',
] as const
const TICKET_SORTS = ['updated_desc', 'created_desc', 'waiting_asc'] as const
const TICKET_ACTIONS = ['reply', 'note', 'status', 'assign'] as const
const TICKET_ACTION_STATUSES = ['pending', 'in_progress', 'waiting_user', 'resolved'] as const
const DIAGNOSTIC_EVENTS = ['all', 'message', 'ping'] as const
const DIAGNOSTIC_STATUSES = ['all', 'accepted', 'failed', 'skipped', 'unrecorded'] as const
const AUDIT_STATUSES = ['all', 'success', 'failure'] as const

function routePath(request: Request): string {
  const pathname = new URL(request.url).pathname
  const marker = '/admin-api'
  const index = pathname.indexOf(marker)
  let sub = index >= 0 ? pathname.slice(index + marker.length) : pathname
  sub = sub.replace(/\/+$/, '')
  return sub || '/'
}

function routeId(path: string, prefix: string, suffix = ''): string | null {
  if (!path.startsWith(prefix)) return null
  let rest = path.slice(prefix.length)
  if (suffix) {
    if (!rest.endsWith(suffix)) return null
    rest = rest.slice(0, -suffix.length)
  }
  if (!rest || rest.includes('/')) return null
  return rest
}

async function callRpc<T>(
  options: HandlerOptions,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await options.client.rpc<T>(name, args)
  if (error) throw dbErrorToApi(error)
  return data
}

async function bootstrapStatus(options: HandlerOptions): Promise<{ initialized: boolean }> {
  // 数据库或 PostgREST 不可用时必须让调用方看到 503/500，不能伪装成“尚未初始化”。
  const data = await callRpc<{ initialized?: boolean }>(options, 'admin_bootstrap_status', {})
  return { initialized: Boolean(data?.initialized) }
}

type EdgeRuntimeLike = { waitUntil?: (promise: Promise<unknown>) => void }

async function touchActor(options: HandlerOptions, actorId: string, requestId: string) {
  const work = (async () => {
    try {
      const { error } = await options.client.rpc('admin_touch_actor', { p_actor: actorId })
      if (error) {
        console.warn(
          `[admin-api] ${requestId} last_seen update failed code=${error.code || 'unknown'}`,
        )
      }
    } catch {
      console.warn(`[admin-api] ${requestId} last_seen update exception`)
    }
  })()

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, 750)
  })
  await Promise.race([work, timeout])
  if (timer) clearTimeout(timer)
  // last_seen 不是登录成功的必要条件；若响应已经返回，交给 Edge Runtime
  // 保持写入存活，而不是依赖一个无人等待的 Promise。
  const runtime = (globalThis as { EdgeRuntime?: EdgeRuntimeLike }).EdgeRuntime
  runtime?.waitUntil?.(work)
}

async function auditFailure(
  options: HandlerOptions,
  ctx: Pick<RequestContext, 'userId' | 'requestId'>,
  action: string,
  targetType: string,
  targetId: string | null,
  reason: string,
  error: unknown,
  idempotencyKey: string | null,
) {
  try {
    await options.client.rpc('admin_record_failure', {
      p_request_id: ctx.requestId,
      p_actor: ctx.userId,
      p_action: action,
      p_target_type: targetType,
      p_target_id: targetId,
      p_reason: reason.slice(0, 300),
      p_error_code: errorCodeForAudit(error),
      p_idempotency_key: idempotencyKey,
    })
  } catch (auditError) {
    // 审计失败不能覆盖原始业务错误；但必须留下可观察的服务端记录。
    const code =
      auditError && typeof auditError === 'object' && 'code' in auditError
        ? String((auditError as { code?: string }).code || 'unknown')
        : 'exception'
    console.error(`[admin-api] ${ctx.requestId} failure audit write failed code=${code}`)
  }
}

function requireCapability(ctx: RequestContext, capability: string) {
  if (!ctx.actor.capabilities.includes(capability)) {
    throw new ApiError(403, 'forbidden', '当前角色无权执行此操作', {
      required_capability: capability,
    })
  }
}

function parseCreatedRange(
  params: URLSearchParams,
  maxDays: number,
): { from: string | null; to: string | null } {
  const from = optionalDateParam(params, 'created_from')
  const to = optionalDateParam(params, 'created_to')
  if (from && to) {
    const span = daySpan(from, to)
    if (span < 0) throw new ApiError(400, 'validation_error', '结束日期不能早于开始日期')
    if (span > maxDays) {
      throw new ApiError(400, 'validation_error', `创建日期范围不能超过 ${maxDays} 天`)
    }
  }
  return { from, to }
}

async function authenticate(
  options: HandlerOptions,
  request: Request,
  requestId: string,
  origin: string | null,
): Promise<{
  context: Omit<RequestContext, 'actor'>
  actor: AdminActor | null
  initialized: boolean
}> {
  const token = readBearerToken(request)
  const { data, error } = await options.client.auth.getUser(token)
  if (error || !data?.user?.id) throw new ApiError(401, 'unauthorized')

  const now = options.now ? options.now() : new Date()
  const claims = decodeJwtClaims(token)
  if (!claims || claims.sub !== data.user.id) throw new ApiError(401, 'unauthorized')
  if (claims.exp && now.getTime() / 1000 > claims.exp) {
    throw new ApiError(401, 'session_expired')
  }
  if (!isUuid(claims.session_id)) throw new ApiError(401, 'unauthorized')

  const actorData = await callRpc<AdminActor>(options, 'admin_actor', {
    p_user_id: data.user.id,
    p_session_id: claims.session_id,
  })
  const initialized = actorData?.found ? true : (await bootstrapStatus(options)).initialized

  return {
    context: {
      request,
      requestId,
      origin,
      now,
      userId: data.user.id,
      sessionId: claims.session_id,
    },
    actor: actorData?.found ? actorData : null,
    initialized,
  }
}

function assertAdminActive(actor: AdminActor) {
  if (actor.status !== 'active') throw new ApiError(403, 'admin_suspended')
  if (!actor.session_alive) throw new ApiError(401, 'session_expired')
}

async function authContext(result: Awaited<ReturnType<typeof authenticate>>): Promise<Response> {
  const { context, actor, initialized } = result
  const data = {
    authenticated: true,
    initialized,
    is_admin: Boolean(actor?.found),
    role: actor?.role || null,
    status: actor?.status || null,
    display_name: actor?.display_name || '',
    session_alive: Boolean(actor?.session_alive),
  }
  return jsonResponse(
    { data, request_id: context.requestId },
    200,
    context.requestId,
    context.origin,
  )
}

async function session(
  options: HandlerOptions,
  result: Awaited<ReturnType<typeof authenticate>>,
): Promise<Response> {
  const { context, actor, initialized } = result
  if (!actor?.found) {
    throw new ApiError(
      403,
      'not_admin',
      initialized ? '该账号没有后台访问权限' : '后台尚未初始化',
      {
        initialized,
      },
    )
  }
  assertAdminActive(actor)
  await touchActor(options, context.userId, context.requestId)
  return jsonResponse(
    {
      data: {
        actor: {
          user_id: actor.user_id,
          role: actor.role,
          status: actor.status,
          display_name: actor.display_name,
          capabilities: actor.capabilities,
        },
        initialized,
        env: options.envLabel,
        server_time: context.now.toISOString(),
      },
      request_id: context.requestId,
    },
    200,
    context.requestId,
    context.origin,
  )
}

function strictActor(actor: AdminActor | null): RequestContext['actor'] {
  if (!actor?.found || !actor.user_id || !actor.role || !actor.status) {
    throw new ApiError(403, 'not_admin')
  }
  return {
    user_id: actor.user_id,
    role: actor.role,
    status: actor.status,
    capabilities: actor.capabilities || [],
    display_name: actor.display_name || '',
  }
}

async function readWrite(
  options: HandlerOptions,
  request: Request,
  body: Record<string, unknown>,
  requestId: string,
  origin: string | null,
): Promise<Response> {
  const path = routePath(request)
  const noteUserId = routeId(path, '/users/', '/notes')
  const ticketActionId = routeId(path, '/tickets/', '/actions')

  if (noteUserId) {
    if (!isUuid(noteUserId)) throw new ApiError(404, 'not_found')
    const ctx = await requireContext(options, request, requestId, origin)
    requireCapability(ctx, 'users.notes.write')
    const key = idempotencyKey(request)
    const noteBody = bodyString(body, 'body', 2, 2000)
    const reason = bodyString(body, 'reason', 2, 300)
    try {
      const data = await callRpc<Record<string, unknown>>(options, 'admin_add_user_note', {
        p_idempotency_key: key,
        p_actor: ctx.userId,
        p_user_id: noteUserId,
        p_body: noteBody,
        p_reason: reason,
        p_request_id: ctx.requestId,
      })
      return jsonResponse({ data, request_id: ctx.requestId }, 201, ctx.requestId, ctx.origin)
    } catch (error) {
      await auditFailure(options, ctx, 'user.note.create', 'user', noteUserId, reason, error, key)
      throw error
    }
  }

  if (ticketActionId) {
    if (!isUuid(ticketActionId)) throw new ApiError(404, 'not_found')
    const ctx = await requireContext(options, request, requestId, origin)
    requireCapability(ctx, 'tickets.write')
    const key = idempotencyKey(request)
    const action = bodyEnum(body, 'action', TICKET_ACTIONS)
    const reason = optionalBodyString(body, 'reason', 300) || ''
    const message = optionalBodyString(body, 'body', 2000)
    const status =
      body.status === undefined || body.status === null || body.status === ''
        ? null
        : bodyEnum(body, 'status', TICKET_ACTION_STATUSES)
    const expectedUpdatedAt = optionalBodyString(body, 'expected_updated_at', 40)
    if (
      expectedUpdatedAt &&
      (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(expectedUpdatedAt) ||
        !Number.isFinite(Date.parse(expectedUpdatedAt)))
    ) {
      throw new ApiError(400, 'validation_error', '工单版本时间无效')
    }
    const assigneeId =
      body.assignee_id === undefined || body.assignee_id === null || body.assignee_id === ''
        ? null
        : requireUuid(body.assignee_id, 'assignee_id')
    try {
      const data = await callRpc<Record<string, unknown>>(options, 'admin_ticket_action', {
        p_idempotency_key: key,
        p_actor: ctx.userId,
        p_ticket_id: ticketActionId,
        p_action: action,
        p_reason: reason,
        p_body: message,
        p_status: status,
        p_assignee_id: assigneeId,
        p_expected_updated_at: expectedUpdatedAt,
        p_request_id: ctx.requestId,
      })
      return jsonResponse({ data, request_id: ctx.requestId }, 200, ctx.requestId, ctx.origin)
    } catch (error) {
      await auditFailure(
        options,
        ctx,
        'ticket.action',
        'ticket',
        ticketActionId,
        reason,
        error,
        key,
      )
      throw error
    }
  }

  if (path === '/admins') {
    const ctx = await requireContext(options, request, requestId, origin)
    requireCapability(ctx, 'admins.manage')
    const key = idempotencyKey(request)
    const target = requireUuid(body.user_id, 'user_id')
    const role = bodyEnum(body, 'role', ROLES)
    const status = bodyEnum(body, 'status', ['active', 'suspended'] as const)
    const displayName = optionalBodyString(body, 'display_name', 60) || ''
    const reason = bodyString(body, 'reason', 2, 300)
    try {
      const data = await callRpc<Record<string, unknown>>(options, 'admin_upsert_member', {
        p_idempotency_key: key,
        p_actor: ctx.userId,
        p_user_id: target,
        p_role: role,
        p_status: status,
        p_display_name: displayName,
        p_reason: reason,
        p_request_id: ctx.requestId,
      })
      return jsonResponse({ data, request_id: ctx.requestId }, 200, ctx.requestId, ctx.origin)
    } catch (error) {
      await auditFailure(
        options,
        ctx,
        'admin.member.upsert',
        'admin_member',
        target,
        reason,
        error,
        key,
      )
      throw error
    }
  }

  throw new ApiError(404, 'not_found')
}

async function requireContext(
  options: HandlerOptions,
  request: Request,
  requestId: string,
  origin: string | null,
): Promise<RequestContext> {
  const result = await authenticate(options, request, requestId, origin)
  if (!result.actor?.found) throw new ApiError(403, 'not_admin')
  assertAdminActive(result.actor)
  return {
    ...result.context,
    actor: strictActor(result.actor),
  }
}

async function readRoute(
  options: HandlerOptions,
  request: Request,
  path: string,
  requestId: string,
  origin: string | null,
): Promise<Response> {
  if (path === '/auth-context') {
    const result = await authenticate(options, request, requestId, origin)
    return authContext(result)
  }
  if (path === '/session') {
    const result = await authenticate(options, request, requestId, origin)
    return session(options, result)
  }

  const ctx = await requireContext(options, request, requestId, origin)
  const params = new URL(request.url).searchParams
  const page = parseIntParam(params, 'page', 1, 1, 100_000)
  const pageSize = parseIntParam(params, 'page_size', 20, 1, 50)

  if (path === '/overview') {
    requireCapability(ctx, 'overview.read')
    const { from, to } = parseDateRange(params, ctx.now)
    const data = await callRpc(options, 'admin_overview', {
      p_actor: ctx.userId,
      p_from: from,
      p_to: to,
    })
    return jsonResponse({ data, request_id: ctx.requestId }, 200, ctx.requestId, ctx.origin)
  }

  if (path === '/users') {
    requireCapability(ctx, 'users.read')
    const created = parseCreatedRange(params, 365)
    const data = await callRpc(options, 'admin_list_users', {
      p_actor: ctx.userId,
      p_query: limitedParam(params, 'query', 100),
      p_search: enumParam(params, 'search', ['name', 'id', 'email'] as const, 'name'),
      p_page: page,
      p_page_size: pageSize,
      p_sort: enumParam(params, 'sort', USER_SORTS, 'created_at_desc'),
      p_filter: enumParam(params, 'filter', USER_FILTERS, 'all'),
      p_created_from: created.from,
      p_created_to: created.to,
    })
    return jsonResponse({ data, request_id: ctx.requestId }, 200, ctx.requestId, ctx.origin)
  }

  const userId = routeId(path, '/users/')
  if (userId) {
    requireCapability(ctx, 'users.read')
    if (!isUuid(userId)) throw new ApiError(404, 'not_found')
    const data = await callRpc(options, 'admin_user_detail', {
      p_actor: ctx.userId,
      p_user_id: userId,
    })
    if (!data) throw new ApiError(404, 'not_found')
    return jsonResponse({ data, request_id: ctx.requestId }, 200, ctx.requestId, ctx.origin)
  }

  if (path === '/couples') {
    requireCapability(ctx, 'couples.read')
    const { from, to } = parseDateRange(params, ctx.now)
    const created = parseCreatedRange(params, 365)
    const data = await callRpc(options, 'admin_list_couples', {
      p_actor: ctx.userId,
      p_from: from,
      p_to: to,
      p_state: enumParam(params, 'state', COUPLE_STATES, 'all'),
      p_pair: enumParam(params, 'pair', COUPLE_PAIRS, 'all'),
      p_page: page,
      p_page_size: pageSize,
      p_sort: enumParam(params, 'sort', COUPLE_SORTS, 'created_at_desc'),
      p_created_from: created.from,
      p_created_to: created.to,
      p_mutual: optionalBoolParam(params, 'mutual'),
      p_task: enumParam(params, 'task', COUPLE_TASKS, 'all'),
    })
    return jsonResponse({ data, request_id: ctx.requestId }, 200, ctx.requestId, ctx.origin)
  }

  const coupleId = routeId(path, '/couples/')
  if (coupleId) {
    requireCapability(ctx, 'couples.read')
    if (!isUuid(coupleId)) throw new ApiError(404, 'not_found')
    const { from, to } = parseDateRange(params, ctx.now)
    const data = await callRpc(options, 'admin_couple_detail', {
      p_actor: ctx.userId,
      p_couple_id: coupleId,
      p_from: from,
      p_to: to,
    })
    if (!data) throw new ApiError(404, 'not_found')
    return jsonResponse({ data, request_id: ctx.requestId }, 200, ctx.requestId, ctx.origin)
  }

  if (path === '/tickets') {
    requireCapability(ctx, 'tickets.read')
    const data = await callRpc(options, 'admin_list_tickets', {
      p_actor: ctx.userId,
      p_status: enumParam(params, 'status', TICKET_STATUSES, 'open'),
      p_category: enumParam(params, 'category', TICKET_CATEGORIES, 'all'),
      p_query: limitedParam(params, 'query', 100),
      p_page: page,
      p_page_size: pageSize,
      p_sort: enumParam(params, 'sort', TICKET_SORTS, 'updated_desc'),
      p_view: enumParam(params, 'view', ['all', 'mine', 'unassigned', 'user_replied'], 'all'),
    })
    return jsonResponse({ data, request_id: ctx.requestId }, 200, ctx.requestId, ctx.origin)
  }

  const ticketId = routeId(path, '/tickets/')
  if (ticketId) {
    requireCapability(ctx, 'tickets.read')
    if (!isUuid(ticketId)) throw new ApiError(404, 'not_found')
    const data = await callRpc(options, 'admin_ticket_detail', {
      p_actor: ctx.userId,
      p_ticket_id: ticketId,
    })
    if (!data) throw new ApiError(404, 'not_found')
    return jsonResponse({ data, request_id: ctx.requestId }, 200, ctx.requestId, ctx.origin)
  }

  if (path === '/diagnostics') {
    requireCapability(ctx, 'diagnostics.read')
    const { from, to } = parseDateRange(params, ctx.now)
    const data = await callRpc(options, 'admin_list_diagnostics', {
      p_actor: ctx.userId,
      p_from: from,
      p_to: to,
      p_event_type: enumParam(params, 'event_type', DIAGNOSTIC_EVENTS, 'all'),
      p_status: enumParam(params, 'status', DIAGNOSTIC_STATUSES, 'all'),
      p_page: page,
      p_page_size: pageSize,
      p_event_id: params.get('event_id') ? requireUuid(params.get('event_id'), 'event_id') : null,
      p_request_id: params.get('request_id')
        ? requireUuid(params.get('request_id'), 'request_id')
        : null,
      p_couple_id: params.get('couple_id')
        ? requireUuid(params.get('couple_id'), 'couple_id')
        : null,
    })
    return jsonResponse({ data, request_id: ctx.requestId }, 200, ctx.requestId, ctx.origin)
  }

  if (path === '/audit') {
    requireCapability(ctx, 'audit.read')
    const from = params.get('from')
    const to = params.get('to')
    if (from && !validDate(from)) throw new ApiError(400, 'validation_error', 'from 日期无效')
    if (to && !validDate(to)) throw new ApiError(400, 'validation_error', 'to 日期无效')
    if (from && to && (daySpan(from, to) < 0 || daySpan(from, to) > 365)) {
      throw new ApiError(400, 'validation_error', '审计日期范围无效或超过 365 天')
    }
    const data = await callRpc(options, 'admin_list_audit', {
      p_actor: ctx.userId,
      p_query: limitedParam(params, 'query', 100),
      p_success: enumParam(params, 'success', AUDIT_STATUSES, 'all'),
      p_from: from || null,
      p_to: to || null,
      p_page: page,
      p_page_size: pageSize,
    })
    return jsonResponse({ data, request_id: ctx.requestId }, 200, ctx.requestId, ctx.origin)
  }

  if (path === '/system') {
    requireCapability(ctx, 'system.read')
    const data = await callRpc(options, 'admin_system_health', { p_actor: ctx.userId })
    return jsonResponse({ data, request_id: ctx.requestId }, 200, ctx.requestId, ctx.origin)
  }

  if (path === '/admins') {
    requireCapability(ctx, 'admins.manage')
    const data = await callRpc(options, 'admin_list_members', { p_actor: ctx.userId })
    return jsonResponse({ data, request_id: ctx.requestId }, 200, ctx.requestId, ctx.origin)
  }

  throw new ApiError(404, 'not_found')
}

export function createHandler(options: HandlerOptions) {
  return async function handle(request: Request): Promise<Response> {
    const requestId = crypto.randomUUID()
    const origin = request.headers.get('origin')
    if (!originAllowed(origin, options.allowedOrigins)) {
      return errorResponse(new ApiError(403, 'origin_not_allowed'), requestId, null)
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: securityHeaders(corsHeaders(origin)),
      })
    }

    const path = routePath(request)
    try {
      if (request.method === 'GET') {
        return await readRoute(options, request, path, requestId, origin)
      }
      if (request.method === 'POST') {
        const body = await readJsonBody(request)
        return await readWrite(options, request, body, requestId, origin)
      }
      return methodNotAllowed(requestId, origin)
    } catch (error) {
      if (error instanceof ApiError) {
        console.warn(`[admin-api] ${requestId} ${error.code} ${path}`)
      } else {
        const message =
          error && typeof error === 'object' && 'message' in error
            ? String((error as { message?: string }).message || '').slice(0, 200)
            : 'unknown'
        console.error(`[admin-api] ${requestId} unhandled: ${message}`)
      }
      return errorResponse(error, requestId, origin)
    }
  }
}
