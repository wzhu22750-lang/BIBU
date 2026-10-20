import { ApiError } from './errors.ts'

const ALLOW_METHODS = 'GET, POST, OPTIONS'
const ALLOW_HEADERS = 'authorization, apikey, content-type, idempotency-key, x-client-info'
const EXPOSE_HEADERS = 'x-request-id'

export function corsHeaders(origin: string | null): Headers {
  const headers = new Headers({ Vary: 'Origin' })
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Methods', ALLOW_METHODS)
    headers.set('Access-Control-Allow-Headers', ALLOW_HEADERS)
    headers.set('Access-Control-Expose-Headers', EXPOSE_HEADERS)
    headers.set('Access-Control-Max-Age', '600')
  }
  return headers
}

export function securityHeaders(headers: Headers): Headers {
  headers.set('Cache-Control', 'no-store')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'no-referrer')
  return headers
}

export function jsonResponse(
  body: unknown,
  status: number,
  requestId: string,
  origin: string | null,
): Response {
  const headers = securityHeaders(corsHeaders(origin))
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('X-Request-Id', requestId)
  return new Response(JSON.stringify(body), { status, headers })
}

export function errorResponse(error: unknown, requestId: string, origin: string | null): Response {
  if (error instanceof ApiError) {
    return jsonResponse(
      {
        error: {
          code: error.code,
          message: error.message,
          request_id: requestId,
          ...error.extra,
        },
      },
      error.status,
      requestId,
      origin,
    )
  }
  return jsonResponse(
    {
      error: {
        code: 'server_error',
        message: '服务器处理失败，请稍后重试',
        request_id: requestId,
      },
    },
    500,
    requestId,
    origin,
  )
}

export function originAllowed(origin: string | null, allowed: string[]) {
  if (!origin) return true
  return allowed.includes(origin)
}

export function methodNotAllowed(requestId: string, origin: string | null) {
  return jsonResponse(
    {
      error: {
        code: 'validation_error',
        message: '不支持的请求方法',
        request_id: requestId,
      },
    },
    405,
    requestId,
    origin,
  )
}

export function readBearerToken(request: Request): string {
  const header = request.headers.get('authorization') || ''
  const matched = /^Bearer\s+(\S+)$/i.exec(header)
  if (!matched) throw new ApiError(401, 'unauthorized')
  return matched[1]
}

export async function readJsonBody(
  request: Request,
  maxBytes = 16 * 1024,
): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (text.length > maxBytes) {
    throw new ApiError(413, 'validation_error', '请求内容过大')
  }
  if (!text.trim()) return {}
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not object')
    }
    return parsed as Record<string, unknown>
  } catch {
    throw new ApiError(400, 'validation_error', '请求内容不是有效的 JSON 对象')
  }
}
