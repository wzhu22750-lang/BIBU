import { describe, expect, it } from 'vitest'
import { LogicalSubmission, operationMetadata, withRequestId } from './idempotency'

describe('LogicalSubmission', () => {
  it('同一内容重试复用同一键，内容变化后换新键', () => {
    const submission = new LogicalSubmission()
    const first = submission.begin({ action: 'reply', body: '处理结果', reason: '' })
    const retry = submission.begin({ reason: '', body: '处理结果', action: 'reply' })
    expect(retry).toBe(first)

    const changed = submission.begin({ action: 'reply', body: '修改后的内容', reason: '' })
    expect(changed).not.toBe(first)
  })

  it('明确成功后结束逻辑操作，下一次提交生成新键', () => {
    const submission = new LogicalSubmission()
    const first = submission.begin({ body: '备注' })
    submission.succeed()
    expect(submission.pending).toBe(false)
    const second = submission.begin({ body: '备注' })
    expect(second).not.toBe(first)
  })

  it('失败状态不主动清除键，调用方保留即可重试', () => {
    const submission = new LogicalSubmission()
    const first = submission.begin({ body: '备注' })
    expect(submission.pending).toBe(true)
    expect(submission.begin({ body: '备注' })).toBe(first)
  })

  it('读取写操作响应中的原请求编号与重放标记', () => {
    const response = {
      note: { id: 'note-1' },
      operation: {
        request_id: '11111111-1111-4111-8111-111111111111',
        replayed: true,
      },
    }
    expect(operationMetadata(response)).toMatchObject({ replayed: true })
    expect(withRequestId('已保存', response)).toContain('此前已提交成功')
    expect(withRequestId('已保存', response)).toContain('11111111')
    expect(withRequestId('已保存', { note: {} })).toBe('已保存')
  })
})
