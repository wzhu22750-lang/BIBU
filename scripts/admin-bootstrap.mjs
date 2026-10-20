#!/usr/bin/env node
/**
 * 一次性初始化首位 owner。
 *
 * 需要环境变量（只放在受信任的服务端 shell/CI 中，绝不写入仓库）：
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   ADMIN_USER_ID            已存在且邮箱已验证的用户 UUID
 *   ADMIN_DISPLAY_NAME       可选，审计与工单中显示的名称
 *
 * 用法：ADMIN_USER_ID=... ADMIN_DISPLAY_NAME=... node scripts/admin-bootstrap.mjs --yes
 * 脚本只调用 admin_bootstrap_status / admin_bootstrap_owner，不会创建用户或设置密码。
 */
const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const userId = (process.env.ADMIN_USER_ID || '').trim()
const displayName = (process.env.ADMIN_DISPLAY_NAME || '').trim()
const confirmed = process.argv.includes('--yes')

function fail(message) {
  console.error(`[admin-bootstrap] ${message}`)
  process.exit(1)
}

if (!url || !serviceKey) {
  fail('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY；请在受信任的服务端环境中临时设置。')
}
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
  fail('ADMIN_USER_ID 必须是现有用户的 UUID，而不是邮箱或显示名称。')
}
if (!confirmed) {
  fail('请追加 --yes 明确执行一次性初始化；脚本会写入 admin_members 与审计日志。')
}

async function rpc(name, body) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
    },
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
  if (!response.ok) {
    throw new Error(payload?.message || `HTTP ${response.status}`)
  }
  return payload
}

try {
  const status = await rpc('admin_bootstrap_status', {})
  if (status?.initialized) {
    fail('后台已初始化，脚本拒绝重复授予 owner。请在管理台“管理员与权限”中调整成员。')
  }
  if (Number(status?.active_admins || 0) > 0) {
    fail('检测到已有有效管理员，停止初始化。')
  }

  const result = await rpc('admin_bootstrap_owner', {
    p_user_id: userId,
    p_display_name: displayName,
  })
  console.log(
    `[admin-bootstrap] 已初始化 owner ${userId.slice(0, 8)}…（${result?.status || 'active'}）。`,
  )
  console.log('[admin-bootstrap] 下一步：该账号登录管理台，绑定 TOTP 后再访问业务数据。')
  console.log('[admin-bootstrap] 请立即删除当前 shell 中的 service_role 环境变量。')
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
