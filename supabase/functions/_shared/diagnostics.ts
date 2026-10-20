export type DeliveryStage =
  'webhook_received' | 'skipped' | 'provider_accepted' | 'provider_rejected' | 'invalid_token'

export type DeliveryEntry = {
  requestId: string
  eventType: 'message' | 'ping'
  eventId: string
  coupleId: string | null
  recipientUserId: string | null
  devicePlatform?: string
  tokenSuffix?: string | null
  stage: DeliveryStage
  errorCode?: string | null
  providerHttpStatus?: number | null
  durationMs?: number | null
}

export type DeliveryWriter = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ error: { code?: string; message?: string } | null }>
}

export function tokenSuffix(token: string | null | undefined): string | null {
  if (!token) return null
  return token.slice(-8)
}

function safeDuration(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.min(600_000, Math.round(value)))
}

/**
 * 以非阻断方式写入最小推送诊断。任何失败只留下不含 token / 正文的短日志，
 * 绝不改变原推送响应。
 */
type EdgeRuntimeLike = { waitUntil?: (promise: Promise<unknown>) => void }

export async function recordDelivery(
  writer: DeliveryWriter,
  entry: DeliveryEntry,
  timeoutMs = 800,
): Promise<void> {
  const write = Promise.resolve(
    writer.rpc('record_notification_delivery', {
      p_request_id: entry.requestId,
      p_event_type: entry.eventType,
      p_event_id: entry.eventId,
      p_couple_id: entry.coupleId,
      p_recipient_user_id: entry.recipientUserId,
      p_channel: 'getui',
      p_device_platform: entry.devicePlatform || 'android',
      p_token_suffix: entry.tokenSuffix || null,
      p_stage: entry.stage,
      p_error_code: entry.errorCode || null,
      p_provider_http_status: entry.providerHttpStatus ?? null,
      p_duration_ms: safeDuration(entry.durationMs),
    }),
  ).then(
    (result) => result,
    () => ({ error: { code: 'write_exception' } }),
  )

  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs)
  })
  const result = await Promise.race([write, timedOut])
  if (timer) clearTimeout(timer)
  if (result === null) {
    // 诊断是旁路写入：超时后不再占用推送请求的响应时间。若运行在 Supabase
    // Edge Runtime，交给 waitUntil 保持写请求存活；否则允许其随运行时结束。
    console.warn(`[push-diagnostics] write timed out after ${timeoutMs}ms`)
    const runtime = (globalThis as { EdgeRuntime?: EdgeRuntimeLike }).EdgeRuntime
    runtime?.waitUntil?.(write)
    return
  }
  if (result.error) {
    console.warn(`[push-diagnostics] write failed code=${result.error.code || 'unknown'}`)
  }
}
