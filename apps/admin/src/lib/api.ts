import { ADMIN_API_URL, SUPABASE_KEY, supabase } from './supabase'
import type { AdminSession, AuthContextData } from './types'

export type ApiErrorCode =
  | 'unauthorized'
  | 'not_admin'
  | 'admin_suspended'
  | 'session_expired'
  | 'forbidden'
  | 'validation_error'
  | 'not_found'
  | 'conflict'
  | 'origin_not_allowed'
  | 'not_ready'
  | 'server_error'
  | 'network_error'
  | 'unknown_error'

export class ApiError extends Error {
  status: number
  code: ApiErrorCode
  requestId: string | null
  extra: Record<string, unknown>

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    requestId: string | null = null,
    extra: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.extra = extra
  }
}

const AUTH_FAILURES = new Set<string>([
  'unauthorized',
  'session_expired',
  'not_admin',
  'admin_suspended',
])

let authFailureHandler: ((error: ApiError) => void) | null = null

export function setAuthFailureHandler(handler: ((error: ApiError) => void) | null) {
  authFailureHandler = handler
}

export function isAuthFailure(error: unknown): error is ApiError {
  return error instanceof ApiError && AUTH_FAILURES.has(error.code)
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

export type Query = Record<string, string | number | null | undefined>

type RequestOptions = {
  method?: 'GET' | 'POST'
  query?: Query
  body?: unknown
  signal?: AbortSignal
  idempotencyKey?: string
  notifyAuth?: boolean
}

function buildUrl(path: string, query?: Query) {
  const url = new URL(`${ADMIN_API_URL}${path}`)
  for (const [key, value] of Object.entries(query || {})) {
    if (value === null || value === undefined || value === '') continue
    url.searchParams.set(key, String(value))
  }
  return url
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) {
    const failure = new ApiError(401, 'unauthorized', '登录已失效，请重新登录')
    if (options.notifyAuth !== false) authFailureHandler?.(failure)
    throw failure
  }
  const headers = new Headers({
    Authorization: `Bearer ${data.session.access_token}`,
    apikey: SUPABASE_KEY,
    Accept: 'application/json',
  })
  if (options.body !== undefined) headers.set('Content-Type', 'application/json')
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey)

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
      credentials: 'omit',
      mode: 'cors',
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new ApiError(0, 'network_error', '网络连接失败，请检查网络后重试')
  }

  const requestId = response.headers.get('x-request-id')
  const text = await response.text()
  type Payload = {
    data?: T
    error?: {
      code?: string
      message?: string
      request_id?: string
      [key: string]: unknown
    }
  }
  let payload: Payload | null = null
  if (text) {
    try {
      payload = JSON.parse(text) as Payload
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const code = (payload?.error?.code ||
      (response.status === 429 ? 'rate_limited' : 'server_error')) as ApiErrorCode
    const message =
      payload?.error?.message ||
      (response.status === 429
        ? '请求过于频繁，请稍后再试'
        : response.status >= 500
          ? '服务器处理失败，请稍后重试'
          : '请求未完成')
    const extra = { ...(payload?.error || {}) }
    delete extra.code
    delete extra.message
    delete extra.request_id
    const failure = new ApiError(
      response.status,
      code,
      message,
      payload?.error?.request_id || requestId,
      extra,
    )
    if (options.notifyAuth !== false && AUTH_FAILURES.has(failure.code)) {
      authFailureHandler?.(failure)
    }
    throw failure
  }

  if (!payload || payload.data === undefined) {
    throw new ApiError(response.status, 'server_error', '服务器返回了无法识别的数据', requestId)
  }
  return payload.data
}

export const api = {
  get<T>(path: string, query?: Query, signal?: AbortSignal) {
    return request<T>(path, { query, signal })
  },
  post<T>(path: string, body: Record<string, unknown>, idempotencyKey?: string) {
    return request<T>(path, {
      method: 'POST',
      body,
      idempotencyKey,
    })
  },
  authContext(signal?: AbortSignal) {
    return request<AuthContextData>('/auth-context', { signal, notifyAuth: false })
  },
  session(signal?: AbortSignal) {
    return request<AdminSession>('/session', { signal, notifyAuth: false })
  },
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.requestId
      ? `${error.message}（请求 ${error.requestId.slice(0, 8)}）`
      : error.message
  }
  if (error instanceof Error) return error.message
  return String(error)
}
