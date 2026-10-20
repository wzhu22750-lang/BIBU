export type ErrorCode =
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

const defaultMessage: Record<ErrorCode, string> = {
  unauthorized: '请先登录后台',
  not_admin: '该账号没有后台访问权限',
  admin_suspended: '管理员权限已停用',
  session_expired: '登录会话已失效，请重新登录',
  forbidden: '当前角色无权执行此操作',
  validation_error: '请求参数无效',
  not_found: '目标不存在',
  conflict: '请求冲突，请刷新后重试',
  origin_not_allowed: '请求来源不在允许列表',
  not_ready: '后台服务尚未完成部署',
  server_error: '服务器处理失败，请稍后重试',
}

export class ApiError extends Error {
  status: number
  code: ErrorCode
  extra: Record<string, unknown>

  constructor(
    status: number,
    code: ErrorCode,
    message = defaultMessage[code],
    extra: Record<string, unknown> = {},
  ) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

export function dbErrorToApi(error: { code?: string; message?: string } | null): ApiError {
  if (!error) return new ApiError(500, 'server_error')
  const code = error.code || ''
  if (code === '42501') return new ApiError(403, 'forbidden')
  if (code === 'PGRST202') return new ApiError(503, 'not_ready')
  if (code === '23505' || code === '40001') {
    return new ApiError(409, 'conflict')
  }
  // 仅 22023 由本项目函数用于可展示的业务校验；其他数据库错误不转发原文，
  // 避免把约束名、函数名等内部信息带给浏览器。
  if (code === '22023') {
    return new ApiError(400, 'validation_error', error.message || defaultMessage.validation_error)
  }
  if (code === '23514') {
    return new ApiError(400, 'validation_error')
  }
  if (code === 'PGRST301' || code === 'PGRST302') {
    return new ApiError(401, 'unauthorized')
  }
  return new ApiError(500, 'server_error')
}

export function errorCodeForAudit(error: unknown): string {
  if (error instanceof ApiError) return error.code.toUpperCase()
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: string }).code || 'SERVER_ERROR').slice(0, 80)
  }
  return 'SERVER_ERROR'
}
