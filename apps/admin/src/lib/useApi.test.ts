import { describe, expect, it } from 'vitest'
import { beginLoad, visibleApiState, type ApiState } from './useApi'

const previous: ApiState<{ id: string }> = {
  key: 'user:A',
  data: { id: 'A' },
  error: null,
  loading: false,
  fetchedAt: '2026-10-20T01:00:00.000Z',
}

describe('useApi 查询键切换', () => {
  it('查询键变化后立即隐藏旧实体数据', () => {
    const next = beginLoad(previous, 'user:B')
    expect(next).toMatchObject({
      key: 'user:B',
      data: undefined,
      loading: true,
      fetchedAt: null,
    })
    expect(visibleApiState(previous, 'user:B').data).toBeUndefined()
  })

  it('同一个键重载时保留现有数据供局部刷新', () => {
    const next = beginLoad(previous, 'user:A')
    expect(next).toMatchObject({
      key: 'user:A',
      data: { id: 'A' },
      loading: true,
    })
  })

  it('旧请求返回后不能把数据写回新键视图', () => {
    expect(visibleApiState(previous, 'user:B').data).toBeUndefined()
    expect(visibleApiState(previous, 'user:A').data).toEqual({ id: 'A' })
  })
})
