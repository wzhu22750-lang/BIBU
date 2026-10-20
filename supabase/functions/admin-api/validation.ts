import { ApiError } from './errors.ts'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function requireUuid(value: unknown, label: string): string {
  if (!isUuid(value)) throw new ApiError(400, 'validation_error', `${label}格式无效`)
  return value
}

export function validDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

export function businessToday(now: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

export function daySpan(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [ty, tm, td] = to.split('-').map(Number)
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  )
}

export function parseDateRange(
  params: URLSearchParams,
  now: Date,
  defaultDays = 29,
): { from: string; to: string } {
  const today = businessToday(now)
  const from = params.get('from') || addDays(today, -defaultDays)
  const to = params.get('to') || today
  if (!validDate(from) || !validDate(to)) {
    throw new ApiError(400, 'validation_error', '日期需为 YYYY-MM-DD')
  }
  const span = daySpan(from, to)
  if (span < 0) throw new ApiError(400, 'validation_error', '结束日期不能早于开始日期')
  if (span > 92) throw new ApiError(400, 'validation_error', '日期范围不能超过 92 天')
  return { from, to }
}

export function parseIntParam(
  params: URLSearchParams,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = params.get(key)
  if (raw === null || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new ApiError(400, 'validation_error', `${key} 参数无效`)
  }
  return value
}

export function optionalDateParam(params: URLSearchParams, key: string): string | null {
  const raw = params.get(key)
  if (raw === null || raw === '') return null
  if (!validDate(raw)) throw new ApiError(400, 'validation_error', `${key} 需为 YYYY-MM-DD`)
  return raw
}

export function optionalBoolParam(params: URLSearchParams, key: string): boolean | null {
  const raw = params.get(key)
  if (raw === null || raw === '') return null
  if (raw === 'true') return true
  if (raw === 'false') return false
  throw new ApiError(400, 'validation_error', `${key} 参数无效`)
}

export function enumParam<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = params.get(key)
  if (value === null || value === '') return fallback
  if (!(allowed as readonly string[]).includes(value)) {
    throw new ApiError(400, 'validation_error', `${key} 参数无效`)
  }
  return value as T
}

export function limitedParam(params: URLSearchParams, key: string, max = 100): string {
  const value = (params.get(key) || '').trim()
  if (value.length > max) throw new ApiError(400, 'validation_error', `${key} 过长`)
  return value
}

export function bodyString(
  body: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
  required = true,
): string {
  const raw = body[key]
  if (raw === undefined || raw === null || raw === '') {
    if (!required) return ''
    throw new ApiError(400, 'validation_error', `缺少 ${key}`)
  }
  if (typeof raw !== 'string') throw new ApiError(400, 'validation_error', `${key} 需为文本`)
  const value = raw.trim()
  if (value.length < min || value.length > max) {
    throw new ApiError(400, 'validation_error', `${key} 需为 ${min}–${max} 字`)
  }
  return value
}

export function optionalBodyString(
  body: Record<string, unknown>,
  key: string,
  max: number,
): string | null {
  const raw = body[key]
  if (raw === undefined || raw === null || raw === '') return null
  if (typeof raw !== 'string') throw new ApiError(400, 'validation_error', `${key} 需为文本`)
  const value = raw.trim()
  if (value.length > max) throw new ApiError(400, 'validation_error', `${key} 过长`)
  return value
}

export function bodyEnum<T extends string>(
  body: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
): T {
  const raw = body[key]
  if (typeof raw !== 'string' || !(allowed as readonly string[]).includes(raw)) {
    throw new ApiError(400, 'validation_error', `${key} 参数无效`)
  }
  return raw as T
}

export function idempotencyKey(request: Request): string {
  const raw = request.headers.get('Idempotency-Key') || ''
  if (!isUuid(raw)) {
    throw new ApiError(400, 'validation_error', '写操作需要有效的 Idempotency-Key')
  }
  return raw
}
