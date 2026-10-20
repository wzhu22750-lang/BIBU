import { afterEach, describe, expect, it, vi } from 'vitest'
import { recordDelivery, tokenSuffix } from '../functions/_shared/diagnostics.ts'

const entry = {
  requestId: '30000000-0000-0000-0000-000000000001',
  eventType: 'message' as const,
  eventId: '40000000-0000-0000-0000-000000000001',
  coupleId: null,
  recipientUserId: null,
  stage: 'webhook_received' as const,
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('push diagnostics 非阻断写入', () => {
  it('只保留 token 末尾 8 位', () => {
    expect(tokenSuffix('secret-token-123456789')).toBe('123456789'.slice(-8))
    expect(tokenSuffix(null)).toBeNull()
  })

  it('写入返回错误时不抛出', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const writer = {
      rpc: () => Promise.resolve({ error: { code: '42501' } }),
    }
    await expect(recordDelivery(writer, entry, 50)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })

  it('写入抛异常时不抛出', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const writer = {
      rpc: () => Promise.reject(new Error('network down')),
    }
    await expect(recordDelivery(writer, entry, 50)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })

  it('写入超时后按时返回，不阻塞原推送流程', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const writer = {
      rpc: () => new Promise<{ error: null }>(() => undefined),
    }
    const started = Date.now()
    await expect(recordDelivery(writer, entry, 20)).resolves.toBeUndefined()
    expect(Date.now() - started).toBeLessThan(500)
    expect(warn.mock.calls.some((call) => String(call[0]).includes('timed out'))).toBe(true)
  })
})
