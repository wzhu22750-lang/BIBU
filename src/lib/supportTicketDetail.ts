export type SupportTicketStatus = 'pending' | 'in_progress' | 'waiting_user' | 'resolved'

export type SupportTicketMessage = {
  id: string
  author_type: 'user' | 'admin' | 'system'
  body: string
  created_at: string
}

export type SupportTicketDetail = {
  id: string
  ticket_no: string
  category: string
  status: SupportTicketStatus
  created_at: string
  updated_at: string
  resolved_at: string | null
  description: string
  messages: SupportTicketMessage[]
}

export type SupportTicketDetailState = {
  openId: string | null
  loading: boolean
  error: string
  detail: SupportTicketDetail | null
  drafts: Readonly<Record<string, string>>
  submittingId: string | null
  submitErrors: Readonly<Record<string, string>>
}

type ControllerOptions = {
  load: (ticketId: string) => Promise<SupportTicketDetail>
  reply: (ticketId: string, body: string, idempotencyKey: string) => Promise<SupportTicketDetail>
  createIdempotencyKey: () => string
  describeError: (error: unknown) => string
}

type ReplyOperation = { key: string; fingerprint: string }

const INITIAL: SupportTicketDetailState = {
  openId: null,
  loading: false,
  error: '',
  detail: null,
  drafts: {},
  submittingId: null,
  submitErrors: {},
}

function isDetailFor(value: SupportTicketDetail | null, ticketId: string) {
  return Boolean(value && value.id === ticketId)
}

// 单个工单详情请求/草稿/回复的控制器。组件只读取快照；所有异步回写都要先
// 核对请求序号与当前展开工单，避免慢请求覆盖新工单或把回复写到错误对象。
export class SupportTicketDetailController {
  private state: SupportTicketDetailState = INITIAL
  private listeners = new Set<() => void>()
  private requestSeq = 0
  private replyOperations = new Map<string, ReplyOperation>()

  constructor(private readonly options: ControllerOptions) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = (): SupportTicketDetailState => this.state

  private emit(next: SupportTicketDetailState) {
    this.state = next
    for (const listener of this.listeners) listener()
  }

  private patch(next: Partial<SupportTicketDetailState>) {
    this.emit({ ...this.state, ...next })
  }

  async toggle(ticketId: string): Promise<void> {
    if (this.state.openId === ticketId) {
      this.close()
      return
    }
    await this.startLoad(ticketId)
  }

  close() {
    this.requestSeq += 1
    this.patch({
      openId: null,
      loading: false,
      error: '',
      detail: null,
    })
  }

  async reload(ticketId: string): Promise<void> {
    await this.startLoad(ticketId)
  }

  showCreated(detail: SupportTicketDetail) {
    this.requestSeq += 1
    this.patch({
      openId: detail.id,
      loading: false,
      error: '',
      detail,
    })
  }

  setDraft(ticketId: string, value: string) {
    if ((this.state.drafts[ticketId] || '') === value) return
    const drafts = { ...this.state.drafts, [ticketId]: value }
    if (!value) delete drafts[ticketId]
    this.patch({ drafts })
  }

  private async startLoad(ticketId: string) {
    const seq = ++this.requestSeq
    this.patch({
      openId: ticketId,
      loading: true,
      error: '',
      detail: null,
    })
    try {
      const detail = await this.options.load(ticketId)
      if (seq !== this.requestSeq || this.state.openId !== ticketId) return
      if (!isDetailFor(detail, ticketId)) {
        this.patch({
          loading: false,
          error: '返回的工单与当前请求不一致，请刷新后重试',
          detail: null,
        })
        return
      }
      this.patch({ loading: false, error: '', detail })
    } catch (error) {
      if (seq !== this.requestSeq || this.state.openId !== ticketId) return
      this.patch({
        loading: false,
        error: this.options.describeError(error),
        detail: null,
      })
    }
  }

  async submitReply(ticketId: string, body: string): Promise<boolean> {
    const text = body.trim()
    if (!text || this.state.submittingId) return false
    const fingerprint = text
    const existing = this.replyOperations.get(ticketId)
    const operation =
      existing && existing.fingerprint === fingerprint
        ? existing
        : { key: this.options.createIdempotencyKey(), fingerprint }
    this.replyOperations.set(ticketId, operation)

    this.patch({
      submittingId: ticketId,
      submitErrors: { ...this.state.submitErrors, [ticketId]: '' },
    })
    try {
      const detail = await this.options.reply(ticketId, text, operation.key)
      this.replyOperations.delete(ticketId)
      const drafts = { ...this.state.drafts }
      delete drafts[ticketId]
      const submitErrors = { ...this.state.submitErrors }
      delete submitErrors[ticketId]
      const next: Partial<SupportTicketDetailState> = { drafts, submitErrors }
      if (this.state.openId === ticketId) {
        if (isDetailFor(detail, ticketId)) {
          next.detail = detail
          next.error = ''
          next.loading = false
        } else {
          next.detail = null
          next.error = '回复已提交，但服务端返回的工单与目标不一致；请刷新确认'
        }
      }
      this.patch(next)
      return true
    } catch (error) {
      const message = this.options.describeError(error)
      this.patch({
        submitErrors: { ...this.state.submitErrors, [ticketId]: message },
      })
      return false
    } finally {
      this.patch({ submittingId: null })
    }
  }
}
