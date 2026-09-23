// 微信快捷登录的前端辅助：OAuth 回跳错误参数解析 + 普通用户可理解的错误文案。
// 本模块不包含任何微信凭据，也不接触微信 access_token——登录态完全由 Supabase Auth session 管理。

export type OAuthErrorInfo = { code: string; description: string }

export const WECHAT_IDENTITY_TAKEN_MESSAGE =
  '这个微信已经绑定了另一个 BIBU 账号，请先登录原账号处理绑定。'

// GoTrue / bridge 回跳时可能把 error 参数放在 query（?error=…）或 hash（#…?error=…）里。
export function readOAuthErrorFromLocation(location: {
  search: string
  hash: string
}): OAuthErrorInfo | null {
  for (const source of [location.search, location.hash]) {
    const queryIndex = source.indexOf('?')
    if (queryIndex === -1) continue
    const params = new URLSearchParams(source.slice(queryIndex + 1))
    const code = params.get('error')
    if (!code) continue
    return { code, description: params.get('error_description') || '' }
  }
  return null
}

// 把 error 参数从地址栏清掉，避免刷新页面时重复弹错误提示。
// 纯函数版本返回新的 URL（无需清理时返回 null），便于测试。
export function stripOAuthErrorFromUrl(href: string): string | null {
  const url = new URL(href)
  let touched = false
  for (const key of ['error', 'error_description', 'error_code']) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key)
      touched = true
    }
  }
  if (url.hash.includes('error=')) {
    const [path, query = ''] = url.hash.replace(/^#/, '').split('?')
    const params = new URLSearchParams(query)
    for (const key of ['error', 'error_description', 'error_code']) {
      if (params.has(key)) {
        params.delete(key)
        touched = true
      }
    }
    const rest = params.toString()
    url.hash = rest ? `${path}?${rest}` : path
  }
  return touched ? url.toString() : null
}

export function clearOAuthErrorFromLocation() {
  if (typeof window === 'undefined') return
  const cleaned = stripOAuthErrorFromUrl(window.location.href)
  if (cleaned) window.history.replaceState(null, '', cleaned)
}

function partsOf(error: unknown): { code: string; message: string } {
  if (error && typeof error === 'object') {
    const e = error as { code?: unknown; message?: unknown; error?: unknown; description?: unknown }
    return {
      code: String(e.code ?? e.error ?? ''),
      message: String(e.message ?? e.description ?? ''),
    }
  }
  return { code: '', message: String(error ?? '') }
}

// 把微信登录链路上可能出现的错误统一翻译成对普通用户友好的文案。
// 覆盖：取消授权、state 错误、code 失效/重放、identity 冲突、provider 未配置、
// 微信接口超时/错误、session 创建失败（GoTrue 4xx/5xx）等。
export function describeWechatError(error: unknown): string {
  const { code, message } = partsOf(error)
  const haystack = `${code} ${message}`.toLowerCase()

  if (
    /identity.?already.?exist|already.?linked|duplicate.?identity|already.?been.?registered|already.?associated/.test(
      haystack,
    )
  ) {
    return WECHAT_IDENTITY_TAKEN_MESSAGE
  }
  if (/access_denied|user.?cancel|取消授权|deny/.test(haystack)) {
    return '已取消微信授权，可随时重新登录'
  }
  if (/invalid_state|state.?mismatch|state.?expired|登录状态已失效/.test(haystack)) {
    return '登录状态已失效，请重新点击「微信快捷登录」'
  }
  if (/invalid_grant|code.?expired|already.?redeemed|code.?used|otp_expired/.test(haystack)) {
    return '微信登录已过期，请重新操作'
  }
  if (
    /custom_provider_not_found|provider.?not.?found|provider.?not.?enabled|bad?_?request.?provider/.test(
      haystack,
    )
  ) {
    return '微信登录暂未开放，请先使用邮箱登录'
  }
  if (/timeout|超时|timed?out|network|fetch/.test(haystack)) {
    return '连接微信服务超时，请稍后重试'
  }
  if (/session|登录态|session_creator|500|502|503|server_error|wechat_/.test(haystack)) {
    return '微信登录没有完成，请重试；如多次失败请改用邮箱登录'
  }
  return '微信登录没有完成，请重试；如多次失败请改用邮箱登录'
}
