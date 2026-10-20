import { expect, it } from 'vitest'
import { readDraft } from './ticketDraft'

it('restores a draft only for its actor/ticket key and ignores expired or malformed values', () => {
  const values: Record<string, string> = {
    'actor-a:ticket-1': JSON.stringify({
      body: '正在排查',
      reason: '跟进反馈',
      status: 'resolved',
      savedAt: Date.now(),
    }),
    expired: JSON.stringify({ body: '旧草稿', reason: '', savedAt: Date.now() - 86400001 }),
    malformed: '{',
  }
  const storage = { getItem: (key: string) => values[key] || null }
  expect(readDraft(storage, 'actor-a:ticket-1')).toEqual({
    body: '正在排查',
    reason: '跟进反馈',
    status: 'resolved',
  })
  for (const key of ['actor-b:ticket-1', 'actor-a:ticket-2', 'expired', 'malformed'])
    expect(readDraft(storage, key).body).toBe('')
})
