// 微信快捷登录 · Supabase Custom OAuth compatibility bridge
//
// 微信开放平台的 OAuth 接口与 Supabase Custom OAuth 要求的标准 OAuth2 接口有差异：
//   - token 端点是 GET、凭据放 query，且响应带 openid/unionid（非标准字段）
//   - userinfo 必须携带 openid，且不返回 sub/email
// 本 Edge Function 把微信包装成标准 OAuth2 provider 供 GoTrue 调用：
//
//   BIBU Web ── signInWithOAuth ──▶ GoTrue ──▶ /authorize（本函数）
//                                                │ 302
//                                                ▼
//                                          微信授权页（qrconnect / 微信内 snsapi）
//                                                │ code + state
//                                                ▼
//                                          /callback（本函数）：换微信 token、取 unionid/openid、
//                                                签发一次性授权码 → 302 到 GoTrue /auth/v1/callback
//   GoTrue ── POST /token（授权码 + PKCE verifier）──▶ 一次性 Bearer token
//   GoTrue ── GET /userinfo（Bearer）──▶ { sub, name, picture }（无 email）
//
// 身份标识：优先 unionid（wxu_ 前缀），没有 unionid 时退回 openid（wxo_ 前缀）。
// nickname / 头像只作为展示资料，绝不参与身份判定。
//
// 配置（Edge Function Secrets，见 docs/wechat-web-login.md）：
//   WECHAT_APP_ID / WECHAT_APP_SECRET        微信开放平台「网站应用」凭据（绝不下发前端）
//   WECHAT_OAUTH_CLIENT_ID / WECHAT_OAUTH_CLIENT_SECRET
//                                            本 bridge 的 OAuth client 凭据，
//                                            与 Supabase Custom OAuth 表单里填的一致
//   WECHAT_MP_APP_ID（可选）                  公众号 AppID：微信内浏览器登录用，
//                                            需与网站应用绑定在同一个开放平台账号（共享 unionid）
//
// 部署时必须为该函数关闭 JWT 校验（supabase/config.toml 中 verify_jwt = false），
// 因为 GoTrue 的 /token、/userinfo 调用不带用户 JWT，浏览器跳转 /authorize 时用户尚未登录。

import { createClient } from 'npm:@supabase/supabase-js@2'

const WECHAT_AUTHORIZE_QR = 'https://open.weixin.qq.com/connect/qrconnect'
const WECHAT_AUTHORIZE_MP = 'https://open.weixin.qq.com/connect/oauth2/authorize'
const WECHAT_TOKEN_URL = 'https://api.weixin.qq.com/sns/oauth2/access_token'
const WECHAT_USERINFO_URL = 'https://api.weixin.qq.com/sns/userinfo'

// 一次性凭据的有效期：整个链路在几分钟内完成，不需要更长的窗口。
const FLOW_TTL_MS = 10 * 60 * 1000
const TOKEN_TTL_SECONDS = 600
const WECHAT_API_TIMEOUT_MS = 10_000

type FlowRow = {
  id: string
  state: string
  code_challenge: string
  code_challenge_method: string
  redirect_uri: string
  original_state: string
  wechat_payload: Record<string, unknown> | null
  auth_code: string | null
  auth_code_expires_at: string | null
  access_token: string | null
  access_token_expires_at: string | null
  consumed_at: string | null
}

type WechatConfig = {
  appId: string
  appSecret: string
  clientId: string
  clientSecret: string
  mpAppId: string | null
}

function requireWechatConfig(): WechatConfig {
  const appId = Deno.env.get('WECHAT_APP_ID')?.trim() || ''
  const appSecret = Deno.env.get('WECHAT_APP_SECRET')?.trim() || ''
  const clientId = Deno.env.get('WECHAT_OAUTH_CLIENT_ID')?.trim() || ''
  const clientSecret = Deno.env.get('WECHAT_OAUTH_CLIENT_SECRET')?.trim() || ''
  const mpAppId = Deno.env.get('WECHAT_MP_APP_ID')?.trim() || null
  if (!appId || !appSecret || !clientId || !clientSecret) {
    throw new BridgeError('server_error', '微信登录服务未配置，请管理员设置 Edge Function Secrets')
  }
  return { appId, appSecret, clientId, clientSecret, mpAppId }
}

class BridgeError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

function admin() {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new BridgeError('server_error', '缺少 SUPABASE_URL / SERVICE_ROLE_KEY')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function redirect(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } })
}

function randomHex(bytes = 32) {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
}

// 恒时比较：把两侧都哈希成定长摘要再比较，避免时序侧信道。
async function timingSafeEqual(a: string, b: string) {
  const encoder = new TextEncoder()
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ])
  const va = new Uint8Array(da)
  const vb = new Uint8Array(db)
  let diff = 0
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i]
  return diff === 0
}

function base64url(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function verifyPkce(verifier: string, storedChallenge: string) {
  if (!verifier || verifier.length < 43 || verifier.length > 128) return false
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return timingSafeEqual(base64url(digest), storedChallenge)
}

async function fetchJson(url: string) {
  let response: Response
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(WECHAT_API_TIMEOUT_MS) })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new BridgeError('wechat_timeout', '微信服务连接超时，请稍后重试')
    }
    throw new BridgeError('wechat_network', '微信服务连接失败，请稍后重试')
  }
  const text = await response.text()
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new BridgeError('wechat_response', '微信服务返回异常，请稍后重试')
  }
}

function wechatErrorPayload(payload: Record<string, unknown>) {
  const errcode = Number(payload.errcode ?? 0)
  if (errcode !== 0) {
    const errmsg = String(payload.errmsg ?? '')
    // 10002/10003/10006 等：appid/secret 配置错误；40163：code 已被使用
    throw new BridgeError(
      'wechat_api_error',
      `微信接口错误 ${errcode}${errmsg ? `：${errmsg}` : ''}`,
    )
  }
  return payload
}

async function insertFlow(flow: {
  state: string
  codeChallenge: string
  redirectUri: string
  originalState: string
}) {
  const { error } = await admin()
    .schema('private')
    .from('wechat_oauth_flows')
    .insert({
      state: flow.state,
      code_challenge: flow.codeChallenge,
      code_challenge_method: 'S256',
      redirect_uri: flow.redirectUri,
      original_state: flow.originalState,
    })
  if (error) throw new BridgeError('server_error', '无法记录登录流程，请稍后重试')
}

async function findFlowBy(column: 'state' | 'auth_code' | 'access_token', value: string) {
  const { data, error } = await admin()
    .schema('private')
    .from('wechat_oauth_flows')
    .select('*')
    .eq(column, value)
    .maybeSingle<FlowRow>()
  if (error) throw new BridgeError('server_error', '登录流程查询失败，请稍后重试')
  return data
}

async function updateFlow(id: string, patch: Record<string, unknown>) {
  const { error } = await admin()
    .schema('private')
    .from('wechat_oauth_flows')
    .update(patch)
    .eq('id', id)
  if (error) throw new BridgeError('server_error', '登录流程更新失败，请稍后重试')
}

async function cleanupExpiredFlows() {
  await admin()
    .schema('private')
    .from('wechat_oauth_flows')
    .delete()
    .lt('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
}

// ---------------------------------------------------------------- /authorize

async function handleAuthorize(request: Request) {
  const cfg = requireWechatConfig()
  const params = new URL(request.url).searchParams
  const clientId = params.get('client_id') || ''
  const redirectUri = params.get('redirect_uri') || ''
  const state = params.get('state') || ''
  const responseType = params.get('response_type') || ''
  const challenge = params.get('code_challenge') || ''
  const challengeMethod = params.get('code_challenge_method') || 'S256'

  // client_id 不匹配：请求不是我们的 GoTrue 发出的，直接拒绝（不能信任其 redirect_uri）。
  if (!(await timingSafeEqual(clientId, cfg.clientId))) {
    return json({ error: 'invalid_client', error_description: 'unknown client_id' }, 401)
  }
  // redirect_uri 只允许 GoTrue 的授权回调端点，防止开放重定向。
  const allowedCallback = `${Deno.env.get('SUPABASE_URL')!.replace(/\/$/, '')}/auth/v1/callback`
  if (redirectUri !== allowedCallback) {
    return json({ error: 'invalid_request', error_description: 'untrusted redirect_uri' }, 400)
  }
  if (responseType !== 'code' || !state || state.length > 512) {
    return json({ error: 'invalid_request', error_description: 'bad authorize request' }, 400)
  }
  if (!challenge || challengeMethod !== 'S256') {
    return json({ error: 'invalid_request', error_description: 'PKCE S256 required' }, 400)
  }

  await cleanupExpiredFlows()
  const flowState = randomHex(32)
  await insertFlow({
    state: flowState,
    codeChallenge: challenge,
    redirectUri,
    originalState: state,
  })

  // 微信内浏览器无法扫码：配置了公众号 AppID 时改用微信内授权（同一开放平台账号 → 同一 unionid）。
  const ua = request.headers.get('user-agent') || ''
  const inWechat = /MicroMessenger/i.test(ua)
  const useMp = inWechat && cfg.mpAppId
  const appid = useMp ? cfg.mpAppId! : cfg.appId
  const scope = useMp ? 'snsapi_userinfo' : 'snsapi_login'
  const authorizeUrl = new URL(useMp ? WECHAT_AUTHORIZE_MP : WECHAT_AUTHORIZE_QR)
  authorizeUrl.searchParams.set('appid', appid)
  // 微信授权回调域必须与本函数对外的域名一致（推荐经 Vercel rewrite 的正式域名）。
  authorizeUrl.searchParams.set('redirect_uri', `${new URL(request.url).origin}/callback`)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('scope', scope)
  authorizeUrl.searchParams.set('state', flowState)
  authorizeUrl.hash = 'wechat_redirect'
  return redirect(authorizeUrl.toString())
}

// ----------------------------------------------------------------- /callback

function backToSupabase(
  flow: Pick<FlowRow, 'redirect_uri' | 'original_state'> | null,
  extra: Record<string, string>,
) {
  if (!flow) return json({ error: 'invalid_request', error_description: 'unknown state' }, 400)
  const target = new URL(flow.redirect_uri)
  for (const [key, value] of Object.entries(extra)) target.searchParams.set(key, value)
  target.searchParams.set('state', flow.original_state)
  return redirect(target.toString())
}

async function handleCallback(request: Request) {
  const params = new URL(request.url).searchParams
  const state = params.get('state') || ''
  const code = params.get('code') || ''
  const flow = state ? await findFlowBy('state', state) : null
  if (!flow || flow.consumed_at || new Date(flow.created_at).getTime() + FLOW_TTL_MS < Date.now()) {
    // state 未知 / 已消费 / 已过期：回给 GoTrue 一个标准错误，由前端给出友好提示。
    return backToSupabase(flow, {
      error: 'invalid_state',
      error_description: '登录状态已失效，请重新发起微信登录',
    })
  }

  // 用户在微信侧取消授权时，回调会缺少 code。
  if (!code) {
    await updateFlow(flow.id, { consumed_at: new Date().toISOString() })
    return backToSupabase(flow, {
      error: 'access_denied',
      error_description: '已取消微信授权',
    })
  }

  const cfg = requireWechatConfig()
  let tokenPayload: Record<string, unknown>
  try {
    const tokenUrl = new URL(WECHAT_TOKEN_URL)
    tokenUrl.searchParams.set('appid', cfg.appId)
    tokenUrl.searchParams.set('secret', cfg.appSecret)
    tokenUrl.searchParams.set('code', code)
    tokenUrl.searchParams.set('grant_type', 'authorization_code')
    tokenPayload = wechatErrorPayload(await fetchJson(tokenUrl.toString()))
  } catch (error) {
    const message = error instanceof BridgeError ? error.message : '微信登录失败，请稍后重试'
    await updateFlow(flow.id, { consumed_at: new Date().toISOString() })
    return backToSupabase(flow, { error: 'wechat_error', error_description: message })
  }

  const openid = String(tokenPayload.openid ?? '')
  const unionid = typeof tokenPayload.unionid === 'string' ? tokenPayload.unionid : ''
  if (!openid) {
    await updateFlow(flow.id, { consumed_at: new Date().toISOString() })
    return backToSupabase(flow, {
      error: 'wechat_error',
      error_description: '微信没有返回用户身份，请稍后重试',
    })
  }

  // userinfo 仅用于补充昵称/头像，失败不影响登录（身份以 unionid/openid 为准）。
  let nickname = ''
  let avatar = ''
  try {
    const infoUrl = new URL(WECHAT_USERINFO_URL)
    infoUrl.searchParams.set('access_token', String(tokenPayload.access_token ?? ''))
    infoUrl.searchParams.set('openid', openid)
    infoUrl.searchParams.set('lang', 'zh_CN')
    const info = await fetchJson(infoUrl.toString())
    if (Number(info.errcode ?? 0) === 0) {
      nickname = typeof info.nickname === 'string' ? info.nickname : ''
      avatar = typeof info.headimgurl === 'string' ? info.headimgurl : ''
    }
  } catch {
    // 忽略：没有昵称/头像也能完成登录
  }

  // 稳定身份标识：优先 unionid；当前应用场景没有 unionid 时退回 openid。
  const sub = unionid ? `wxu_${unionid}` : `wxo_${openid}`
  const now = new Date()
  const authCode = randomHex(48)
  await updateFlow(flow.id, {
    wechat_payload: {
      sub,
      name: nickname || '微信玩家',
      picture: avatar,
      scope: String(tokenPayload.scope ?? ''),
      updated_at: Math.floor(now.getTime() / 1000),
    },
    auth_code: authCode,
    auth_code_expires_at: new Date(now.getTime() + FLOW_TTL_MS).toISOString(),
    consumed_at: now.toISOString(),
  })
  return backToSupabase(flow, { code: authCode })
}

// -------------------------------------------------------------------- /token

function oauthClientCredentials(request: Request, form: FormData) {
  const header = request.headers.get('authorization') || ''
  if (header.toLowerCase().startsWith('basic ')) {
    try {
      const decoded = atob(header.slice(6).trim())
      const colon = decoded.indexOf(':')
      if (colon > 0) {
        return { clientId: decoded.slice(0, colon), clientSecret: decoded.slice(colon + 1) }
      }
    } catch {
      // fallthrough to form values
    }
  }
  return {
    clientId: String(form.get('client_id') ?? ''),
    clientSecret: String(form.get('client_secret') ?? ''),
  }
}

async function handleToken(request: Request) {
  const cfg = requireWechatConfig()
  const form = await request.formData()
  const grantType = String(form.get('grant_type') ?? '')
  const { clientId, clientSecret } = oauthClientCredentials(request, form)

  if (
    !(await timingSafeEqual(clientId, cfg.clientId)) ||
    !(await timingSafeEqual(clientSecret, cfg.clientSecret))
  ) {
    return json({ error: 'invalid_client', error_description: 'client authentication failed' }, 401)
  }

  if (grantType === 'refresh_token') {
    // 本 bridge 签发的是一次性、短时效、仅供 GoTrue 拉取 userinfo 的 token，
    // 不签发 refresh_token；微信侧 refresh_token 绝不出 bridge。
    return json(
      { error: 'unsupported_grant_type', error_description: 'no refresh tokens are issued' },
      400,
    )
  }
  if (grantType !== 'authorization_code') {
    return json({ error: 'unsupported_grant_type' }, 400)
  }

  const code = String(form.get('code') ?? '')
  const verifier = String(form.get('code_verifier') ?? '')
  const redirectUri = String(form.get('redirect_uri') ?? '')
  const flow = code ? await findFlowBy('auth_code', code) : null
  if (
    !flow ||
    !flow.auth_code_expires_at ||
    new Date(flow.auth_code_expires_at).getTime() < Date.now() ||
    !flow.consumed_at
  ) {
    return json({ error: 'invalid_grant', error_description: 'code expired or unknown' }, 400)
  }
  if (flow.access_token) {
    // 授权码已被使用：拒绝重放。
    return json({ error: 'invalid_grant', error_description: 'code already redeemed' }, 400)
  }
  if (redirectUri !== flow.redirect_uri) {
    return json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' }, 400)
  }
  if (flow.code_challenge_method !== 'S256' || !(await verifyPkce(verifier, flow.code_challenge))) {
    return json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400)
  }

  const accessToken = randomHex(48)
  await updateFlow(flow.id, {
    access_token: accessToken,
    access_token_expires_at: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString(),
  })
  return json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: TOKEN_TTL_SECONDS,
    scope: 'openid profile',
  })
}

// ----------------------------------------------------------------- /userinfo

async function handleUserinfo(request: Request) {
  const header = request.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) return json({ error: 'invalid_token' }, 401)
  const flow = await findFlowBy('access_token', token)
  if (
    !flow ||
    !flow.wechat_payload ||
    !flow.access_token_expires_at ||
    new Date(flow.access_token_expires_at).getTime() < Date.now()
  ) {
    return json({ error: 'invalid_token' }, 401)
  }
  return json(flow.wechat_payload)
}

// --------------------------------------------------------------------- entry

Deno.serve(async (request) => {
  const pathname = new URL(request.url).pathname.replace(/\/+$/, '')
  const route = pathname.replace(/.*\/wechat-oauth/, '') || '/'
  try {
    if (request.method === 'OPTIONS') return json({ ok: true })
    if (request.method === 'GET' && route === '/authorize') return await handleAuthorize(request)
    if (request.method === 'GET' && route === '/callback') return await handleCallback(request)
    if (request.method === 'POST' && route === '/token') return await handleToken(request)
    if (request.method === 'GET' && route === '/userinfo') return await handleUserinfo(request)
    return json({ error: 'not_found' }, 404)
  } catch (error) {
    // 浏览器端点（authorize/callback）出错时把用户带回 GoTrue 回调并附错误说明；
    // 服务端端点（token/userinfo）按 RFC 6749 返回 JSON 错误。
    const message = error instanceof BridgeError ? error.message : '微信登录服务暂时不可用'
    const code = error instanceof BridgeError ? error.code : 'server_error'
    if (route === '/authorize' || route === '/callback') {
      return json({ error: code, error_description: message }, 502)
    }
    return json({ error: code, error_description: message }, 502)
  }
})
