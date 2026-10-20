import { describe, expect, it } from 'vitest'
import { SupportTicketDetailController, type SupportTicketDetail } from './supportTicketDetail'

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function ticket(id: string, overrides: Partial<SupportTicketDetail> = {}): SupportTicketDetail {
  return {
    id,
    ticket_no: `BIBU-20261020-0000${id}`,
    category: 'bug',
    status: 'pending',
    created_at: '2026-10-20T01:00:00.000Z',
    updated_at: '2026-10-20T01:00:00.000Z',
    resolved_at: null,
    description: `工单 ${id} 的描述内容`,
    messages: [],
    ...overrides,
  }
}

function createHarness() {
  const loads = new Map<string, Deferred<SupportTicketDetail>[]>()
  const replies: Array<{
    id: string
    body: string
    key: string
    deferred: Deferred<SupportTicketDetail>
  }> = []
  const keys: string[] = []
  let keySeq = 0

  function enqueueLoad(id: string) {
    const entry = deferred<SupportTicketDetail>()
    const queue = loads.get(id) || []
    queue.push(entry)
    loads.set(id, queue)
    return entry
  }

  const controller = new SupportTicketDetailController({
    load: (id) => {
      const queue = loads.get(id)
      const entry = queue?.shift()
      if (!entry) throw new Error(`没有为 ${id} 安排加载结果`)
      return entry.promise
    },
    reply: (id, body, key) => {
      const entry = deferred<SupportTicketDetail>()
      replies.push({ id, body, key, deferred: entry })
      return entry.promise
    },
    createIdempotencyKey: () => {
      keySeq += 1
      const key = `key-${keySeq}`
      keys.push(key)
      return key
    },
    describeError: (error) => (error instanceof Error ? error.message : String(error)),
  })

  return { controller, enqueueLoad, replies, keys }
}

describe('SupportTicketDetailController 异步竞态', () => {
  it('A 慢 B 快时最终只显示 B', async () => {
    const h = createHarness()
    const a = h.enqueueLoad('A')
    const b = h.enqueueLoad('B')

    const openA = h.controller.toggle('A')
    const openB = h.controller.toggle('B')
    b.resolve(ticket('B'))
    await openB
    expect(h.controller.getState()).toMatchObject({
      openId: 'B',
      loading: false,
      detail: { id: 'B' },
    })

    a.resolve(ticket('A'))
    await openA
    expect(h.controller.getState()).toMatchObject({
      openId: 'B',
      loading: false,
      error: '',
      detail: { id: 'B' },
    })
  })

  it('A 快 B 慢时最终只显示 B', async () => {
    const h = createHarness()
    const a = h.enqueueLoad('A')
    const b = h.enqueueLoad('B')

    const openA = h.controller.toggle('A')
    a.resolve(ticket('A'))
    await openA
    const openB = h.controller.toggle('B')
    expect(h.controller.getState()).toMatchObject({
      openId: 'B',
      loading: true,
      detail: null,
    })

    b.resolve(ticket('B'))
    await openB
    expect(h.controller.getState().detail?.id).toBe('B')
  })

  it('关闭详情后旧请求返回不会重新打开或污染状态', async () => {
    const h = createHarness()
    const a = h.enqueueLoad('A')
    const open = h.controller.toggle('A')
    h.controller.close()
    expect(h.controller.getState()).toMatchObject({
      openId: null,
      loading: false,
      detail: null,
    })

    a.resolve(ticket('A'))
    await open
    expect(h.controller.getState()).toMatchObject({
      openId: null,
      loading: false,
      error: '',
      detail: null,
    })
  })

  it('加载失败后点击重试会真正再次请求', async () => {
    const h = createHarness()
    const first = h.enqueueLoad('A')
    const open = h.controller.toggle('A')
    first.reject(new Error('网络失败'))
    await open
    expect(h.controller.getState().error).toBe('网络失败')

    const second = h.enqueueLoad('A')
    const retry = h.controller.reload('A')
    expect(h.controller.getState()).toMatchObject({ openId: 'A', loading: true, error: '' })
    second.resolve(ticket('A'))
    await retry
    expect(h.controller.getState()).toMatchObject({
      loading: false,
      error: '',
      detail: { id: 'A' },
    })
  })

  it('草稿按工单隔离，切换不会把 A 的内容带进 B', async () => {
    const h = createHarness()
    h.controller.setDraft('A', '这是 A 的草稿')
    h.controller.setDraft('B', '这是 B 的草稿')
    expect(h.controller.getState().drafts).toEqual({
      A: '这是 A 的草稿',
      B: '这是 B 的草稿',
    })

    h.controller.setDraft('A', '')
    expect(h.controller.getState().drafts).toEqual({ B: '这是 B 的草稿' })
  })

  it('提交期间切换工单，返回结果不会覆盖当前视图', async () => {
    const h = createHarness()
    const loadA = h.enqueueLoad('A')
    const openA = h.controller.toggle('A')
    loadA.resolve(ticket('A'))
    await openA
    h.controller.setDraft('A', '给 A 的回复')

    const submit = h.controller.submitReply('A', '给 A 的回复')
    expect(h.controller.getState().submittingId).toBe('A')

    const loadB = h.enqueueLoad('B')
    const openB = h.controller.toggle('B')
    loadB.resolve(ticket('B'))
    await openB

    h.replies[0].deferred.resolve(ticket('A', { updated_at: '2026-10-20T02:00:00.000Z' }))
    await expect(submit).resolves.toBe(true)

    expect(h.controller.getState()).toMatchObject({
      openId: 'B',
      detail: { id: 'B' },
      submittingId: null,
    })
    expect(h.controller.getState().drafts.A).toBeUndefined()
    expect(h.controller.getState().submitErrors.A).toBeUndefined()
  })

  it('回复失败只记录在目标工单，重试复用同一幂等键，成功后新操作换新键', async () => {
    const h = createHarness()
    const loadA = h.enqueueLoad('A')
    const openA = h.controller.toggle('A')
    loadA.resolve(ticket('A'))
    await openA

    const first = h.controller.submitReply('A', '同一段回复')
    h.replies[0].deferred.reject(new Error('响应丢失'))
    await expect(first).resolves.toBe(false)
    expect(h.controller.getState().submitErrors.A).toBe('响应丢失')

    const second = h.controller.submitReply('A', '同一段回复')
    h.replies[1].deferred.resolve(ticket('A'))
    await expect(second).resolves.toBe(true)
    expect(h.replies[0].key).toBe(h.replies[1].key)

    const third = h.controller.submitReply('A', '修改后的回复')
    h.replies[2].deferred.resolve(ticket('A'))
    await expect(third).resolves.toBe(true)
    expect(h.replies[2].key).not.toBe(h.replies[0].key)
  })

  it('新建工单返回详情会作废仍在途的旧请求', async () => {
    const h = createHarness()
    const oldLoad = h.enqueueLoad('A')
    const oldOpen = h.controller.toggle('A')
    h.controller.showCreated(ticket('NEW'))
    oldLoad.resolve(ticket('A'))
    await oldOpen
    expect(h.controller.getState().detail?.id).toBe('NEW')
  })
})
