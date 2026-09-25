import { describe, expect, it } from 'vitest'
import { buildMessagePush, messagePreview } from '../../supabase/functions/_shared/messagePush'
const record = {
  id: '12345678-1234-4234-8234-123456789021',
  couple_id: '12345678-1234-4234-8234-123456789013',
  sender_id: '12345678-1234-4234-8234-123456789014',
  content: '你今天吃饭了吗？',
}
describe('个推 message 透传载荷', () => {
  it('builds a minimal payload that deep-links to the chat message', () => {
    const result = buildMessagePush(record, 't'.repeat(20))
    expect(result.kind).toBe('message')
    expect(result.title).toBe('BIBU！悄悄话')
    expect(result.body).toBe('收到一条悄悄话，打开 BIBU！查看')
    expect(result.route).toBe(`#chat?message=${record.id}`)
    expect(result.message_id).toBe(record.id)
    // 透传载荷绝不允许携带消息正文或身份标识。
    expect(JSON.stringify(result)).not.toContain('吃饭')
    expect(JSON.stringify(result)).not.toContain(record.couple_id)
    expect(JSON.stringify(result)).not.toContain(record.sender_id)
  })
  it('truncates long previews and collapses whitespace', () => {
    expect(messagePreview('a\n\n  b   c')).toBe('a b c')
    const long = 'x'.repeat(200)
    const preview = messagePreview(long, 80)
    expect(Array.from(preview)).toHaveLength(81)
    expect(preview.endsWith('…')).toBe(true)
    expect(messagePreview('   ')).toBe('发来一条悄悄话')
  })
  it('rejects invalid CID and message IDs', () => {
    expect(() => buildMessagePush(record, 'short')).toThrow('CID')
    expect(() => buildMessagePush({ ...record, id: 'bad' }, 't'.repeat(20))).toThrow('ID')
  })
})
