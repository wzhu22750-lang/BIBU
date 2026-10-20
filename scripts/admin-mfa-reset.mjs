#!/usr/bin/env node
/**
 * 运维侧重置某位管理员的 TOTP 验证器。
 *
 * 需要环境变量（只放在受信任的服务端 shell/CI 中，绝不写入仓库）：
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ADMIN_USER_ID            已在 admin_members 中的用户 UUID
 *
 * 用法：ADMIN_USER_ID=... node scripts/admin-mfa-reset.mjs --yes
 *
 * 只删除该用户的 TOTP 因子，不创建新账号、不修改密码、不打印因子密钥。
 * 删除后旧会话无法通过 admin-api 的 MFA 校验，用户需重新登录并绑定验证器。
 */
const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const userId = (process.env.ADMIN_USER_ID || '').trim()
const confirmed = process.argv.includes('--yes')

function fail(message) {
  console.error(`[admin-mfa-reset] ${message}`)
  process.exit(1)
}

if (!url || !serviceKey) {
  fail('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY；请在受信任的服务端环境中临时设置。')
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
  fail('ADMIN_USER_ID 必须是用户 UUID。')
}
if (!confirmed) {
  fail('请追加 --yes 明确执行；这会删除该管理员的全部 TOTP 因子。')
}

const headers = {
  apikey: serviceKey,
  authorization: `Bearer ${serviceKey}`,
}

async function request(path, options = {}) {
  const response = await fetch(`${url}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  })
  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }
  if (!response.ok) {
    throw new Error(payload?.message || payload?.msg || `HTTP ${response.status}`)
  }
  return payload
}

async function rpc(name, body) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await response.text()
  let payload = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }
  if (!response.ok) throw new Error(payload?.message || `HTTP ${response.status}`)
  return payload
}

try {
  const actor = await rpc('admin_actor', { p_user_id: userId, p_session_id: null })
  if (!actor?.found) {
    fail('目标用户不是管理台成员，脚本拒绝操作。')
  }

  const listed = await request(`/auth/v1/admin/users/${userId}/factors`)
  const factors = Array.isArray(listed) ? listed : listed?.factors || []
  const totp = factors.filter((factor) => factor.factor_type === 'totp')

  if (totp.length === 0) {
    console.log('[admin-mfa-reset] 该管理员当前没有 TOTP 因子，无需操作。')
    process.exit(0)
  }

  for (const factor of totp) {
    await request(`/auth/v1/admin/users/${userId}/factors/${factor.id}`, { method: 'DELETE' })
    console.log(`[admin-mfa-reset] 已删除 TOTP 因子 ${String(factor.id).slice(0, 8)}…`)
  }

  await rpc('admin_record_system_action', {
    p_action: 'admin.mfa_reset',
    p_target_type: 'admin_member',
    p_target_id: userId,
    p_reason: '管理员验证器丢失，由受信任的服务端脚本重置',
    p_summary: { removed_totp_factors: totp.length },
  })

  console.log('[admin-mfa-reset] 完成。请让该管理员重新登录并绑定新的验证器。')
  console.log('[admin-mfa-reset] 请立即删除当前 shell 中的 service_role 环境变量。')
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
