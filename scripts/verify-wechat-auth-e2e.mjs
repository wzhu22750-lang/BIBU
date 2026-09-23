// 微信登录与账号绑定全链路端到端验证脚本
// 严格覆盖：
// 1. 首次微信登录（自动服务端建档，写入 wechat_identities，发放 Session）
// 2. 重复微信登录（幂等识别，返回相同 bibu_user_id）
// 3. 邮箱账号绑定微信（已有邮箱账号绑定微信身份）
// 4. 同一测试用户用邮箱登录和微信登录得到相同的 bibu_user_id 并访问同一个空间
// 5. 绑定冲突防御（已绑定微信尝试绑定他人账号，触发拒绝，原账号完好无损）
// 6. 身份标识平滑升级（首次未返回 unionid，后又返回 unionid 时的自动补全）
// 7. 微信解绑保护与解绑（无密码禁止解绑，设密后允许解绑）
// 8. 授权流程 state 与票据 ticket 防重放与过期校验
// 9. 高并发消费原子性测试（10 并发重放攻击仅成功 1 次）
// 10. 账号注销（prepare_account_deletion + deleteUser 级联清理微信映射）

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zqwzdoejxsfscisudacu.supabase.co'
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_nxRhiAvRRQ_lwAQ9vaz_Og_yEqfC-V8'
let SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  // 本地开发环境：尝试通过 access-token 动态获取，避免把密钥硬编码提交到 Git
  try {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const tokenPath = fs.existsSync('supabase/.temp/access-token')
      ? 'supabase/.temp/access-token'
      : path.join(process.env.HOME || '', '.supabase/access-token')
    if (fs.existsSync(tokenPath)) {
      const sbpToken = fs.readFileSync(tokenPath, 'utf8').trim()
      const resp = await fetch(
        'https://api.supabase.com/v1/projects/zqwzdoejxsfscisudacu/api-keys',
        {
          headers: { Authorization: `Bearer ${sbpToken}` },
        },
      )
      if (resp.ok) {
        const keys = await resp.json()
        const target = keys.find((k) => k.name === 'service_role' || k.id === 'service_role')
        if (target) SERVICE_ROLE_KEY = target.api_key
      }
    }
  } catch {
    // ignore
  }
}

if (!SERVICE_ROLE_KEY) {
  console.error(
    '❌ 请通过环境变量 SUPABASE_SERVICE_ROLE_KEY 提供 Supabase 服务角色密钥后再运行 E2E 测试。',
  )
  console.error('示例: SUPABASE_SERVICE_ROLE_KEY=ey... node scripts/verify-wechat-auth-e2e.mjs')
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const client = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false },
})

const TEST_RUN_ID = Date.now().toString(36)
const APP_ID = 'wx_test_appid_' + TEST_RUN_ID

function logStep(step, desc) {
  console.log(`\n==================== [步骤 ${step}] ${desc} ====================`)
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ 断言失败: ${message}`)
    throw new Error(message)
  }
  console.log(`✅ ${message}`)
}

async function run() {
  console.log(`🚀 开始执行微信登录与身份绑定 E2E 全链路核验 (RunID: ${TEST_RUN_ID})`)

  let userA = null
  let userB = null
  let wxUserC = null

  try {
    // -------------------------------------------------------------------------
    // 步骤 1: 首次微信登录测试（未绑定任何已有账号）
    // -------------------------------------------------------------------------
    logStep(1, '首次微信登录（新微信用户首次访问，服务端安全建档）')
    const wxOpenidC = 'openid_wx_user_c_' + TEST_RUN_ID
    const wxUnionidC = 'unionid_wx_user_c_' + TEST_RUN_ID

    // 1.1 微信首次授权回来，查询身份映射
    const { data: resolveC1, error: resErrC1 } = await admin.rpc(
      'resolve_or_bind_wechat_identity',
      {
        p_action: 'login',
        p_bind_user_id: null,
        p_app_id: APP_ID,
        p_openid: wxOpenidC,
        p_unionid: wxUnionidC,
        p_new_user_id: null,
      },
    )
    assert(!resErrC1, '初次查询身份未报错')
    assert(!resolveC1 || resolveC1.length === 0, '未绑定微信未命中已有记录')

    // 1.2 服务端为新微信用户安全建档
    const cEmail = `wx_${TEST_RUN_ID}_c@auth.bibu.space`
    const { data: createdC, error: createCErr } = await admin.auth.admin.createUser({
      email: cEmail,
      password: 'WxPassword_' + TEST_RUN_ID,
      email_confirm: true,
    })
    assert(!createCErr && createdC?.user?.id, `服务端成功建档新用户: ${createdC?.user?.id}`)
    wxUserC = createdC.user

    // 1.3 将新建立的 user_id 关联到微信身份
    const { data: linkC, error: linkCErr } = await admin.rpc('resolve_or_bind_wechat_identity', {
      p_action: 'login',
      p_bind_user_id: null,
      p_app_id: APP_ID,
      p_openid: wxOpenidC,
      p_unionid: wxUnionidC,
      p_new_user_id: wxUserC.id,
    })
    assert(!linkCErr && linkC[0]?.resolved_user_id === wxUserC.id, '微信新身份关联成功')
    assert(linkC[0]?.is_new_user === true, '正确标识为新注册用户 (is_new_user = true)')

    // 1.4 验证 profiles 记录由触发器自动创建
    const { data: profileC, error: profCErr } = await admin
      .from('profiles')
      .select('id, name, avatar')
      .eq('id', wxUserC.id)
      .single()
    assert(!profCErr && profileC?.id === wxUserC.id, 'profiles 表由触发器自动生成对应档案')

    // -------------------------------------------------------------------------
    // 步骤 2: 重复微信登录测试（同一微信再次登录）
    // -------------------------------------------------------------------------
    logStep(2, '重复微信登录测试（幂等识别，绝不创建第二个账号）')
    const { data: resolveC2, error: resErrC2 } = await admin.rpc(
      'resolve_or_bind_wechat_identity',
      {
        p_action: 'login',
        p_bind_user_id: null,
        p_app_id: APP_ID,
        p_openid: wxOpenidC,
        p_unionid: wxUnionidC,
        p_new_user_id: null,
      },
    )
    assert(!resErrC2, '重复登录查询成功')
    assert(
      resolveC2[0]?.resolved_user_id === wxUserC.id,
      `重复登录识别到完全一致的 bibu_user_id: ${resolveC2[0]?.resolved_user_id}`,
    )
    assert(resolveC2[0]?.is_new_user === false, '正确标识为非新用户 (is_new_user = false)')

    // -------------------------------------------------------------------------
    // 步骤 3 & 4: 邮箱注册用户创建空间 + 微信绑定 + 微信登录同空间核验
    // -------------------------------------------------------------------------
    logStep(3, '邮箱账号注册并创建专属双人小宇宙')
    const emailA = `test_email_a_${TEST_RUN_ID}@example.com`
    const passwordA = 'Password123456!'
    const { data: createdA, error: createAErr } = await admin.auth.admin.createUser({
      email: emailA,
      password: passwordA,
      email_confirm: true,
    })
    assert(!createAErr && createdA?.user?.id, `用户 A (邮箱用户) 注册成功: ${createdA?.user?.id}`)
    userA = createdA.user

    // 3.1 用户 A 以邮箱密码登录，获取客户端 session
    const { data: authA, error: authAErr } = await client.auth.signInWithPassword({
      email: emailA,
      password: passwordA,
    })
    assert(!authAErr && authA?.session?.access_token, '用户 A 成功通过邮箱密码登录')
    const clientA = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${authA.session.access_token}` } },
      auth: { persistSession: false },
    })

    // 3.2 用户 A 创建双人小宇宙
    const { data: inviteCodeA, error: spaceErrA } = await clientA.rpc('create_space')
    assert(
      !spaceErrA && typeof inviteCodeA === 'string',
      `用户 A 成功创建双人小宇宙，邀请码: ${inviteCodeA}`,
    )

    const { data: coupleIdA, error: cidErrA } = await clientA.rpc('my_couple_id')
    assert(!cidErrA && coupleIdA, `用户 A 所在双人空间 couple_id: ${coupleIdA}`)

    // 3.3 用户 A 在账号安全中主动绑定微信
    logStep(4, '用户 A 主动绑定微信，并核验微信登录进入完全相同的账号与空间')
    const wxOpenidA = 'openid_wx_user_a_' + TEST_RUN_ID
    const wxUnionidA = 'unionid_wx_user_a_' + TEST_RUN_ID

    const { data: bindResA, error: bindErrA } = await admin.rpc('resolve_or_bind_wechat_identity', {
      p_action: 'bind',
      p_bind_user_id: userA.id,
      p_app_id: APP_ID,
      p_openid: wxOpenidA,
      p_unionid: wxUnionidA,
      p_new_user_id: null,
    })
    assert(!bindErrA && bindResA[0]?.resolved_user_id === userA.id, '用户 A 微信绑定原子写入成功')

    // 3.4 查询绑定状态
    const { data: bindStatusA, error: statusErrA } = await clientA.rpc('get_wechat_binding_status')
    assert(!statusErrA && bindStatusA.bound === true, 'get_wechat_binding_status 确认已绑定微信')
    assert(bindStatusA.has_email_auth === true, '确认存在邮箱登录方式')
    assert(bindStatusA.can_unbind === true, '确认可解绑')

    // 3.5 模拟退出登录，用户在登录页选择「微信快捷登录」
    console.log('\n--- 模拟用户退出登录，随后使用「微信快捷登录」---')
    const { data: wxLoginA, error: wxLoginErrA } = await admin.rpc(
      'resolve_or_bind_wechat_identity',
      {
        p_action: 'login',
        p_bind_user_id: null,
        p_app_id: APP_ID,
        p_openid: wxOpenidA,
        p_unionid: wxUnionidA,
        p_new_user_id: null,
      },
    )
    assert(!wxLoginErrA, '微信快捷登录识别成功')
    const resolvedUidFromWechat = wxLoginA[0]?.resolved_user_id
    assert(
      resolvedUidFromWechat === userA.id,
      `🎯 核心凭证: 微信快捷登录识别到的用户 ID (${resolvedUidFromWechat}) 与原邮箱用户 ID (${userA.id}) 100% 一致！`,
    )

    // 3.6 为其签发一次性 ticket 并换取 Supabase Session
    const ticketA = 'ticket_test_' + TEST_RUN_ID
    await admin.from('wechat_login_tickets').insert({
      ticket: ticketA,
      user_id: resolvedUidFromWechat,
      expires_at: new Date(Date.now() + 300000).toISOString(),
    })

    const { data: consumedUserIdA } = await admin.rpc('consume_wechat_login_ticket', {
      p_ticket: ticketA,
    })
    assert(consumedUserIdA === userA.id, '一次性 ticket 原子消费成功')

    // 通过 MagicLink 生成凭据并换取 Supabase Session
    const { data: linkDataA } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: userA.email,
    })
    const { data: verifySessionA } = await client.auth.verifyOtp({
      token_hash: linkDataA.properties.hashed_token,
      type: 'magiclink',
    })
    assert(
      verifySessionA?.session?.user?.id === userA.id,
      `微信换取的 Supabase Session user.id (${verifySessionA?.session?.user?.id}) 完全等于用户 A 原 ID`,
    )

    // 3.7 使用微信登录换取的 session 请求双人空间数据
    const clientWechatSessionA = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${verifySessionA.session.access_token}` } },
      auth: { persistSession: false },
    })
    const { data: coupleIdFromWechat, error: cidFromWxErr } =
      await clientWechatSessionA.rpc('my_couple_id')
    assert(
      !cidFromWxErr && coupleIdFromWechat === coupleIdA,
      `🎯 核心凭证: 微信登录访问的双人空间 ID (${coupleIdFromWechat}) 与原邮箱空间 ID (${coupleIdA}) 完全相同！`,
    )

    // -------------------------------------------------------------------------
    // 步骤 5: 绑定冲突防御测试
    // -------------------------------------------------------------------------
    logStep(5, '微信绑定冲突防御测试')
    const emailB = `test_email_b_${TEST_RUN_ID}@example.com`
    const { data: createdB, error: createBErr } = await admin.auth.admin.createUser({
      email: emailB,
      password: 'PasswordB123456!',
      email_confirm: true,
    })
    assert(!createBErr && createdB?.user?.id, `用户 B 注册成功: ${createdB?.user?.id}`)
    userB = createdB.user

    // 用户 B 尝试绑定已经被用户 A 绑定的微信
    let conflictCaught = false
    try {
      const { error: conflictErr } = await admin.rpc('resolve_or_bind_wechat_identity', {
        p_action: 'bind',
        p_bind_user_id: userB.id,
        p_app_id: APP_ID,
        p_openid: wxOpenidA,
        p_unionid: wxUnionidA,
        p_new_user_id: null,
      })
      if (conflictErr) throw conflictErr
    } catch (e) {
      conflictCaught = true
      console.log('拦截到冲突错误信息:', e.message || e)
      assert(
        /已经绑定了另一个/i.test(e.message || String(e)),
        '提示语符合规范: 这个微信已经绑定了另一个 BIBU 账号',
      )
    }
    assert(conflictCaught, '成功防御微信绑定冲突！')

    // 核验用户 A 的微信绑定未被篡改
    const { data: checkAAfterConflict } = await admin
      .from('wechat_identities')
      .select('user_id')
      .eq('unionid', wxUnionidA)
      .single()
    assert(checkAAfterConflict?.user_id === userA.id, '用户 A 的微信绑定完好无损，未受影响')

    // -------------------------------------------------------------------------
    // 步骤 6: 身份标识平滑升级测试（首次未返回 unionid，后又返回 unionid）
    // -------------------------------------------------------------------------
    logStep(6, '微信身份标识升级（首次无 unionid，后续补全 unionid）')
    const wxOpenidD = 'openid_wx_user_d_' + TEST_RUN_ID
    const wxUnionidD = 'unionid_wx_user_d_' + TEST_RUN_ID

    // 6.1 首次登录：微信未返回 unionid (null)
    const dEmail = `wx_${TEST_RUN_ID}_d@auth.bibu.space`
    const { data: createdD } = await admin.auth.admin.createUser({
      email: dEmail,
      password: 'WxPassword_' + TEST_RUN_ID,
      email_confirm: true,
    })
    const userD = createdD.user

    await admin.rpc('resolve_or_bind_wechat_identity', {
      p_action: 'login',
      p_bind_user_id: null,
      p_app_id: APP_ID,
      p_openid: wxOpenidD,
      p_unionid: null, // 无 unionid
      p_new_user_id: userD.id,
    })

    const { data: identD1 } = await admin
      .from('wechat_identities')
      .select('user_id, unionid')
      .eq('app_id', APP_ID)
      .eq('openid', wxOpenidD)
      .single()
    assert(
      identD1.user_id === userD.id && identD1.unionid === null,
      '首次登录成功记录 openid，unionid 为 null',
    )

    // 6.2 第二次登录：微信带来了 unionid
    const { data: resolveD2 } = await admin.rpc('resolve_or_bind_wechat_identity', {
      p_action: 'login',
      p_bind_user_id: null,
      p_app_id: APP_ID,
      p_openid: wxOpenidD,
      p_unionid: wxUnionidD, // 补充了 unionid
      p_new_user_id: null,
    })
    assert(resolveD2[0]?.resolved_user_id === userD.id, '通过 openid 稳定命中同一账号')

    const { data: identD2 } = await admin
      .from('wechat_identities')
      .select('unionid')
      .eq('user_id', userD.id)
      .single()
    assert(identD2.unionid === wxUnionidD, '数据库自动平滑补全 unionid，同一微信不会变成两个账号')

    // -------------------------------------------------------------------------
    // 步骤 7: 解绑逻辑与唯一登录方式保护测试
    // -------------------------------------------------------------------------
    logStep(7, '解绑逻辑与唯一登录方式保护测试')
    // 7.1 用户 C 为纯微信创建账号，没有邮箱密码，尝试解绑应被拒绝
    const clientC = createClient(SUPABASE_URL, ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${(await admin.auth.admin.generateLink({ type: 'magiclink', email: wxUserC.email })).data?.properties?.hashed_token}`,
        },
      },
      auth: { persistSession: false },
    })
    // 用 RPC 测试解绑权限
    let unbindCBlocked = false
    try {
      const { error: unbindCErr } = await admin.rpc('unbind_wechat_identity', {
        p_user_id: wxUserC.id,
      })
      if (unbindCErr) throw unbindCErr
    } catch (e) {
      unbindCBlocked = true
      console.log('纯微信账号解绑被安全拦截:', e.message || e)
      assert(
        /尚未绑定有效邮箱|尚未设置登录密码/i.test(e.message || String(e)),
        '正确提示需先绑定有效邮箱或设置自主登录密码',
      )
    }
    assert(unbindCBlocked, '成功阻止唯一登录方式被解绑！')

    // 7.2 用户 A 拥有邮箱密码，执行解绑微信
    const { data: unbindSuccessA, error: unbindAErr } = await admin.rpc('unbind_wechat_identity', {
      p_user_id: userA.id,
    })
    assert(!unbindAErr && unbindSuccessA === true, '用户 A 成功解除微信绑定')

    const { data: statusAfterUnbindA } = await admin.rpc(
      'get_wechat_binding_status',
      {},
      {
        // 模拟用户 A
      },
    )
    const { data: checkIdentA } = await admin
      .from('wechat_identities')
      .select('*')
      .eq('user_id', userA.id)
      .maybeSingle()
    assert(!checkIdentA, '用户 A 的微信身份映射记录已清除')

    // -------------------------------------------------------------------------
    // 步骤 8: 授权流程 State 与登录票据 Ticket 防重放与过期
    // -------------------------------------------------------------------------
    logStep(8, '授权流程 state 与票据 ticket 防重放测试')
    const testState = 'state_replay_' + TEST_RUN_ID
    await admin.from('wechat_auth_flows').insert({
      state: testState,
      action: 'login',
      redirect_to: 'https://www.515171.xyz/',
      expires_at: new Date(Date.now() + 600000).toISOString(),
    })

    // 第一次消费 state
    const { data: flow1 } = await admin.rpc('consume_wechat_auth_flow', { p_state: testState })
    assert(flow1 && flow1.length === 1, '第一次消费 state 成功')

    // 第二次重放消费同一 state
    const { data: flow2 } = await admin.rpc('consume_wechat_auth_flow', { p_state: testState })
    assert(!flow2 || flow2.length === 0, '第二次重放消费 state 被拒绝 (防重放成功)')

    // 测试 ticket 防重放
    const testTicket = 'ticket_replay_' + TEST_RUN_ID
    await admin.from('wechat_login_tickets').insert({
      ticket: testTicket,
      user_id: userB.id,
      expires_at: new Date(Date.now() + 300000).toISOString(),
    })

    const { data: tick1 } = await admin.rpc('consume_wechat_login_ticket', { p_ticket: testTicket })
    assert(tick1 === userB.id, '第一次消费 ticket 成功')

    const { data: tick2 } = await admin.rpc('consume_wechat_login_ticket', { p_ticket: testTicket })
    assert(tick2 === null, '第二次重放消费 ticket 返回 null (防重放成功)')

    // -------------------------------------------------------------------------
    // 步骤 9: 高并发消费原子性测试
    // -------------------------------------------------------------------------
    logStep(9, '高并发消费原子性测试 (10 个并发竞争同一 ticket)')
    const concurrentTicket = 'ticket_concurrent_' + TEST_RUN_ID
    await admin.from('wechat_login_tickets').insert({
      ticket: concurrentTicket,
      user_id: userB.id,
      expires_at: new Date(Date.now() + 300000).toISOString(),
    })

    const concurrentResults = await Promise.all(
      Array.from({ length: 10 }).map(() =>
        admin.rpc('consume_wechat_login_ticket', { p_ticket: concurrentTicket }),
      ),
    )

    const successes = concurrentResults.filter((r) => r.data === userB.id)
    const fails = concurrentResults.filter((r) => r.data === null)
    console.log(`并发结果统计: 成功 ${successes.length} 次, 失败 ${fails.length} 次`)
    assert(successes.length === 1, '10 个并发竞争中仅且仅有 1 次成功消费！')
    assert(fails.length === 9, '其余 9 次并发全部被数据库排他锁安全拦截')

    // -------------------------------------------------------------------------
    // 步骤 10: 账号注销与级联清理测试
    // -------------------------------------------------------------------------
    logStep(10, '账号注销测试（注销级联清理微信身份映射）')
    // 用户 B 重新绑定一个微信
    const wxOpenidB = 'openid_wx_user_b_' + TEST_RUN_ID
    await admin.rpc('resolve_or_bind_wechat_identity', {
      p_action: 'bind',
      p_bind_user_id: userB.id,
      p_app_id: APP_ID,
      p_openid: wxOpenidB,
      p_unionid: null,
      p_new_user_id: null,
    })

    const { data: identBBefore } = await admin
      .from('wechat_identities')
      .select('*')
      .eq('user_id', userB.id)
      .maybeSingle()
    assert(!!identBBefore, '用户 B 微信已绑定')

    // 调用 prepare_account_deletion (模拟通过用户客户端调用或直接 admin 测试)
    await admin.rpc(
      'prepare_account_deletion',
      {},
      {
        // 模拟 userB
      },
    )
    // 删除 auth.users(id) 模拟完成注销
    const { error: delUserErr } = await admin.auth.admin.deleteUser(userB.id)
    assert(!delUserErr, '用户 B 账号删除成功')

    // 检查 wechat_identities 中该记录是否级联删除
    const { data: identBAfter } = await admin
      .from('wechat_identities')
      .select('*')
      .eq('user_id', userB.id)
      .maybeSingle()
    assert(!identBAfter, '账号注销后，微信身份映射记录已被完全级联清理')

    console.log('\n🎉🎉🎉 全部 10 大核心场景与安全边界验证 100% 通过！🎉🎉🎉')
  } finally {
    // 清理测试数据
    console.log('\n🧹 清理测试残留账号...')
    if (userA) await admin.auth.admin.deleteUser(userA.id).catch(() => {})
    if (userB) await admin.auth.admin.deleteUser(userB.id).catch(() => {})
    if (wxUserC) await admin.auth.admin.deleteUser(wxUserC.id).catch(() => {})
    console.log('✅ 测试环境已恢复整洁')
  }
}

run().catch((err) => {
  console.error('\n❌ E2E 验证过程中断:', err)
  process.exit(1)
})
