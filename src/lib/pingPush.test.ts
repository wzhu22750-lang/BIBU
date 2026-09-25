import { describe, expect, it } from 'vitest'
import { buildPingPush, isUsablePushToken } from '../../supabase/functions/_shared/pingPush'
import { isInvalidCidError } from '../../supabase/functions/_shared/getui'
const record = {
  id: '12345678-1234-4234-8234-123456789012',
  couple_id: '12345678-1234-4234-8234-123456789013',
  sender_id: '12345678-1234-4234-8234-123456789014',
  kind: '想你',
}
describe('个推 ping 透传载荷', () => {
  it('builds minimal payload with internal route and ping_id only', () => {
    const result = buildPingPush(record, 't'.repeat(20))
    expect(result.kind).toBe('ping')
    expect(result.route).toBe('#home')
    expect(result.ping_id).toBe(record.id)
    expect(result.title).toBe('收到一个小小的哔卟')
    expect(JSON.stringify(result)).not.toContain(record.couple_id)
    expect(JSON.stringify(result)).not.toContain(record.sender_id)
    expect(JSON.stringify(result)).not.toContain(record.kind)
  })
  it('rejects invalid CID and IDs', () => {
    expect(isUsablePushToken('short')).toBe(false)
    expect(isUsablePushToken('t'.repeat(20))).toBe(true)
    expect(() => buildPingPush(record, 'short')).toThrow()
    expect(() => buildPingPush({ ...record, id: 'bad' }, 't'.repeat(20))).toThrow()
  })
  it('classifies invalid CID errors but not ordinary transient errors', () => {
    expect(isInvalidCidError(404, JSON.stringify({ code: 20009, msg: 'cid 不存在' }))).toBe(true)
    expect(isInvalidCidError(400, JSON.stringify({ code: 20001, msg: 'cid invalid' }))).toBe(true)
    expect(isInvalidCidError(404, JSON.stringify({ code: 10001, msg: '鉴权失败' }))).toBe(false)
    expect(isInvalidCidError(503, 'upstream timeout')).toBe(false)
    expect(isInvalidCidError(0, '')).toBe(false)
  })
})
