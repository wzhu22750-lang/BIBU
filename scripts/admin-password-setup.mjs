#!/usr/bin/env node
/**
 * 创建或重置管理台专用账号，并可选初始化首位 owner。
 *
 * 需要环境变量（只放在受信任的本机 shell 中，绝不写入仓库）：
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * 可选：
 *   ADMIN_EMAIL          默认 admin@515171.xyz
 *   ADMIN_DISPLAY_NAME   审计与工单中的显示名，默认“管理台所有者”
 *
 * 用法：SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/admin-password-setup.mjs
 * 密码由运行者在终端中输入，脚本不会打印、保存或上传明文密码。
 */
import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { createClient } from '@supabase/supabase-js'

const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '')
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const defaultEmail = (process.env.ADMIN_EMAIL || 'admin@515171.xyz').trim().toLowerCase()
const displayName = (process.env.ADMIN_DISPLAY_NAME || '管理台所有者').trim().slice(0, 60)

function fail(message) {
  console.error(`[admin-password] ${message}`)
  process.exit(1)
}

if (!url || !serviceKey) {
  fail('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY；请在受信任的本机 shell 中临时设置。')
}

function askHidden(label) {
  if (!stdin.isTTY) {
    return Promise.reject(new Error('当前终端不支持隐藏输入，请在交互式终端中运行'))
  }
  return new Promise((resolve, reject) => {
    stdout.write(label)
    let value = ''
    const cleanup = () => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.off('data', onData)
    }
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\u0003') {
          cleanup()
          stdout.write('\n')
          reject(new Error('已取消'))
          return
        }
        if (char === '\r' || char === '\n') {
          cleanup()
          stdout.write('\n')
          resolve(value)
          return
        }
        if (char === '\u007f' || char === '\b') {
          if (value) {
            value = value.slice(0, -1)
            stdout.write('\b \b')
          }
          continue
        }
        if (char >= ' ') {
          value += char
          stdout.write('*')
        }
      }
    }
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    stdin.on('data', onData)
  })
}

async function findUserByEmail(supabase, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`读取账号列表失败：${error.message}`)
    const users = data?.users || []
    const found = users.find((user) => (user.email || '').toLowerCase() === email)
    if (found) return found
    if (users.length < 1000) return null
  }
  return null
}

const readline = createInterface({ input: stdin, output: stdout })
let email = ''
let password = ''
let confirm = ''

try {
  const answer = (await readline.question(`管理员邮箱 [${defaultEmail}]：`)).trim()
  email = (answer || defaultEmail).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('邮箱格式不正确')
} finally {
  readline.close()
}

try {
  password = await askHidden('管理密码：')
  if (!password) fail('管理密码不能为空')
  confirm = await askHidden('再次输入管理密码：')
  if (password !== confirm) fail('两次输入的密码不一致')
  confirm = ''
} catch (error) {
  fail(error instanceof Error ? error.message : String(error))
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

let user = await findUserByEmail(supabase, email)
if (user) {
  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
  })
  if (error) fail(`更新密码失败：${error.message}`)
  console.log(`[admin-password] 已重置 ${email} 的密码（${user.id.slice(0, 8)}…）。`)
} else {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data?.user?.id) fail(`创建管理员账号失败：${error?.message || '未知错误'}`)
  user = data.user
  console.log(`[admin-password] 已创建专用管理员账号 ${email}（${user.id.slice(0, 8)}…）。`)
}

password = ''

const { data: actor, error: actorError } = await supabase.rpc('admin_actor', {
  p_user_id: user.id,
  p_session_id: null,
})
if (actorError) fail(`读取管理员成员失败：${actorError.message}`)

if (!actor?.found) {
  const { data: status, error: statusError } = await supabase.rpc('admin_bootstrap_status')
  if (statusError) fail(`读取初始化状态失败：${statusError.message}`)
  if (status?.initialized) {
    fail(
      `后台已有管理员，但 ${email} 还不在管理员列表。请用现有 owner 登录管理台，在「管理员与权限」中添加该账号。`,
    )
  }
  const { error: bootstrapError } = await supabase.rpc('admin_bootstrap_owner', {
    p_user_id: user.id,
    p_display_name: displayName,
  })
  if (bootstrapError) fail(`初始化 owner 失败：${bootstrapError.message}`)
  console.log('[admin-password] 已将该账号初始化为 owner。')
} else {
  console.log(`[admin-password] 该账号已是管理员（${actor.role} / ${actor.status}）。`)
}

console.log('[admin-password] 完成。打开管理台后只需输入刚才设置的密码。')
console.log('[admin-password] 请立即从当前 shell 中清除 SUPABASE_SERVICE_ROLE_KEY。')
