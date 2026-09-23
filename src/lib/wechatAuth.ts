// 微信快捷登录与身份绑定的前端模块：
// 由 BIBU 自身的服务端独立管理微信授权、回调、换码与身份绑定，不依赖 Supabase Custom OAuth Provider。
// 换取凭证后直接在客户端装载合法 Supabase 会话，保持 bibu_user_id、双人空间与 RLS 行为完全一致。

import { db } from './supabase'

export type OAuthErrorInfo = { code: string; description: string }

export const WECHAT_IDENTITY_TAKEN_MESSAGE =
  '这个微信已经绑定了另一个 BIBU 账号，请先登录原账号处理绑定。'

export type WechatAuthParams = {
  ticket?: string
  error?: string
  errorDescription?: string
  bindSuccess?: boolean
}

// 解析地址栏 query（?key=…）或 hash（#…?key=…）里的微信相关参数
export function readWechatParamsFromLocation(location: {
  search: string
  hash: string
}): WechatAuthParams {
  const result: WechatAuthParams = {}

  for (const source of [location.search, location.hash]) {
    const queryIndex = source.indexOf('?')
    if (queryIndex === -1) continue
    const params = new URLSearchParams(source.slice(queryIndex + 1))

    const ticket = params.get('wechat_ticket')
    if (ticket && !result.ticket) result.ticket = ticket

    const err = params.get('wechat_error') || params.get('error')
    if (err && !result.error) {
      result.error = err
      result.errorDescription =
        params.get('wechat_error_description') || params.get('error_description') || ''
    }

    if (params.get('wechat_bind') === 'success') {
      result.bindSuccess = true
    }
  }

  return result
}

// 兼容旧命名的解析函数
export function readOAuthErrorFromLocation(location: {
  search: string
  hash: string
}): OAuthErrorInfo | null {
  const params = readWechatParamsFromLocation(location)
  if (params.error) {
    return {
      code: params.error,
      description: params.errorDescription || '',
    }
  }
  return null
}

// 从 URL 中清理所有微信相关参数（支持 query 与 hash），避免刷新时重复触发
export function stripWechatParamsFromUrl(href: string): string | null {
  const url = new URL(href)
  let touched = false
  const keysToClean = [
    'wechat_ticket',
    'wechat_error',
    'wechat_error_description',
    'wechat_errcode',
    'wechat_bind',
    'error',
    'error_description',
    'error_code',
  ]

  for (const key of keysToClean) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key)
      touched = true
    }
  }

  if (url.hash.includes('?')) {
    const [path, query = ''] = url.hash.replace(/^#/, '').split('?')
    const params = new URLSearchParams(query)
    for (const key of keysToClean) {
      if (params.has(key)) {
        params.delete(key)
        touched = true
      }
    }
    const rest = params.toString()
    url.hash = rest ? `${path}?${rest}` : path
    touched = true
  }

  return touched ? url.toString() : null
}

export function stripOAuthErrorFromUrl(href: string): string | null {
  return stripWechatParamsFromUrl(href)
}

export function clearWechatParamsFromLocation() {
  if (typeof window === 'undefined') return
  const cleaned = stripWechatParamsFromUrl(window.location.href)
  if (cleaned) window.history.replaceState(null, '', cleaned)
}

export function clearOAuthErrorFromLocation() {
  clearWechatParamsFromLocation()
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

// 把微信登录/绑定链路上可能出现的各类错误转换为用户友好的文案
export function describeWechatError(error: unknown): string {
  const { code, message } = partsOf(error)
  const haystack = `${code} ${message}`.toLowerCase()

  if (
    /identity_already_bound|identity.?already.?exist|already.?linked|duplicate.?identity|already.?been.?registered|already.?associated|已经绑定了另一个/i.test(
      haystack,
    )
  ) {
    return WECHAT_IDENTITY_TAKEN_MESSAGE
  }
  if (/access_denied|user.?cancel|取消授权|deny/i.test(haystack)) {
    return '已取消微信授权，可随时重新登录'
  }
  if (/invalid_state|state.?mismatch|state.?expired|登录状态已失效/i.test(haystack)) {
    return '登录状态已失效，请重新点击「微信快捷登录」'
  }
  if (/invalid_grant|code.?expired|already.?redeemed|code.?used|otp_expired/i.test(haystack)) {
    return '微信登录已过期，请重新操作'
  }
  if (/invalid_ticket/i.test(haystack)) {
    return '微信登录票据已失效或已过期，请重新发起登录'
  }
  if (
    /wechat_not_configured|server_not_configured|custom_provider_not_found|provider.?not.?found/i.test(
      haystack,
    )
  ) {
    return '微信登录暂未开放，请先使用邮箱登录'
  }
  if (/timeout|超时|timed?out|network|fetch/i.test(haystack)) {
    return '连接微信服务超时，请稍后重试'
  }
  if (/cannot_unbind|尚未设置登录密码/i.test(haystack)) {
    return '当前账号尚未设置登录密码，为避免失去唯一登录方式，请先在账号安全中设置登录密码后再解绑微信。'
  }
  if (/session|登录态|session_creator|500|502|503|server_error/i.test(haystack)) {
    return '微信登录没有完成，请重试；如多次失败请改用邮箱登录'
  }
  return '微信登录没有完成，请重试；如多次失败请改用邮箱登录'
}

// -----------------------------------------------------------------------------
// 服务端 API 调用封装
// -----------------------------------------------------------------------------

function getApiEndpoint(path: string): string {
  // 如果是本地开发或者通过代理，使用同源或环境变量
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `/api/wechat${cleanPath}`
}

// 发起微信登录
export async function initiateWechatLogin(): Promise<{ url: string }> {
  const redirectTo =
    typeof window !== 'undefined' ? window.location.origin : 'https://www.515171.xyz'
  const res = await fetch(getApiEndpoint('/authorize'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ action: 'login', redirect_to: redirectTo }),
  })
  const data = await res.json()
  if (!res.ok || !data.url) {
    throw new Error(data.message || data.error || '无法获取微信授权链接')
  }
  if (typeof window !== 'undefined') {
    window.location.href = data.url
  }
  return { url: data.url }
}

// 发起微信绑定（需传入当前用户的 access_token）
export async function initiateWechatBind(accessToken: string): Promise<{ url: string }> {
  const redirectTo =
    typeof window !== 'undefined' ? window.location.origin : 'https://www.515171.xyz'
  const res = await fetch(getApiEndpoint('/authorize'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action: 'bind', redirect_to: redirectTo }),
  })
  const data = await res.json()
  if (!res.ok || !data.url) {
    throw new Error(data.message || data.error || '无法获取微信绑定授权链接')
  }
  if (typeof window !== 'undefined') {
    window.location.href = data.url
  }
  return { url: data.url }
}

// 用一次性 ticket 换取合法 Supabase 会话并在客户端激活
export async function exchangeWechatTicket(ticket: string): Promise<{ userId: string }> {
  const res = await fetch(getApiEndpoint('/exchange-ticket'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket }),
  })
  const data = await res.json()
  if (!res.ok || !data.session) {
    throw new Error(data.message || data.error || '换取登录会话失败')
  }

  const { error } = await db().auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  })
  if (error) throw error

  return { userId: data.user_id }
}

export type WechatBindingStatus = {
  bound: boolean
  boundAt?: string
  openidMasked?: string
  hasEmailAuth?: boolean
  canUnbind?: boolean
}

// 获取当前用户的微信绑定状态
export async function getWechatBindingStatus(): Promise<WechatBindingStatus> {
  const { data, error } = await db().rpc('get_wechat_binding_status')
  if (error) throw error
  return {
    bound: !!data?.bound,
    boundAt: data?.bound_at,
    openidMasked: data?.openid_masked,
    hasEmailAuth: !!data?.has_email_auth,
    canUnbind: !!data?.can_unbind,
  }
}

// 解除当前用户的微信绑定
export async function unbindWechat(): Promise<void> {
  const { error } = await db().rpc('unbind_wechat_identity')
  if (error) {
    throw new Error(describeWechatError(error))
  }
}
