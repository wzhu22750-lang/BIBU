#!/usr/bin/env node
/**
 * 诊断日志与过期幂等记录的保留期清理。
 *
 * 需要环境变量（只放在受信任的调度器/CI 中）：
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RETENTION_DAYS  可选，7–365，默认 30
 *
 * 用法：RETENTION_DAYS=30 node scripts/prune-admin-diagnostics.mjs --yes
 *
 * 该脚本只调用 prune_admin_diagnostics；删除的是超过保留期的诊断日志以及
 * 已过期的幂等记录。失败时以非零状态退出，供调度器告警。
 */
const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const retention = Number(process.env.RETENTION_DAYS || '30')
const confirmed = process.argv.includes('--yes')

function fail(message) {
  console.error(`[prune-admin-diagnostics] ${message}`)
  process.exit(1)
}

if (!url || !serviceKey) {
  fail('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY；请在受信任的调度环境中临时注入。')
}
if (!Number.isInteger(retention) || retention < 7 || retention > 365) {
  fail('RETENTION_DAYS 必须是 7–365 的整数。')
}
if (!confirmed) {
  fail('请追加 --yes 明确执行清理；该操作会删除超过保留期的诊断日志。')
}

try {
  const response = await fetch(`${url}/rest/v1/rpc/prune_admin_diagnostics`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_retention_days: retention }),
  })
  const text = await response.text()
  if (!response.ok) {
    let message = `HTTP ${response.status}`
    try {
      const payload = JSON.parse(text)
      message = payload?.message || message
    } catch {
      // 保留 HTTP 状态，避免把供应商原始响应打印到调度日志。
    }
    throw new Error(message)
  }
  const deleted = Number.parseFloat(text) || 0
  console.log(
    `[prune-admin-diagnostics] 已删除 ${deleted} 条超过 ${retention} 天的诊断日志，并清理过期幂等记录。`,
  )
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}
