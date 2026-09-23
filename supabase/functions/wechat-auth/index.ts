// 微信快捷登录与身份绑定服务（BIBU 独立服务，不依赖 Supabase Custom OAuth Provider）
//
// 架构概述：
// 1. /authorize        —— 客户端发起微信授权（login 或 bind），记录 flow 与防 CSRF state，302 或返回微信授权链接
// 2. /callback         —— 微信回调处理：校验并原子消费 state、换取微信 token/openid/unionid，
//                         bind 模式下原子绑定；login 模式下匹配已有账号或安全建档，签发一次性 ticket
// 3. /exchange-ticket  —— 客户端持一次性 ticket 原子换取合法 Supabase 会话（Session）
// 4. /status           —— 查询当前已登录用户的微信绑定状态
// 5. /unbind           —— 解绑当前用户的微信（需具备可用密码或其他登录凭据）

import { createClient } from 'npm:@supabase/supabase-js@2'

const WECHAT_QR_URL = 'https://open.weixin.qq.com/connect/qrconnect'
const WECHAT_MP_URL = 'https://open.weixin.qq.com/connect/oauth2/authorize'
const WECHAT_TOKEN_URL = 'https://api.weixin.qq.com/sns/oauth2/access_token'
const WECHAT_USERINFO_URL = 'https://api.weixin.qq.com/sns/userinfo'

const FLOW_TTL_SECONDS = 600
const TICKET_TTL_SECONDS = 300
const WECHAT_API_TIMEOUT_MS = 10_000

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function redirect(url: string) {
  return new Response(null, {
    status: 302,
    headers: { ...corsHeaders, Location: url },
  })
}

function randomHex(bytes = 32): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
}

function getAdminClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function isAllowedRedirect(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.origin === 'https://www.515171.xyz') return true
    if (parsed.origin === 'http://localhost:5173' || parsed.origin === 'http://127.0.0.1:5173') return true
    if (parsed.hostname.endsWith('.vercel.app')) return true
    return false
  } catch {
    return false
  }
}

function sanitizeRedirectUrl(rawUrl: string | null): string {
  if (rawUrl && isAllowedRedirect(rawUrl)) {
    return rawUrl
  }
  return 'https://www.515171.xyz/'
}

function getWechatConfig() {
  return {
    appId: Deno.env.get('WECHAT_APP_ID')?.trim() || '',
    appSecret: Deno.env.get('WECHAT_APP_SECRET')?.trim() || '',
    mpAppId: Deno.env.get('WECHAT_MP_APP_ID')?.trim() || null,
  }
}

async function getUserFromAuthHeader(request: Request) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) return null
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const admin = getAdminClient()
  const { data: { user }, error } = await admin.auth.getUser(token)
  if (error || !user) return null
  return user
}

// -----------------------------------------------------------------------------
// 1. 发起授权
// -----------------------------------------------------------------------------
async function handleAuthorize(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const isPost = request.method === 'POST'
  let action = 'login'
  let redirectToRaw: string | null = null

  if (isPost) {
    try {
      const body = await request.json()
      action = body.action === 'bind' ? 'bind' : 'login'
      redirectToRaw = body.redirect_to || null
    } catch {
      // ignore
    }
  } else {
    action = url.searchParams.get('action') === 'bind' ? 'bind' : 'login'
    redirectToRaw = url.searchParams.get('redirect_to')
  }

  const redirectTo = sanitizeRedirectUrl(redirectToRaw)
  let bindUserId: string | null = null

  if (action === 'bind') {
    const user = await getUserFromAuthHeader(request)
    if (!user) {
      return json({ error: 'unauthorized', message: '绑定微信需要先登录邮箱账号' }, 401)
    }
    bindUserId = user.id
  }

  const config = getWechatConfig()
  if (!config.appId) {
    return json({
      error: 'wechat_not_configured',
      message: '微信登录服务尚未配置 AppID，请联系管理员在 Supabase 后台设置 WECHAT_APP_ID',
    }, 503)
  }

  const state = randomHex(32)
  const admin = getAdminClient()

  const expiresAt = new Date(Date.now() + FLOW_TTL_SECONDS * 1000).toISOString()
  const { error: insertError } = await admin.from('wechat_auth_flows').insert({
    state,
    action,
    user_id: bindUserId,
    redirect_to: redirectTo,
    expires_at: expiresAt,
  })

  if (insertError) {
    return json({ error: 'db_error', message: '无法记录授权会话流程' }, 500)
  }

  // 计算微信回调地址
  // 微信授权回调域必须是审核通过的正式备案域名（如 www.515171.xyz）
  const callbackUrl = 'https://www.515171.xyz/api/wechat/callback'

  const ua = request.headers.get('user-agent') || ''
  const inWechat = /MicroMessenger/i.test(ua)
  const useMp = inWechat && !!config.mpAppId
  const authorizeBase = useMp ? WECHAT_MP_URL : WECHAT_QR_URL
  const authUrl = new URL(authorizeBase)
  authUrl.searchParams.set('appid', useMp ? config.mpAppId! : config.appId)
  authUrl.searchParams.set('redirect_uri', callbackUrl)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', useMp ? 'snsapi_userinfo' : 'snsapi_login')
  authUrl.searchParams.set('state', state)
  authUrl.hash = 'wechat_redirect'

  const wantsJson = isPost || request.headers.get('accept')?.includes('application/json')
  if (wantsJson) {
    return json({ url: authUrl.toString(), state })
  }
  return redirect(authUrl.toString())
}

// -----------------------------------------------------------------------------
// 2. 微信回调
// -----------------------------------------------------------------------------
async function handleCallback(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const state = url.searchParams.get('state') || ''
  const code = url.searchParams.get('code') || ''
  const wxError = url.searchParams.get('error')

  const admin = getAdminClient()

  // 1. 数据库原子消费 state
  const { data: flows, error: flowError } = await admin.rpc('consume_wechat_auth_flow', {
    p_state: state,
  })

  const flow = (Array.isArray(flows) && flows.length > 0) ? flows[0] : null
  if (flowError || !flow) {
    const fallback = sanitizeRedirectUrl(null)
    const errTarget = new URL(fallback)
    errTarget.hash = '#auth?wechat_error=invalid_state'
    return redirect(errTarget.toString())
  }

  const targetUrl = new URL(flow.redirect_to)
  const targetHashPrefix = flow.action === 'bind' ? '#settings' : '#auth'

  // 2. 用户取消授权或微信返回错误
  if (wxError || !code) {
    targetUrl.hash = `${targetHashPrefix}?wechat_error=access_denied`
    return redirect(targetUrl.toString())
  }

  const config = getWechatConfig()
  if (!config.appId || !config.appSecret) {
    targetUrl.hash = `${targetHashPrefix}?wechat_error=server_not_configured`
    return redirect(targetUrl.toString())
  }

  // 3. 服务端向微信换取 access_token 与 openid / unionid
  const tokenUrl = new URL(WECHAT_TOKEN_URL)
  tokenUrl.searchParams.set('appid', config.appId)
  tokenUrl.searchParams.set('secret', config.appSecret)
  tokenUrl.searchParams.set('code', code)
  tokenUrl.searchParams.set('grant_type', 'authorization_code')

  let tokenData: Record<string, unknown>
  try {
    const resp = await fetch(tokenUrl.toString(), {
      signal: AbortSignal.timeout(WECHAT_API_TIMEOUT_MS),
    })
    tokenData = await resp.json()
  } catch {
    targetUrl.hash = `${targetHashPrefix}?wechat_error=wechat_timeout`
    return redirect(targetUrl.toString())
  }

  if (!tokenData || tokenData.errcode) {
    targetUrl.hash = `${targetHashPrefix}?wechat_error=wechat_api_error&wechat_errcode=${tokenData?.errcode ?? ''}`
    return redirect(targetUrl.toString())
  }

  const openid = String(tokenData.openid || '').trim()
  let unionid = tokenData.unionid ? String(tokenData.unionid).trim() : null
  const accessToken = String(tokenData.access_token || '').trim()

  if (!openid) {
    targetUrl.hash = `${targetHashPrefix}?wechat_error=missing_openid`
    return redirect(targetUrl.toString())
  }

  // 如果 token 响应中未带 unionid，且有 access_token，尝试请求 userinfo 进一步获取 unionid
  if (!unionid && accessToken) {
    try {
      const uInfoUrl = new URL(WECHAT_USERINFO_URL)
      uInfoUrl.searchParams.set('access_token', accessToken)
      uInfoUrl.searchParams.set('openid', openid)
      const uResp = await fetch(uInfoUrl.toString(), {
        signal: AbortSignal.timeout(WECHAT_API_TIMEOUT_MS),
      })
      const uData = await uResp.json()
      if (uData && uData.unionid) {
        unionid = String(uData.unionid).trim()
      }
    } catch {
      // 获取 userinfo 失败时不阻断，继续使用 openid
    }
  }

  // 4. 原子执行身份判定与绑定/建档
  if (flow.action === 'bind') {
    // 绑定流程
    const { error: bindError } = await admin.rpc('resolve_or_bind_wechat_identity', {
      p_action: 'bind',
      p_bind_user_id: flow.user_id,
      p_app_id: config.appId,
      p_openid: openid,
      p_unionid: unionid,
      p_new_user_id: null,
    })

    if (bindError) {
      if (bindError.code === '23505' || /已经绑定了另一个/i.test(bindError.message)) {
        targetUrl.hash = `#settings?wechat_error=identity_already_bound`
      } else {
        targetUrl.hash = `#settings?wechat_error=bind_failed`
      }
      return redirect(targetUrl.toString())
    }

    targetUrl.hash = `#settings?wechat_bind=success`
    return redirect(targetUrl.toString())
  }

  // 登录流程
  // 4.1 先尝试解析是否已有账号
  const { data: resolveRows, error: resolveErr } = await admin.rpc('resolve_or_bind_wechat_identity', {
    p_action: 'login',
    p_bind_user_id: null,
    p_app_id: config.appId,
    p_openid: openid,
    p_unionid: unionid,
    p_new_user_id: null,
  })

  let finalUserId: string | null = null
  if (!resolveErr && Array.isArray(resolveRows) && resolveRows.length > 0) {
    finalUserId = resolveRows[0].resolved_user_id
  }

  // 4.2 若尚未绑定任何已有账号，服务端执行可重复安全建档
  if (!finalUserId) {
    const identitySlug = (unionid || openid).slice(-12).replace(/[^a-zA-Z0-9]/g, '')
    const placeholderEmail = `wx_${identitySlug}_${randomHex(4)}@auth.bibu.space`
    const dummyPassword = randomHex(32)

    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
      email: placeholderEmail,
      password: dummyPassword,
      email_confirm: true,
      user_metadata: {
        created_via: 'wechat_web_signin',
      },
    })

    if (createError || !newUser?.user?.id) {
      targetUrl.hash = `#auth?wechat_error=user_creation_failed`
      return redirect(targetUrl.toString())
    }

    finalUserId = newUser.user.id

    // 将新建立的 user_id 写入微信映射表
    const { error: linkErr } = await admin.rpc('resolve_or_bind_wechat_identity', {
      p_action: 'login',
      p_bind_user_id: null,
      p_app_id: config.appId,
      p_openid: openid,
      p_unionid: unionid,
      p_new_user_id: finalUserId,
    })

    if (linkErr) {
      targetUrl.hash = `#auth?wechat_error=link_failed`
      return redirect(targetUrl.toString())
    }
  }

  // 5. 为 finalUserId 生成一次性登录 ticket
  const ticket = randomHex(32)
  const ticketExpiresAt = new Date(Date.now() + TICKET_TTL_SECONDS * 1000).toISOString()
  const { error: ticketError } = await admin.from('wechat_login_tickets').insert({
    ticket,
    user_id: finalUserId,
    expires_at: ticketExpiresAt,
  })

  if (ticketError) {
    targetUrl.hash = `#auth?wechat_error=ticket_creation_failed`
    return redirect(targetUrl.toString())
  }

  targetUrl.hash = `#auth?wechat_ticket=${ticket}`
  return redirect(targetUrl.toString())
}

// -----------------------------------------------------------------------------
// 3. 换取 Supabase Session
// -----------------------------------------------------------------------------
async function handleExchangeTicket(request: Request): Promise<Response> {
  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid_json', message: '请求格式无效' }, 400)
  }

  const ticket = typeof body.ticket === 'string' ? body.ticket.trim() : ''
  if (!ticket) {
    return json({ error: 'missing_ticket', message: '缺少登录票据' }, 400)
  }

  const admin = getAdminClient()

  // 1. 数据库原子消费 ticket
  const { data: userId, error: consumeError } = await admin.rpc('consume_wechat_login_ticket', {
    p_ticket: ticket,
  })

  if (consumeError || !userId) {
    return json({ error: 'invalid_ticket', message: '登录票据已失效或已使用，请重新登录' }, 400)
  }

  // 2. 获取该用户的真实 email
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId)
  if (userError || !userData?.user?.email) {
    return json({ error: 'user_not_found', message: '无法获取登录账号信息' }, 500)
  }

  const email = userData.user.email

  // 3. 通过 admin.generateLink 生成 magiclink 凭据
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (linkError || !linkData?.properties?.hashed_token) {
    return json({ error: 'session_generation_failed', message: '无法签发登录凭证' }, 500)
  }

  // 4. 服务端用公开 anon key 换取合法 Supabase 会话
  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const publicClient = createClient(url, anonKey, { auth: { persistSession: false } })

  const { data: verifyData, error: verifyError } = await publicClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  })

  if (verifyError || !verifyData?.session) {
    return json({ error: 'exchange_failed', message: '换取登录会话失败' }, 500)
  }

  return json({
    user_id: userId,
    session: verifyData.session,
  })
}

// -----------------------------------------------------------------------------
// 4. 查询当前用户绑定状态
// -----------------------------------------------------------------------------
async function handleStatus(request: Request): Promise<Response> {
  const user = await getUserFromAuthHeader(request)
  if (!user) {
    return json({ error: 'unauthorized', message: '请先登录' }, 401)
  }

  const token = request.headers.get('Authorization')!.replace(/^Bearer\s+/i, '').trim()
  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })

  const { data, error } = await callerClient.rpc('get_wechat_binding_status')
  if (error) {
    return json({ error: 'db_error', message: error.message }, 500)
  }

  return json(data || { bound: false })
}

// -----------------------------------------------------------------------------
// 5. 解除微信绑定
// -----------------------------------------------------------------------------
async function handleUnbind(request: Request): Promise<Response> {
  const user = await getUserFromAuthHeader(request)
  if (!user) {
    return json({ error: 'unauthorized', message: '请先登录' }, 401)
  }

  const token = request.headers.get('Authorization')!.replace(/^Bearer\s+/i, '').trim()
  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })

  const { error } = await callerClient.rpc('unbind_wechat_identity')
  if (error) {
    return json({ error: 'unbind_failed', message: error.message }, 400)
  }

  return json({ success: true })
}

// -----------------------------------------------------------------------------
// 主分发入口
// -----------------------------------------------------------------------------
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(request.url)
  // 提取路径最后一段，支持 /api/wechat/xxx、/functions/v1/wechat-auth/xxx、/wechat-oauth/xxx
  const pathParts = url.pathname.split('/').filter(Boolean)
  const action = pathParts[pathParts.length - 1] || ''

  try {
    switch (action) {
      case 'authorize':
        return await handleAuthorize(request)
      case 'callback':
        return await handleCallback(request)
      case 'exchange-ticket':
        if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
        return await handleExchangeTicket(request)
      case 'status':
        return await handleStatus(request)
      case 'unbind':
        if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
        return await handleUnbind(request)
      default:
        // 兼容带 query 的主路径
        if (url.searchParams.has('code') || url.searchParams.has('state')) {
          return await handleCallback(request)
        }
        return json({ error: 'not_found', path: url.pathname }, 404)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: 'internal_error', message: msg }, 500)
  }
})
