import { createClient } from 'npm:@supabase/supabase-js@2'
import { buildPingPush, type PingPushRecord } from '../_shared/pingPush.ts'
import { recordDelivery, tokenSuffix } from '../_shared/diagnostics.ts'
import {
  isInvalidCidError,
  parseGeTuiEnv,
  sendGeTuiTransmission,
} from '../_shared/getui.ts'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-bibo-webhook-secret',
}
function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: '仅支持 POST' }, 405)
  const expected = Deno.env.get('BIBU_WEBHOOK_SECRET') || Deno.env.get('BIBO_WEBHOOK_SECRET')
  const secretHeader =
    request.headers.get('x-bibu-webhook-secret') || request.headers.get('x-bibo-webhook-secret')
  if (!expected || secretHeader !== expected) return json({ error: 'Webhook 未授权' }, 401)
  const requestId = crypto.randomUUID()
  const startedAt = Date.now()
  const url = Deno.env.get('SUPABASE_URL'),
    service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    getui = parseGeTuiEnv(Deno.env.toObject())
  if (!url || !service || !getui)
    return json({ error: 'Push 发送服务尚未配置 service key / 个推 GETUI_* 环境变量' }, 503)
  let payload: { record?: PingPushRecord }
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Webhook payload 无效' }, 400)
  }
  const record = payload.record
  if (!record?.id || !record.couple_id || !record.sender_id)
    return json({ sent: 0, skipped: '匿名或无效 Ping' }, 200)
  const admin = createClient(url, service)
  // The webhook secret authenticates the caller, but its JSON body is still
  // untrusted. Read the persisted Ping and use it as the source of truth.
  const { data: persistedPing, error: pingError } = await admin
    .from('pings')
    .select('id, couple_id, sender_id, kind')
    .eq('id', record.id)
    .eq('couple_id', record.couple_id)
    .maybeSingle()
  if (pingError) return json({ error: '校验 Ping 记录失败', details: pingError.message }, 502)
  if (!persistedPing || persistedPing.sender_id !== record.sender_id)
    return json({ sent: 0, skipped: 'Ping 不存在或已匿名化' }, 200)
  const verifiedRecord = persistedPing as PingPushRecord
  const { data: members, error: memberError } = await admin
    .from('couple_members')
    .select('user_id')
    .eq('couple_id', verifiedRecord.couple_id)
  if (memberError) return json({ error: '读取空间成员失败', details: memberError.message }, 502)
  const partner = members?.find((row) => row.user_id !== verifiedRecord.sender_id)?.user_id
  if (!partner) {
    await recordDelivery(admin, {
      requestId,
      eventType: 'ping',
      eventId: verifiedRecord.id,
      coupleId: verifiedRecord.couple_id,
      recipientUserId: null,
      stage: 'skipped',
      errorCode: 'no_partner',
      durationMs: Date.now() - startedAt,
    })
    return json({ sent: 0, skipped: '没有另一位成员' }, 200)
  }
  const { data: devices, error: deviceError } = await admin
    .from('device_installations')
    .select('token')
    .eq('user_id', partner)
    .eq('platform', 'android')
  if (deviceError) return json({ error: '读取 Push 设备失败', details: deviceError.message }, 502)
  if (!devices?.length) {
    await recordDelivery(admin, {
      requestId,
      eventType: 'ping',
      eventId: verifiedRecord.id,
      coupleId: verifiedRecord.couple_id,
      recipientUserId: partner,
      stage: 'skipped',
      errorCode: 'no_device',
      durationMs: Date.now() - startedAt,
    })
    return json({ sent: 0, skipped: '对方没有登记 Android Push 设备' }, 200)
  }
  const targets = devices.filter(
    (device) => typeof device.token === 'string' && device.token.length >= 20,
  )
  if (!targets.length) {
    await recordDelivery(admin, {
      requestId,
      eventType: 'ping',
      eventId: verifiedRecord.id,
      coupleId: verifiedRecord.couple_id,
      recipientUserId: partner,
      stage: 'skipped',
      errorCode: 'no_valid_token',
      durationMs: Date.now() - startedAt,
    })
    return json({ sent: 0, skipped: '对方没有有效 Android Push Token' }, 200)
  }
  await recordDelivery(admin, {
    requestId,
    eventType: 'ping',
    eventId: verifiedRecord.id,
    coupleId: verifiedRecord.couple_id,
    recipientUserId: partner,
    stage: 'webhook_received',
    durationMs: Date.now() - startedAt,
  })
  console.log(
    `[send-ping-push] Ping ${verifiedRecord.id} -> Partner ${partner} (${targets.length} targets)`,
  )
  let payload
  try {
    payload = buildPingPush(verifiedRecord, targets[0].token as string)
  } catch (error) {
    return json({ error: '构造 Ping 推送载荷失败', details: String(error) }, 502)
  }
  let sent = 0,
    invalid = 0,
    failed = 0
  for (const device of targets) {
    const cid = device.token as string
    const attemptStarted = Date.now()
    let result: { ok: boolean; status: number; text: string }
    try {
      result = await sendGeTuiTransmission(getui, cid, { ...payload })
    } catch {
      failed++
      console.error(
        `[send-ping-push] Ping ${verifiedRecord.id} 发送异常，CID 末尾 ${tokenSuffix(cid)}`,
      )
      await recordDelivery(admin, {
        requestId,
        eventType: 'ping',
        eventId: verifiedRecord.id,
        coupleId: verifiedRecord.couple_id,
        recipientUserId: partner,
        tokenSuffix: tokenSuffix(cid),
        stage: 'provider_rejected',
        errorCode: 'network_error',
        durationMs: Date.now() - attemptStarted,
      })
      continue
    }
    console.log(
      `[send-ping-push] Ping ${verifiedRecord.id} CID 末尾 ${tokenSuffix(cid)} status: ${result.status}, ok: ${result.ok}`,
    )
    if (result.ok) {
      sent++
      await recordDelivery(admin, {
        requestId,
        eventType: 'ping',
        eventId: verifiedRecord.id,
        coupleId: verifiedRecord.couple_id,
        recipientUserId: partner,
        tokenSuffix: tokenSuffix(cid),
        stage: 'provider_accepted',
        providerHttpStatus: result.status,
        durationMs: Date.now() - attemptStarted,
      })
      continue
    }
    if (isInvalidCidError(result.status, result.text)) {
      invalid++
      await recordDelivery(admin, {
        requestId,
        eventType: 'ping',
        eventId: verifiedRecord.id,
        coupleId: verifiedRecord.couple_id,
        recipientUserId: partner,
        tokenSuffix: tokenSuffix(cid),
        stage: 'invalid_token',
        errorCode: 'invalid_cid',
        providerHttpStatus: result.status,
        durationMs: Date.now() - attemptStarted,
      })
      await admin.from('device_installations').delete().eq('user_id', partner).eq('token', cid)
    } else {
      failed++
      await recordDelivery(admin, {
        requestId,
        eventType: 'ping',
        eventId: verifiedRecord.id,
        coupleId: verifiedRecord.couple_id,
        recipientUserId: partner,
        tokenSuffix: tokenSuffix(cid),
        stage: 'provider_rejected',
        errorCode: `getui_http_${result.status}`,
        providerHttpStatus: result.status,
        durationMs: Date.now() - attemptStarted,
      })
    }
  }
  if (failed > 0)
    return json({ sent, invalid, failed, error: '部分个推请求失败；可由数据库 Webhook 重试' }, 502)
  return json({ sent, invalid, failed: 0 }, 200)
})
